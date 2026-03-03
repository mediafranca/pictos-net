/**
 * VectorizerModal — full-screen bitmap-to-SVG preview and parameter tuning.
 *
 * Uses the official vtracer WASM (visioncortex) with:
 * - Progressive rendering: WASM writes paths directly to a visible <svg> element
 * - Desynchronized model: sliders don't auto-retrace; explicit "Trazar" button
 * - Presets: B&W, Pictogram, Poster, Photo
 * - Hierarchical modes: Stacked / Cutout (color mode only)
 *
 * Region ID: #vectorizer-modal
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, RefreshCw, Download, Check, AlertTriangle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import {
    traceInteractive,
    drawBitmapToCanvas,
    preloadWasm,
    DEFAULT_CONFIG,
    PRESETS,
    type VectorizerConfig,
    type VectorizerResult,
} from '../services/vtracerService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VectorizerModalProps {
    isOpen: boolean;
    bitmap: string;
    utterance: string;
    initialConfig?: Partial<VectorizerConfig>;
    onClose: () => void;
    onApply: (result: VectorizerResult) => void;
}

type TraceState = 'idle' | 'tracing' | 'done' | 'error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CANVAS_ID = 'vtracer-canvas';
const SVG_ID = 'vtracer-svg';

function bitmapSrc(base64: string): string {
    return base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
}

function downloadSvgBlob(svg: string, filename: string) {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function sanitizeName(s: string) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

function configsEqual(a: VectorizerConfig, b: VectorizerConfig): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// LabeledSlider
// ---------------------------------------------------------------------------

interface LabeledSliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    leftLabel: string;
    rightLabel: string;
    debugValue?: boolean;
    onChange: (v: number) => void;
    disabled?: boolean;
}

function LabeledSlider({
    label, value, min, max, step, leftLabel, rightLabel, debugValue = true, onChange, disabled
}: LabeledSliderProps) {
    return (
        <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400">{label}</p>
                {debugValue && (
                    <span className="text-[10px] font-mono text-slate-300">{value}</span>
                )}
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                disabled={disabled}
                onChange={e => onChange(parseFloat(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ accentColor: '#7c3aed', backgroundColor: '#e2e8f0' }}
            />
            <div className="flex justify-between mt-1">
                <span className="text-[9px] text-slate-400">{leftLabel}</span>
                <span className="text-[9px] text-slate-400">{rightLabel}</span>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// SegmentGroup
// ---------------------------------------------------------------------------

interface SegmentGroupProps<T extends string> {
    label: string;
    value: T;
    options: { label: string; value: T; title?: string }[];
    onChange: (v: T) => void;
    disabled?: boolean;
}

function SegmentGroup<T extends string>({
    label, value, options, onChange, disabled
}: SegmentGroupProps<T>) {
    return (
        <div className="mb-4">
            <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400 mb-1.5">{label}</p>
            <div className="flex rounded overflow-hidden border border-slate-200 text-[10px]">
                {options.map((opt, i) => (
                    <button
                        key={String(opt.value)}
                        disabled={disabled}
                        title={opt.title}
                        onClick={() => onChange(opt.value)}
                        className={`flex-1 px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium
                            ${i > 0 ? 'border-l border-slate-200' : ''}
                            ${value === opt.value
                                ? 'bg-violet-600 text-white'
                                : 'bg-white text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// PresetChips
// ---------------------------------------------------------------------------

const PRESET_LABELS: { key: string; label: string }[] = [
    { key: 'bw', label: 'B&W' },
    { key: 'pictogram', label: 'Pictogram' },
    { key: 'poster', label: 'Poster' },
    { key: 'photo', label: 'Photo' },
];

function PresetChips({
    onSelect, disabled
}: { onSelect: (config: Partial<VectorizerConfig>) => void; disabled?: boolean }) {
    return (
        <div className="mb-4">
            <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400 mb-1.5">Presets</p>
            <div className="flex flex-wrap gap-1.5">
                {PRESET_LABELS.map(({ key, label }) => (
                    <button
                        key={key}
                        disabled={disabled}
                        onClick={() => onSelect(PRESETS[key])}
                        className="px-3 py-1 text-[10px] font-medium bg-white border border-slate-200 text-slate-600 rounded hover:border-violet-300 hover:text-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {label}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const VectorizerModal: React.FC<VectorizerModalProps> = ({
    isOpen,
    bitmap,
    utterance,
    initialConfig,
    onClose,
    onApply,
}) => {
    const [config, setConfig] = useState<VectorizerConfig>({
        ...DEFAULT_CONFIG,
        ...initialConfig,
    });
    const [traceState, setTraceState] = useState<TraceState>('idle');
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<VectorizerResult | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);

    const isMounted = useRef(false);
    const lastTracedConfig = useRef<VectorizerConfig | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);

    const updateConfig = useCallback((partial: Partial<VectorizerConfig>) => {
        setConfig(prev => {
            const next = { ...prev, ...partial };
            setIsDirty(!configsEqual(next, lastTracedConfig.current ?? {}));
            return next;
        });
    }, []);

    // Preload WASM and prepare canvas on open
    useEffect(() => {
        isMounted.current = true;
        if (!isOpen) return;

        setConfig({ ...DEFAULT_CONFIG, ...initialConfig });
        setTraceState('idle');
        setResult(null);
        setErrorMsg('');
        setIsDirty(false);
        lastTracedConfig.current = null;

        // Preload WASM while image loads
        preloadWasm();

        // Draw bitmap to canvas after DOM is ready
        const timer = setTimeout(async () => {
            try {
                const dims = await drawBitmapToCanvas(bitmap, CANVAS_ID);
                if (!isMounted.current) return;
                setImageDims(dims);
                // Set viewBox on the SVG element
                if (svgRef.current) {
                    svgRef.current.setAttribute('viewBox', `0 0 ${dims.width} ${dims.height}`);
                }
                // Auto-trace on first open
                runTrace({ ...DEFAULT_CONFIG, ...initialConfig });
            } catch (err) {
                console.error('[VectorizerModal] Failed to draw bitmap:', err);
            }
        }, 50);

        return () => {
            isMounted.current = false;
            clearTimeout(timer);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const runTrace = useCallback(async (cfg: VectorizerConfig) => {
        if (!isMounted.current) return;
        setTraceState('tracing');
        setProgress(0);
        setErrorMsg('');

        // Clear previous SVG paths
        const svgEl = document.getElementById(SVG_ID);
        if (svgEl) {
            while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
        }

        // Redraw canvas (WASM reads from it)
        try {
            await drawBitmapToCanvas(bitmap, CANVAS_ID);
        } catch { /* canvas already drawn */ }

        try {
            await traceInteractive(
                CANVAS_ID,
                SVG_ID,
                cfg,
                (p) => { if (isMounted.current) setProgress(p); }
            );
            if (!isMounted.current) return;

            // Serialize the SVG from DOM
            const svgEl = document.getElementById(SVG_ID);
            const svg = svgEl ? new XMLSerializer().serializeToString(svgEl) : '';
            const pathCount = svgEl?.querySelectorAll('path').length ?? 0;

            const res: VectorizerResult = {
                svg,
                warnings: [],
                layersTraced: pathCount,
                layersTotal: pathCount,
                tiersUsed: 1,
                usedConfig: cfg,
            };
            setResult(res);
            setTraceState('done');
            lastTracedConfig.current = cfg;
            setIsDirty(false);
        } catch (err) {
            if (!isMounted.current) return;
            const msg = err instanceof Error ? err.message : String(err);
            console.warn('[vtracer] Trace failed:', msg);
            setErrorMsg(msg);
            setTraceState('error');
        }
    }, [bitmap]);

    const handleRetrace = () => runTrace(config);

    const handleApply = () => {
        if (result) { onApply(result); onClose(); }
    };

    const handleDownload = () => {
        if (result?.svg) downloadSvgBlob(result.svg, `${sanitizeName(utterance)}_vectorized.svg`);
    };

    const handlePreset = (preset: Partial<VectorizerConfig>) => {
        const merged = { ...DEFAULT_CONFIG, ...preset };
        setConfig(merged);
        setIsDirty(true);
    };

    const isTracing = traceState === 'tracing';
    const mode = config.mode ?? 'spline';
    const colorMode = config.colorMode ?? 'color';

    if (!isOpen) return null;

    return (
        <div
            id="vectorizer-modal"
            className="fixed inset-0 z-[50] flex flex-col bg-white animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            aria-label={`Vectorizer — ${utterance}`}
        >
            {/* Header */}
            <header className="flex items-center justify-between px-6 h-14 border-b border-slate-200 shrink-0 bg-white">
                <div className="flex items-center gap-3 min-w-0">
                    <span className="text-slate-900 font-bold text-sm uppercase tracking-widest">Vectorizer</span>
                    <span className="text-slate-400 text-sm truncate">— "{utterance}"</span>
                    {traceState === 'done' && result && (
                        <span className="text-[10px] font-mono text-slate-400 ml-2">
                            {result.layersTraced} paths
                            {result.tiersUsed > 1 && ` · tier ${result.tiersUsed}`}
                        </span>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                    title="Close"
                >
                    <X size={16} />
                </button>
            </header>

            {/* Body */}
            <div className="flex flex-1 overflow-hidden">

                {/* Left: Controls */}
                <div
                    id="vectorizer-controls"
                    className="w-72 shrink-0 bg-slate-50 border-r border-slate-200 flex flex-col overflow-y-auto"
                >
                    <div className="flex-1 p-5">

                        {/* Presets */}
                        <PresetChips onSelect={handlePreset} disabled={isTracing} />

                        {/* Curve mode */}
                        <SegmentGroup
                            label="Curve Mode"
                            value={mode as 'polygon' | 'spline'}
                            disabled={isTracing}
                            options={[
                                { label: 'Polygon', value: 'polygon' as const, title: 'Sharp corners, geometric shapes' },
                                { label: 'Spline', value: 'spline' as const, title: 'Smooth curves' },
                            ]}
                            onChange={v => updateConfig({ mode: v })}
                        />

                        {/* Color mode */}
                        <SegmentGroup
                            label="Color Mode"
                            value={colorMode as 'color' | 'bw'}
                            disabled={isTracing}
                            options={[
                                { label: 'Color', value: 'color' as const, title: 'Multi-color hierarchical clustering' },
                                { label: 'B&W', value: 'bw' as const, title: 'Single black binary trace' },
                            ]}
                            onChange={v => updateConfig({ colorMode: v })}
                        />

                        {/* Color-specific params */}
                        {colorMode === 'color' && (
                            <>
                                <SegmentGroup
                                    label="Hierarchical"
                                    value={(config.hierarchical ?? 'stacked') as 'stacked' | 'cutout'}
                                    disabled={isTracing}
                                    options={[
                                        { label: 'Stacked', value: 'stacked' as const, title: 'Layered overlapping shapes' },
                                        { label: 'Cutout', value: 'cutout' as const, title: 'Non-overlapping shapes' },
                                    ]}
                                    onChange={v => updateConfig({ hierarchical: v })}
                                />
                                <LabeledSlider
                                    label="Color Precision"
                                    value={config.colorPrecision ?? 6}
                                    min={1} max={8} step={1}
                                    leftLabel="Fewer colors"
                                    rightLabel="More colors"
                                    disabled={isTracing}
                                    onChange={v => updateConfig({ colorPrecision: v })}
                                />
                                <LabeledSlider
                                    label="Layer Difference"
                                    value={config.layerDifference ?? 16}
                                    min={0} max={128} step={4}
                                    leftLabel="More layers"
                                    rightLabel="Fewer layers"
                                    disabled={isTracing}
                                    onChange={v => updateConfig({ layerDifference: v })}
                                />
                            </>
                        )}

                        {/* Advanced (collapsible) */}
                        <button
                            onClick={() => setAdvancedOpen(v => !v)}
                            className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors mt-1 mb-3 w-full"
                        >
                            {advancedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            Advanced
                        </button>

                        {advancedOpen && (
                            <div className="border-t border-slate-200 pt-4">
                                <LabeledSlider
                                    label="Noise Removal"
                                    value={config.filterSpeckle ?? 4}
                                    min={0} max={16} step={1}
                                    leftLabel="Keep detail"
                                    rightLabel="Remove specks"
                                    disabled={isTracing}
                                    onChange={v => updateConfig({ filterSpeckle: v })}
                                />
                                <LabeledSlider
                                    label="Corner Sharpness"
                                    value={config.cornerThreshold ?? 60}
                                    min={10} max={180} step={5}
                                    leftLabel="Smooth"
                                    rightLabel="Sharp corners"
                                    disabled={isTracing}
                                    onChange={v => updateConfig({ cornerThreshold: v })}
                                />
                                <LabeledSlider
                                    label="Path Detail"
                                    value={config.lengthThreshold ?? 4}
                                    min={1} max={10} step={0.5}
                                    leftLabel="More detail"
                                    rightLabel="Simplified"
                                    disabled={isTracing}
                                    onChange={v => updateConfig({ lengthThreshold: v })}
                                />
                                <LabeledSlider
                                    label="Path Joining"
                                    value={config.spliceThreshold ?? 45}
                                    min={10} max={90} step={5}
                                    leftLabel="Keep separate"
                                    rightLabel="Join paths"
                                    disabled={isTracing}
                                    onChange={v => updateConfig({ spliceThreshold: v })}
                                />
                                <LabeledSlider
                                    label="Coordinate Precision"
                                    value={config.pathPrecision ?? 8}
                                    min={1} max={8} step={1}
                                    leftLabel="Compact"
                                    rightLabel="Precise"
                                    disabled={isTracing}
                                    onChange={v => updateConfig({ pathPrecision: v })}
                                />
                            </div>
                        )}
                    </div>

                    {/* Action buttons */}
                    <div className="p-5 border-t border-slate-200 space-y-2 shrink-0">
                        <button
                            onClick={handleRetrace}
                            disabled={isTracing}
                            className={`w-full flex items-center justify-center gap-2 border px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed
                                ${isDirty && !isTracing
                                    ? 'border-violet-400 text-violet-700 bg-violet-50 hover:bg-violet-100'
                                    : 'border-slate-200 text-slate-600 bg-white hover:border-slate-400 hover:text-slate-900'
                                }`}
                        >
                            <RefreshCw size={12} className={isTracing ? 'animate-spin' : ''} />
                            Trazar
                            {isDirty && !isTracing && (
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                            )}
                        </button>

                        <button
                            onClick={handleDownload}
                            disabled={!result?.svg || isTracing}
                            className="w-full flex items-center justify-center gap-2 border border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900 bg-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Download size={12} />
                            Download SVG
                        </button>

                        <button
                            onClick={handleApply}
                            disabled={!result?.svg || isTracing}
                            className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Check size={12} />
                            Apply
                        </button>
                    </div>
                </div>

                {/* Right: Split preview */}
                <div
                    id="vectorizer-preview"
                    className="flex-1 flex flex-col overflow-hidden bg-white"
                >
                    {/* Progress bar */}
                    {isTracing && (
                        <div className="shrink-0 px-6 py-3 border-b border-slate-200 flex items-center gap-4 bg-slate-50">
                            <Loader2 size={14} className="animate-spin text-violet-500 shrink-0" />
                            <div className="flex-1">
                                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                    <div
                                        className="bg-violet-500 h-full transition-all duration-300 ease-out"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>
                            <span className="text-[10px] font-mono text-violet-600 shrink-0">{progress}%</span>
                        </div>
                    )}

                    {/* Warning banner */}
                    {traceState === 'done' && result && result.warnings.length > 0 && (
                        <div className="shrink-0 px-6 py-2 bg-amber-50 border-b border-amber-200 flex items-start gap-2">
                            <AlertTriangle size={12} className="text-amber-500 mt-0.5 shrink-0" />
                            <div className="text-[10px] text-amber-700">
                                {result.warnings.map((w, i) => <div key={i}>{w}</div>)}
                            </div>
                        </div>
                    )}

                    {/* Error banner */}
                    {traceState === 'error' && (
                        <div className="shrink-0 px-6 py-2 bg-red-50 border-b border-red-200 flex items-center gap-2">
                            <AlertTriangle size={12} className="text-red-500 shrink-0" />
                            <p className="text-[10px] text-red-600 font-mono break-all">{errorMsg}</p>
                        </div>
                    )}

                    {/* Split panels */}
                    <div className="flex-1 flex overflow-hidden">
                        {/* Original bitmap (canvas — WASM reads from here) */}
                        <div
                            id="vectorizer-original"
                            className="flex-1 flex flex-col overflow-hidden border-r border-slate-200"
                        >
                            <p className="text-[9px] font-medium uppercase tracking-widest text-slate-400 px-4 py-2 border-b border-slate-200 shrink-0 bg-slate-50">
                                Original
                            </p>
                            <div className="flex-1 flex items-center justify-center p-6 overflow-auto bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%228%22%20height%3D%228%22%20fill%3D%22%23f1f5f9%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%228%22%20width%3D%228%22%20height%3D%228%22%20fill%3D%22%23f1f5f9%22%2F%3E%3C%2Fsvg%3E')]">
                                <canvas
                                    id={CANVAS_ID}
                                    className="max-w-full max-h-full object-contain drop-shadow-sm"
                                />
                            </div>
                        </div>

                        {/* SVG result (WASM writes paths directly here) */}
                        <div
                            id="vectorizer-result"
                            className="flex-1 flex flex-col overflow-hidden"
                        >
                            <p className="text-[9px] font-medium uppercase tracking-widest text-slate-400 px-4 py-2 border-b border-slate-200 shrink-0 bg-slate-50">
                                SVG Result
                            </p>
                            <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
                                <svg
                                    id={SVG_ID}
                                    ref={svgRef}
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox={imageDims ? `0 0 ${imageDims.width} ${imageDims.height}` : '0 0 100 100'}
                                    className="max-w-full max-h-full w-full h-full"
                                />
                                {traceState === 'idle' && (
                                    <p className="absolute text-xs text-slate-400">Starting...</p>
                                )}
                                {traceState === 'error' && (
                                    <div className="absolute flex flex-col items-center gap-3 text-slate-400">
                                        <AlertTriangle size={32} className="text-red-400" />
                                        <p className="text-xs text-red-500">Trace failed — adjust settings and retry</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VectorizerModal;
