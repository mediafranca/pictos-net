/**
 * VTracer Service - Raster to Vector Conversion
 *
 * Uses the `vectortracer` WASM package (v0.1.2) which wraps vtracer's
 * binary trace only — it exposes `BinaryImageConverter` with no native
 * color mode. Color tracing is implemented manually: we extract unique
 * colors, build a binary mask per color layer, trace each mask with
 * BinaryImageConverter, then assemble the final multicolor SVG.
 *
 * Parameter semantics follow the vtracer documentation:
 *   - colorPrecision: bits per RGB channel (like CLI --color_precision).
 *     step = round(256 / 2^bits). Default 4 bits = step 16.
 *   - gradientStep: minimum color distance between kept layers
 *     (like CLI --gradient_step). Default 16.
 *   - Binary converter params mirror CLI flags directly.
 *
 * @module services/vtracerService
 */

import {
    BinaryImageConverter,
    type BinaryImageConverterParams,
    type Options
} from "vectortracer";

/**
 * Configuration options for vectorization.
 * Names mirror vtracer CLI/Python flags where possible.
 */
export interface VectorizerConfig {
    /**
     * Curve fitting mode (vtracer --mode).
     * 'spline' — smooth Bézier curves, best for icons/posters.
     * 'polygon' — simplified straight segments, geometric shapes.
     * 'none' — raw pixel-aligned contours.
     * Default: 'spline' (recommended by vtracer docs for flat-color icons).
     */
    mode?: 'polygon' | 'spline' | 'none';

    /**
     * Color mode: 'auto' uses per-layer color tracing (multicolor output);
     * 'bw' forces single-layer binary tracing (black paths only).
     * NOTE: the `vectortracer` npm package only exposes BinaryImageConverter.
     * Multicolor output is achieved via manual per-layer masking.
     */
    colorMode?: 'auto' | 'bw';

    /**
     * Color precision in bits per RGB channel (vtracer --color_precision).
     * Quantization step = round(256 / 2^bits).
     *   4 bits → step 16 (default, good for JPEG bitmaps)
     *   5 bits → step  8 (fine, more layers)
     *   3 bits → step 32 (coarse, fewer layers)
     * Default: 4
     */
    colorPrecision?: number;

    /**
     * Minimum Euclidean color distance between kept layers
     * (vtracer --gradient_step / layer_difference).
     * Layers closer than this to an already-kept layer are merged into it.
     * Default: 16
     */
    gradientStep?: number;

    /** Minimum momentary angle (degrees) to be considered a corner (vtracer --corner_threshold). Default: 60 */
    cornerThreshold?: number;
    /** Max segment length in smoothing subdivision (vtracer --segment_length). Default: 4.0 */
    lengthThreshold?: number;
    /** Maximum smoothing iterations. Default: 10 */
    maxIterations?: number;
    /** Minimum angle displacement (degrees) to splice a spline (vtracer --splice_threshold). Default: 45 */
    spliceThreshold?: number;
    /** Discard patches smaller than X pixels (vtracer --filter_speckle). Default: 4 */
    filterSpeckle?: number;
    /** Decimal precision for path coordinates (vtracer --path_precision). Default: 3 */
    pathPrecision?: number;
    /** Enable debug mode (slower). */
    debug?: boolean;
}

/**
 * Default configuration based on vtracer documentation recommendations
 * for flat-color icons / posters.
 *
 * Key doc insight: for flat-color icons, `spline` mode with
 * cornerThreshold=60 and segmentLength≈4 produces the best compact paths.
 */
const DEFAULT_CONFIG: VectorizerConfig = {
    mode: 'spline',           // Docs recommend spline for flat-color icons/posters
    colorPrecision: 4,        // 4 bits = step 16 (matches vtracer 4-bit color precision)
    gradientStep: 16,         // Merge color layers within distance 16 (vtracer default)
    filterSpeckle: 4,         // vtracer default; 8 was too aggressive for thin lines
    cornerThreshold: 60,      // vtracer default; 45 detected too many false corners
    lengthThreshold: 4.0,     // vtracer default
    maxIterations: 10,        // vtracer default
    spliceThreshold: 45,      // vtracer default
    pathPrecision: 3,         // slightly more precision than our previous 2
    debug: false,
};

