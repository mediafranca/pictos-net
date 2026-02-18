/**
 * VTracer Service - Raster to Vector Conversion
 *
 * Uses the vectortracer WASM package to convert bitmap images (PNG)
 * into SVG vector graphics. Supports per-color-layer tracing so that
 * the output preserves the original flat colors of the input image.
 *
 * @module services/vtracerService
 */

import {
    BinaryImageConverter,
    type BinaryImageConverterParams,
    type Options
} from "vectortracer";

/**
 * Configuration options for vectorization
 * These defaults are optimized for pictograms (high contrast, flat shapes)
 */
export interface VectorizerConfig {
    /** Curve fitting mode: 'polygon', 'spline', or 'none' */
    mode?: 'polygon' | 'spline' | 'none';
    /** Minimum momentary angle (degrees) to be considered a corner */
    cornerThreshold?: number;
    /** Minimum segment length for path simplification */
    lengthThreshold?: number;
    /** Maximum iterations for path optimization */
    maxIterations?: number;
    /** Minimum angle displacement (degrees) to splice a spline */
    spliceThreshold?: number;
    /** Discard patches smaller than X pixels (noise removal) */
    filterSpeckle?: number;
    /** Decimal precision for path coordinates */
    pathPrecision?: number;
    /** Enable debug mode (slower) */
    debug?: boolean;
}

/**
 * Default configuration optimized for pictograms.
 *
 * 'polygon' mode is preferred over 'spline': pictograms are geometric
 * (straight lines, right angles, simple curves) and spline mode
 * over-smooths them into organic blob shapes.
 */
const DEFAULT_CONFIG: VectorizerConfig = {
    mode: 'polygon',          // Preserves straight lines & corners
    filterSpeckle: 8,         // Removes noise (pictograms are clean)
    cornerThreshold: 45,      // More corners detected = better fidelity
    lengthThreshold: 3.0,     // Shorter min segments = more detail
    maxIterations: 15,
    spliceThreshold: 45,
    pathPrecision: 2,
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
}

/**
 * Find all unique (quantized) foreground colors in the image.
 * Skips fully transparent pixels and near-white background pixels.
 */
function extractColorLayers(imageData: ImageData): Map<string, ColorLayer> {
    const { data } = imageData;
    const colorMap = new Map<string, ColorLayer>();

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 32) continue;                         // Skip transparent
        if (r > 230 && g > 230 && b > 230) continue; // Skip near-white background

        const qr = quantizeChannel(r);
        const qg = quantizeChannel(g);
        const qb = quantizeChannel(b);
        const key = `${qr},${qg},${qb}`;

        if (!colorMap.has(key)) {
            colorMap.set(key, { hex: toHex(qr, qg, qb), r: qr, g: qg, b: qb });
        }
    }

    return colorMap;
}

/**
 * Build a binary ImageData mask where pixels belonging to the target
 * (quantized) color are black and everything else is white.
 */
function createBinaryMask(imageData: ImageData, targetR: number, targetG: number, targetB: number): ImageData {
    const { data, width, height } = imageData;
    const maskData = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];

        let isTarget = false;
        if (a >= 32 && !(r > 230 && g > 230 && b > 230)) {
            isTarget = quantizeChannel(r) === targetR
                    && quantizeChannel(g) === targetG
                    && quantizeChannel(b) === targetB;
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
const MAX_COLOR_LAYERS = 16;

async function vectorizeBitmapMulticolor(
    base64Png: string,
    config: VectorizerConfig,
    onProgress?: (progress: number) => void
): Promise<string> {
    const imageData = await base64ToImageData(base64Png);
    const { width, height } = imageData;

    const colorLayers = extractColorLayers(imageData);

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
        const mask = createBinaryMask(imageData, r, g, b);

        try {
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

    try {
        return await vectorizeBitmapMulticolor(base64Png, finalConfig, onProgress);
    } catch (error) {
        // If multicolor failed with 'polygon', try 'spline' as fallback
        if (finalConfig.mode === 'polygon') {
            console.warn('[vtracer] Polygon mode failed, retrying with spline...', error);
            const fallbackConfig = { ...finalConfig, mode: 'spline' as const };
            if (onProgress) onProgress(0);
            return await vectorizeBitmapMulticolor(base64Png, fallbackConfig, onProgress);
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
