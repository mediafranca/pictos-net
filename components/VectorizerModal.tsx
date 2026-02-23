/**
 * VectorizerModal — full-screen bitmap-to-SVG preview and parameter tuning.
 *
 * Mirrors the UX of visioncortex.org/vtracer: split-view (original | result),
 * controls panel on the left, debounced auto-retrace on parameter changes.
 *
 * Rendered at the App.tsx level so `fixed inset-0` correctly covers the viewport.
 * Region ID: #vectorizer-modal
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, RefreshCw, Download, Check, AlertTriangle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { vectorizeBitmap, type VectorizerConfig, type VectorizerResult } from '../services/vtracerService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VectorizerModalProps {
    isOpen: boolean;
    bitmap: string;           // base64 PNG, with or without data: prefix
    utterance: string;
    initialConfig?: Partial<VectorizerConfig>;
    onClose: () => void;
    onApply: (result: VectorizerResult) => void;
}

type TraceState = 'idle' | 'tracing' | 'done' | 'error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULTS: Required<Pick<VectorizerConfig,
    'mode' | 'colorMode' | 'colorPrecision' | 'colorStep' | 'gradientStep' |
    'filterSpeckle' | 'cornerThreshold' | 'lengthThreshold' | 'spliceThreshold' | 'pathPrecision'
>> = {
    mode: 'spline',
    colorMode: 'bw',
    colorPrecision: 4,
    colorStep: 16,
    gradientStep: 16,
    filterSpeckle: 4,
    cornerThreshold: 60,
    lengthThreshold: 4.0,
    spliceThreshold: 45,
    pathPrecision: 3,
};

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

// ---------------------------------------------------------------------------
// LabeledSlider — replaces NumericStepper and segment groups for numeric params
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
// SegmentGroup — for mode toggles that have discrete named options
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
    // --- Config state ---
    const [mode, setMode] = useState<'polygon' | 'spline'>(initialConfig?.mode ?? DEFAULTS.mode);
    const [colorMode, setColorMode] = useState<'auto' | 'bw'>(initialConfig?.colorMode ?? DEFAULTS.colorMode);
    const [colorPrecision, setColorPrecision] = useState<number>(initialConfig?.colorPrecision ?? DEFAULTS.colorPrecision);
    const [colorStep, setColorStep] = useState<number>(initialConfig?.colorStep ?? DEFAULTS.colorStep);
    const [gradientStep, setGradientStep] = useState<number>(initialConfig?.gradientStep ?? DEFAULTS.gradientStep);
    const [filterSpeckle, setFilterSpeckle] = useState<number>(initialConfig?.filterSpeckle ?? DEFAULTS.filterSpeckle);
    const [cornerThreshold, setCornerThreshold] = useState<number>(initialConfig?.cornerThreshold ?? DEFAULTS.cornerThreshold);
    const [lengthThreshold, setLengthThreshold] = useState<number>(initialConfig?.lengthThreshold ?? DEFAULTS.lengthThreshold);
    const [spliceThreshold, setSpliceThreshold] = useState<number>(initialConfig?.spliceThreshold ?? DEFAULTS.spliceThreshold);
    const [pathPrecision, setPathPrecision] = useState<number>(initialConfig?.pathPrecision ?? DEFAULTS.pathPrecision);

    // --- Trace state ---
    const [traceState, setTraceState] = useState<TraceState>('idle');
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<VectorizerResult | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const debounceRef = useRef<ReturnType<typeof setTimeout>>();
    const isMounted = useRef(false);
    const isFirstRender = useRef(true);

    // Sync config when modal opens with a new initialConfig
    useEffect(() => {
        if (isOpen) {
            setMode(initialConfig?.mode ?? DEFAULTS.mode);
            setColorMode(initialConfig?.colorMode ?? DEFAULTS.colorMode);
            setColorPrecision(initialConfig?.colorPrecision ?? DEFAULTS.colorPrecision);
            setColorStep(initialConfig?.colorStep ?? DEFAULTS.colorStep);
            setGradientStep(initialConfig?.gradientStep ?? DEFAULTS.gradientStep);
            setFilterSpeckle(initialConfig?.filterSpeckle ?? DEFAULTS.filterSpeckle);
            setCornerThreshold(initialConfig?.cornerThreshold ?? DEFAULTS.cornerThreshold);
            setLengthThreshold(initialConfig?.lengthThreshold ?? DEFAULTS.lengthThreshold);
            setSpliceThreshold(initialConfig?.spliceThreshold ?? DEFAULTS.spliceThreshold);
            setPathPrecision(initialConfig?.pathPrecision ?? DEFAULTS.pathPrecision);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // --- Current config snapshot ---
    const currentConfig = useCallback((): Partial<VectorizerConfig> => ({
        mode, colorMode, colorStep, gradientStep,
        filterSpeckle, cornerThreshold, lengthThreshold, spliceThreshold, pathPrecision,
    }), [mode, colorMode, colorStep, gradientStep, filterSpeckle, cornerThreshold, lengthThreshold, spliceThreshold, pathPrecision]);

    // --- Core trace function ---
    const runTrace = useCallback(async (cfg: Partial<VectorizerConfig>) => {
        if (!isMounted.current) return;
        setTraceState('tracing');
        setProgress(0);
        setErrorMsg('');
        try {
            const res = await vectorizeBitmap(
                bitmap,
                cfg,
                (p) => { if (isMounted.current) setProgress(p); }
            );
            if (!isMounted.current) return;
            setResult(res);
            setTraceState('done');
        } catch (err) {
            if (!isMounted.current) return;
            setErrorMsg(err instanceof Error ? err.message : String(err));
            setTraceState('error');
        }
    }, [bitmap]);

    // Auto-run on open
    useEffect(() => {
        isMounted.current = true;
        isFirstRender.current = true;
        if (isOpen) {
            runTrace(currentConfig());
        }
        return () => { isMounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Debounced retrace on config change (skip initial render after open)
    useEffect(() => {
        if (!isOpen) return;
        if (isFirstRender.current) { isFirstRender.current = false; return; }
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => runTrace(currentConfig()), 600);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, colorMode, colorStep, gradientStep, filterSpeckle, cornerThreshold, lengthThreshold, spliceThreshold, pathPrecision]);

    const handleRetrace = () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        runTrace(currentConfig());
    };

    const handleApply = () => {
        if (result) { onApply(result); onClose(); }
    };

    const handleDownload = () => {
        if (result?.svg) downloadSvgBlob(result.svg, `${sanitizeName(utterance)}_vectorized.svg`);
    };

    const isTracing = traceState === 'tracing';

    if (!isOpen) return null;

    return (
        <div
            id="vectorizer-modal"
            className="fixed inset-0 z-[50] flex flex-col bg-white animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            aria-label={`Vectorizer — ${utterance}`}
        >
            {/* ── Header ── */}
            <header className="flex items-center justify-between px-6 h-14 border-b border-slate-200 shrink-0 bg-white">
                <div className="flex items-center gap-3 min-w-0">
                    <span className="text-slate-900 font-bold text-sm uppercase tracking-widest">Vectorizer</span>
                    <span className="text-slate-400 text-sm truncate">— "{utterance}"</span>
                    {traceState === 'done' && result && (
                        <span className="text-[10px] font-mono text-slate-400 ml-2">
                            {result.layersTraced}/{result.layersTotal} layers · tier {result.tiersUsed}
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

            {/* ── Body ── */}
            <div className="flex flex-1 overflow-hidden">

                {/* ── Left: Controls panel ── */}
                <div
                    id="vectorizer-controls"
                    className="w-72 shrink-0 bg-slate-50 border-r border-slate-200 flex flex-col overflow-y-auto"
                >
                    <div className="flex-1 p-5">

                        {/* Curve mode */}
                        <SegmentGroup
                            label="Curve Mode"
                            value={mode}
                            disabled={isTracing}
                            options={[
                                { label: 'Polygon', value: 'polygon' as const, title: 'Sharp corners, geometric shapes' },
                                { label: 'Spline', value: 'spline' as const, title: 'Smooth curves (may panic on parallel lines — auto-retries)' },
                            ]}
                            onChange={setMode}
                        />

                        {/* Color mode */}
                        <SegmentGroup
                            label="Color Mode"
                            value={colorMode}
                            disabled={isTracing}
                            options={[
                                { label: 'Auto', value: 'auto' as const, title: 'Per-color-layer tracing — preserves original colors' },
                                { label: 'B&W', value: 'bw' as const, title: 'Single black binary trace — fastest, most robust' },
                            ]}
                            onChange={setColorMode}
                        />

                        {/* Color-specific params — only in Auto mode */}
                        {colorMode === 'auto' && (
                            <>
                                <LabeledSlider
                                    label="Color Detail"
                                    value={52 - colorStep}
                                    min={4} max={48} step={4}
                                    leftLabel="Fewer colors"
                                    rightLabel="More colors"
                                    disabled={isTracing}
                                    onChange={(v) => setColorStep(52 - v)}
                                />
                                <LabeledSlider
                                    label="Color Merging"
                                    value={gradientStep}
                                    min={8} max={32} step={8}
                                    leftLabel="Separate shades"
                                    rightLabel="Merge similar"
                                    disabled={isTracing}
                                    onChange={setGradientStep}
                                />
                            </>
                        )}

                        {/* Advanced section (collapsible) */}
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
                                    value={filterSpeckle}
                                    min={0} max={16} step={1}
                                    leftLabel="Keep detail"
                                    rightLabel="Remove specks"
                                    disabled={isTracing}
                                    onChange={setFilterSpeckle}
                                />
                                <LabeledSlider
                                    label="Corner Sharpness"
                                    value={cornerThreshold}
                                    min={10} max={150} step={5}
                                    leftLabel="Smooth"
                                    rightLabel="Sharp corners"
                                    disabled={isTracing}
                                    onChange={setCornerThreshold}
                                />
                                <LabeledSlider
                                    label="Path Detail"
                                    value={lengthThreshold}
                                    min={1} max={10} step={0.5}
                                    leftLabel="More detail"
                                    rightLabel="Simplified"
                                    disabled={isTracing}
                                    onChange={setLengthThreshold}
                                />
                                <LabeledSlider
                                    label="Path Joining"
                                    value={spliceThreshold}
                                    min={10} max={90} step={5}
                                    leftLabel="Keep separate"
                                    rightLabel="Join paths"
                                    disabled={isTracing}
                                    onChange={setSpliceThreshold}
                                />
                                <LabeledSlider
                                    label="Coordinate Precision"
                                    value={pathPrecision}
                                    min={1} max={8} step={1}
                                    leftLabel="Compact"
                                    rightLabel="Precise"
                                    disabled={isTracing}
                                    onChange={setPathPrecision}
                                />
                            </div>
                        )}
                    </div>

                    {/* ── Action buttons ── */}
                    <div className="p-5 border-t border-slate-200 space-y-2 shrink-0">
                        <button
                            onClick={handleRetrace}
                            disabled={isTracing}
                            className="w-full flex items-center justify-center gap-2 border border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900 bg-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <RefreshCw size={12} className={isTracing ? 'animate-spin' : ''} />
                            Re-trace
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

                {/* ── Right: Split preview ── */}
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
                        {/* Original bitmap */}
                        <div
                            id="vectorizer-original"
                            className="flex-1 flex flex-col overflow-hidden border-r border-slate-200"
                        >
                            <p className="text-[9px] font-medium uppercase tracking-widest text-slate-400 px-4 py-2 border-b border-slate-200 shrink-0 bg-slate-50">
                                Original
                            </p>
                            <div className="flex-1 flex items-center justify-center p-6 overflow-auto bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2016%2016%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%228%22%20height%3D%228%22%20fill%3D%22%23f1f5f9%22%2F%3E%3Crect%20x%3D%228%22%20y%3D%228%22%20width%3D%228%22%20height%3D%228%22%20fill%3D%22%23f1f5f9%22%2F%3E%3C%2Fsvg%3E')]">
                                <img
                                    src={bitmapSrc(bitmap)}
                                    alt="Original bitmap"
                                    className="max-w-full max-h-full object-contain drop-shadow-sm"
                                />
                            </div>
                        </div>

                        {/* SVG result */}
                        <div
                            id="vectorizer-result"
                            className="flex-1 flex flex-col overflow-hidden"
                        >
                            <p className="text-[9px] font-medium uppercase tracking-widest text-slate-400 px-4 py-2 border-b border-slate-200 shrink-0 bg-slate-50">
                                SVG Result
                            </p>
                            <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
                                {isTracing && (
                                    <div className="flex flex-col items-center gap-3 text-slate-400">
                                        <Loader2 size={32} className="animate-spin text-violet-400" />
                                        <p className="text-xs">Tracing…</p>
                                    </div>
                                )}
                                {traceState === 'done' && result?.svg && (
                                    <div
                                        dangerouslySetInnerHTML={{ __html: result.svg }}
                                        className="max-w-full max-h-full [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-full [&>svg]:h-full"
                                    />
                                )}
                                {traceState === 'error' && (
                                    <div className="flex flex-col items-center gap-3 text-slate-400">
                                        <AlertTriangle size={32} className="text-red-400" />
                                        <p className="text-xs text-red-500">Trace failed — adjust settings and retry</p>
                                    </div>
                                )}
                                {traceState === 'idle' && (
                                    <p className="text-xs text-slate-400">Starting…</p>
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