// ---------------------------------------------------------------------------
// Image utilities
// ---------------------------------------------------------------------------

/**
 * Convert a Base64 PNG image to ImageData.
 * Uses OffscreenCanvas if available, falls back to regular canvas.
 */
async function base64ToImageData(base64: string): Promise<ImageData> {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            let canvas: HTMLCanvasElement | OffscreenCanvas;
            let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

            if (typeof OffscreenCanvas !== 'undefined') {
                canvas = new OffscreenCanvas(img.width, img.height);
                ctx = canvas.getContext('2d');
            } else {
                canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx = canvas.getContext('2d');
            }

            if (!ctx) {
                reject(new Error('Failed to get canvas 2D context'));
                return;
            }

            ctx.drawImage(img, 0, 0);
            resolve(ctx.getImageData(0, 0, img.width, img.height));
        };

        img.onerror = () => reject(new Error('Failed to load image from Base64'));
        img.src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
    });
}

// ---------------------------------------------------------------------------
// Color utilities
// ---------------------------------------------------------------------------

/** Quantize a channel value to the nearest multiple of `step` */
function quantizeChannel(c: number, step = 32): number {
    return Math.min(255, Math.round(c / step) * step);
}

function toHex(r: number, g: number, b: number): string {
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

interface ColorLayer {
    hex: string;
    r: number;
    g: number;
    b: number;
    count: number; // pixel count — used to filter JPEG artifacts
}

/**
 * Minimum pixel count for a quantized color to be considered a real layer.
 * JPEG artifacts at color boundaries appear in very few pixels.
 * Real pictogram colors (fills, outlines) cover hundreds to thousands of pixels.
 * 100px ≈ 0.016% of an 800×800 image — safely keeps even thin lines.
 */
const MIN_LAYER_PIXELS = 100;

/** Euclidean color distance between two RGB triples */
function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/**
 * Find unique foreground color layers in the image, applying:
 * 1. Pixel-level skips: transparent + near-white original pixels.
 * 2. Quantized near-white skip: quantized values all ≥ 224 are invisible on white bg.
 * 3. Pixel count filter: removes JPEG artifact colors (< MIN_LAYER_PIXELS pixels).
 * 4. Gradient-step merge: merges color layers closer than `gradientStep`
 *    (Euclidean distance) — mirrors vtracer's --gradient_step / layer_difference.
 *
 * @param colorPrecision - bits per RGB channel (1–8, default 4 → step 16)
 * @param gradientStep   - min color distance between kept layers (default 16)
 */
function extractColorLayers(
    imageData: ImageData,
    colorPrecision: number = 4,
    gradientStep: number = 16
): Map<string, ColorLayer> {
    const step = Math.round(256 / Math.pow(2, colorPrecision));
    const { data } = imageData;
    const colorMap = new Map<string, ColorLayer>();

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 32) continue;                         // Skip transparent
        if (r > 230 && g > 230 && b > 230) continue; // Skip near-white background

        const qr = quantizeChannel(r, step);
        const qg = quantizeChannel(g, step);
        const qb = quantizeChannel(b, step);

        // Skip quantized near-white — invisible on white backgrounds
        if (qr >= 224 && qg >= 224 && qb >= 224) continue;

        const key = `${qr},${qg},${qb}`;
        const existing = colorMap.get(key);
        if (existing) {
            existing.count++;
        } else {
            colorMap.set(key, { hex: toHex(qr, qg, qb), r: qr, g: qg, b: qb, count: 1 });
        }
    }

    // Pass 1: remove sparse artifact colors
    for (const [key, layer] of colorMap) {
        if (layer.count < MIN_LAYER_PIXELS) {
            colorMap.delete(key);
        }
    }

    // Pass 2: gradient-step merge — mirrors vtracer's layer_difference.
    // Sort layers by descending pixel count (dominant colors first).
    // For each layer, if it's within `gradientStep` distance of a larger layer, discard it.
    if (gradientStep > 0) {
        const sorted = Array.from(colorMap.values()).sort((a, b) => b.count - a.count);
        const kept: ColorLayer[] = [];
        for (const layer of sorted) {
            const tooClose = kept.some(k =>
                colorDistance(layer.r, layer.g, layer.b, k.r, k.g, k.b) < gradientStep
            );
            if (!tooClose) kept.push(layer);
        }
        // Rebuild map with only kept layers
        colorMap.clear();
        for (const layer of kept) {
            colorMap.set(`${layer.r},${layer.g},${layer.b}`, layer);
        }
    }

    return colorMap;
}

/**
 * Build a binary ImageData mask where pixels belonging to the target
 * (quantized) color are black and everything else is white.
 * @param colorPrecision - Must match the value used in extractColorLayers.
 * @param gradientStep   - Pixels within this Euclidean distance of the target
 *   are also treated as the target, capturing JPEG boundary artifacts that
 *   didn't get their own layer.
 */
function createBinaryMask(
    imageData: ImageData,
    targetR: number, targetG: number, targetB: number,
    colorPrecision: number = 4,
    gradientStep: number = 16
): ImageData {
    const step = Math.round(256 / Math.pow(2, colorPrecision));
    const { data, width, height } = imageData;
    const maskData = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];

        let isTarget = false;
        if (a >= 32 && !(r > 230 && g > 230 && b > 230)) {
            const qr = quantizeChannel(r, step);
            const qg = quantizeChannel(g, step);
            const qb = quantizeChannel(b, step);
            // Exact match on the quantized bucket, OR within gradientStep distance
            // of the target — captures boundary artifacts that belong to this layer.
            isTarget = (qr === targetR && qg === targetG && qb === targetB)
                    || colorDistance(r, g, b, targetR, targetG, targetB) < gradientStep;
        }

        const v = isTarget ? 0 : 255;
        maskData[i] = v; maskData[i + 1] = v; maskData[i + 2] = v;
        maskData[i + 3] = 255;
    }

    return new ImageData(maskData, width, height);
}

/**
 * Extract <path> elements from an SVG string using DOM parsing.
 *
 * vtracer formats paths across multiple lines, which breaks naive regex
 * matching. DOMParser handles this correctly.
 */
function extractPathElements(svgString: string): string[] {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');
        if (!svgEl) return [];

        const paths = svgEl.querySelectorAll('path');
        if (paths.length === 0) return [];

        const serializer = new XMLSerializer();
        return Array.from(paths).map(p => {
            // XMLSerializer adds redundant xmlns on child elements — strip it
            return serializer.serializeToString(p).replace(/ xmlns="[^"]*"/g, '');
        });
    } catch {
        return [];
    }
}

/**
 * Inject a viewBox attribute into an SVG string if one is not already present.
 * vtracer does not set viewBox; paths use translate() transforms positioned in
 * pixel coordinates matching the source image dimensions.
 */
function ensureViewBox(svgString: string, width: number, height: number): string {
    if (svgString.includes('viewBox')) return svgString;
    return svgString.replace(/(<svg\b[^>]*)>/, `$1 viewBox="0 0 ${width} ${height}">`);
}

// ---------------------------------------------------------------------------
// Single-layer tracer (binary)
// ---------------------------------------------------------------------------

async function traceLayer(
    maskImageData: ImageData,
    hexColor: string,
    config: VectorizerConfig
): Promise<string> {
    const converterParams: BinaryImageConverterParams = {
        debug: false,
        mode: config.mode,
        filterSpeckle: config.filterSpeckle,
        cornerThreshold: config.cornerThreshold,
        lengthThreshold: config.lengthThreshold,
        maxIterations: config.maxIterations,
        spliceThreshold: config.spliceThreshold,
        pathPrecision: config.pathPrecision,
    };

    const svgOptions: Options = {
        invert: false,
        pathFill: hexColor,
        backgroundColor: undefined,
        attributes: undefined,
        scale: 1,
    };

    const converter = new BinaryImageConverter(maskImageData, converterParams, svgOptions);

    return new Promise((resolve, reject) => {
        try {
            converter.init();
            const tick = () => {
                try {
                    const done = converter.tick();
                    if (!done) {
                        setTimeout(tick, 0);
                    } else {
                        const result = converter.getResult();
                        try { converter.free(); } catch (e) { console.warn('Free error:', e); }
                        resolve(result);
                    }
                } catch (err) {
                    try { converter.free(); } catch { /* ignore */ }
                    reject(err);
                }
            };
            setTimeout(tick, 0);
        } catch (err) {
            reject(err);
        }
    });
}

// ---------------------------------------------------------------------------
// Internal single-color (binary) tracer — kept as fallback
// ---------------------------------------------------------------------------

async function vectorizeBitmapInternal(
    base64Png: string,
    config: VectorizerConfig,
    onProgress?: (progress: number) => void
): Promise<string> {
    const imageData = await base64ToImageData(base64Png);
    const { width, height } = imageData;

    const converterParams: BinaryImageConverterParams = {
        debug: config.debug,
        mode: config.mode,
        filterSpeckle: config.filterSpeckle,
        cornerThreshold: config.cornerThreshold,
        lengthThreshold: config.lengthThreshold,
        maxIterations: config.maxIterations,
        spliceThreshold: config.spliceThreshold,
        pathPrecision: config.pathPrecision,
    };

    const svgOptions: Options = {
        invert: false,
        pathFill: '#000000',
        backgroundColor: undefined,
        attributes: undefined,
        scale: 1,
    };

    const converter = new BinaryImageConverter(imageData, converterParams, svgOptions);

    return new Promise((resolve, reject) => {
        try {
            converter.init();
            const tick = () => {
                try {
                    const done = converter.tick();
                    if (onProgress) onProgress(Math.round(converter.progress() * 100));
                    if (!done) {
                        setTimeout(tick, 0);
                    } else {
                        const result = converter.getResult();
                        try { converter.free(); } catch (e) { console.warn('Free error:', e); }
                        // vtracer does not set viewBox — inject it from image dimensions
                        resolve(ensureViewBox(result, width, height));
                    }
                } catch (err) {
                    try { converter.free(); } catch { /* ignore */ }
                    reject(err);
                }
            };
            setTimeout(tick, 0);
        } catch (err) {
            reject(err);
        }
    });
}

// ---------------------------------------------------------------------------
// Multicolor tracer
// ---------------------------------------------------------------------------

/**
 * Vectorize a bitmap using per-color-layer tracing so the output SVG
 * preserves the original flat colors.
 *
 * Algorithm:
 * 1. Detect unique foreground colors (skipping transparent + near-white bg).
 * 2. For each color, build a binary mask and run BinaryImageConverter.
 * 3. Extract <path> elements (via DOMParser, handles multi-line XML).
 * 4. Assemble final SVG with viewBox="0 0 {w} {h}" matching the input bitmap.
 *
 * Falls back to single-layer (black) tracing when:
 * - 0 foreground colors (all-white / all-transparent input).
 * - >MAX_COLOR_LAYERS colors (photo-like input, too expensive to layer-trace).
 * - Extracted path count is 0 (unexpected vtracer output format).
 */
const MAX_COLOR_LAYERS = 32;

async function vectorizeBitmapMulticolor(
    base64Png: string,
    config: VectorizerConfig,
    onProgress?: (progress: number) => void
): Promise<string> {
    const imageData = await base64ToImageData(base64Png);
    const { width, height } = imageData;

    const colorPrecision = config.colorPrecision ?? 4;
    const gradientStep   = config.gradientStep   ?? 16;
    const colorLayers = extractColorLayers(imageData, colorPrecision, gradientStep);

    console.info(
        `[vtracer] ${colorLayers.size} color layer(s) detected`,
        `(colorPrecision=${colorPrecision}→step${Math.round(256 / Math.pow(2, colorPrecision))}, gradientStep=${gradientStep}, image=${width}×${height})`,
        Array.from(colorLayers.values()).map(c => `${c.hex}(${c.count}px)`)
    );

    if (colorLayers.size === 0 || colorLayers.size > MAX_COLOR_LAYERS) {
        console.info(
            colorLayers.size === 0
                ? '[vtracer] No foreground colors — falling back to binary trace.'
                : `[vtracer] ${colorLayers.size} colors (>${MAX_COLOR_LAYERS}) — falling back to binary trace.`
        );
        return vectorizeBitmapInternal(base64Png, config, onProgress);
    }

    const colors = Array.from(colorLayers.values());
    const allPaths: string[] = [];

    for (let ci = 0; ci < colors.length; ci++) {
        const { hex, r, g, b } = colors[ci];

        try {
            const mask = createBinaryMask(imageData, r, g, b, colorPrecision, gradientStep);
            const layerSvg = await traceLayer(mask, hex, config);
            const paths = extractPathElements(layerSvg);
            allPaths.push(...paths);
        } catch (err) {
            console.warn(`[vtracer] Failed to trace color layer ${hex}:`, err);
        }

        if (onProgress) onProgress(Math.round(((ci + 1) / colors.length) * 100));
    }

    // If no paths were extracted, fall back to binary trace
    if (allPaths.length === 0) {
        console.warn('[vtracer] No paths extracted from color layers — falling back to binary trace.');
        return vectorizeBitmapInternal(base64Png, config, onProgress);
    }

    // viewBox exactly matches the source bitmap pixel dimensions
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
        ...allPaths,
        '</svg>',
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a bitmap image (Base64 PNG) to a color SVG using vtracer WASM.
 *
 * Uses per-color-layer tracing to preserve flat colors. Falls back to
 * binary (black) tracing when the image has no foreground colors or more
 * than 16 distinct colors (photo-like input).
 *
 * The output SVG always has a viewBox matching the input image pixel
 * dimensions (0 0 width height).
 *
 * @param base64Png  - Base64 PNG (with or without data URL prefix)
 * @param config     - Optional vectorization configuration
 * @param onProgress - Optional progress callback (0-100)
 */
export async function vectorizeBitmap(
    base64Png: string,
    config: Partial<VectorizerConfig> = {},
    onProgress?: (progress: number) => void
): Promise<string> {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };

    // colorMode: 'bw' skips per-layer color tracing entirely
    const traceFn = finalConfig.colorMode === 'bw'
        ? vectorizeBitmapInternal
        : vectorizeBitmapMulticolor;

    try {
        return await traceFn(base64Png, finalConfig, onProgress);
    } catch (error) {
        // If polygon mode failed, retry with spline as fallback
        if (finalConfig.mode === 'polygon') {
            console.warn('[vtracer] Polygon mode failed, retrying with spline...', error);
            const fallbackConfig = { ...finalConfig, mode: 'spline' as const };
            if (onProgress) onProgress(0);
            return await traceFn(base64Png, fallbackConfig, onProgress);
        }
        throw error;
    }
}

/**
 * Vectorize with a simple preset for pictograms
 */
export async function vectorizePictogram(base64Png: string): Promise<string> {
    return vectorizeBitmap(base64Png, {
        mode: 'polygon',
        filterSpeckle: 6,
        cornerThreshold: 45,
        lengthThreshold: 3.0,
        pathPrecision: 2,
    });
}

/**
 * Check if vectortracer is available
 */
export function isVectorizerAvailable(): boolean {
    try {
        return typeof BinaryImageConverter !== 'undefined';
    } catch {
        return false;
    }
}
