
import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { Download, RefreshCw, AlertCircle, FileCode, Check } from 'lucide-react';
import { RowData, VisualElement, NLUData } from '../types';
import { vectorizeBitmap } from '../services/vtracerService';
import { structureSVG, canGenerateSVG } from '../services/svgStructureService';
import useSVGLibrary from '../hooks/useSVGLibrary';
import { GlobalConfig } from '../types';

import { generateStylesheet } from '../services/svgStructureService';

// Helper function to sanitize filename for downloads
const sanitizeFilename = (text: string, maxLength: number = 30): string => {
  return text
    .normalize('NFD') // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]/gi, '_') // Replace non-alphanumeric with underscore
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, '') // Remove leading/trailing underscores
    .substring(0, maxLength)
    .toLowerCase();
};

interface SVGGeneratorProps {
    row: RowData;
    config: GlobalConfig;
    onLog: (type: 'info' | 'error' | 'success', message: string) => void;
    onUpdate: (updates: Partial<RowData>) => void;
}

export const SVGGenerator: React.FC<SVGGeneratorProps> = ({ row, config, onLog, onUpdate }) => {
    const { t } = useTranslation();
    const { addSVG, getSVGByRowId, downloadSVG } = useSVGLibrary();
    const [status, setStatus] = useState<'idle' | 'vectorizing' | 'traced' | 'structuring' | 'completed' | 'error'>('idle');
    const [error, setError] = useState<string | undefined>();
    const [progress, setProgress] = useState(0);
    const [processStartTime, setProcessStartTime] = useState<number | null>(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [subStatus, setSubStatus] = useState<string>('');
    const [rawSvg, setRawSvg] = useState<string | null>(row.rawSvg || null); // Load from row or null

    // Check if SVG already exists in library
    const existingSVG = getSVGByRowId(row.id);

    // Calculate eligibility (re-runs strictly when row updates)
    const eligibility = canGenerateSVG({
        bitmap: row.bitmap,
        NLU: row.NLU,
        elements: row.elements
    });

    // Dynamic Style Injection (Visual only)
    const displaySvg = React.useMemo(() => {
        if (!existingSVG) return '';
        const currentStyles = generateStylesheet(config);
        return existingSVG.svg
            .replace(/<style>[\s\S]*?<\/style>/i, `<style>${currentStyles}</style>`)
            .replace(/<g /g, '<g tabindex="0" style="cursor: pointer;" ');
    }, [existingSVG, config]);

    // Raw SVG prepared for display.
    // The viewBox from vtracer (or assembled multicolor SVG) is authoritative and
    // should already match the source bitmap pixel dimensions. If it's missing
    // (legacy SVGs, unexpected vtracer output), we compute a rough fallback from
    // the translate() transforms on each path.
    const displayRawSvg = React.useMemo(() => {
        if (!rawSvg) return '';
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(rawSvg, 'image/svg+xml');
            const svgEl = doc.querySelector('svg');
            if (!svgEl) return rawSvg;

            if (!svgEl.hasAttribute('viewBox')) {
                // Compute a viewBox from translate() transforms as a fallback.
                // Each path is positioned at translate(tx, ty) in pixel space.
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                svgEl.querySelectorAll('path').forEach(path => {
                    const t = path.getAttribute('transform') || '';
                    const m = t.match(/translate\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/);
                    if (m) {
                        minX = Math.min(minX, +m[1]);
                        minY = Math.min(minY, +m[2]);
                        maxX = Math.max(maxX, +m[1]);
                        maxY = Math.max(maxY, +m[2]);
                    }
                });
                if (isFinite(minX)) {
                    // Add generous padding to accommodate path extents beyond their origins
                    const pad = Math.max(80, (maxX - minX) * 0.15);
                    svgEl.setAttribute('viewBox',
                        `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`);
                }
            }

            svgEl.setAttribute('width', '100%');
            svgEl.setAttribute('height', '100%');
            svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');

            return new XMLSerializer().serializeToString(svgEl);
        } catch {
            return rawSvg;
        }
    }, [rawSvg]);

    // Download raw SVG
    const downloadRawSvg = () => {
        if (!rawSvg) return;
        const blob = new Blob([rawSvg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sanitizeFilename(row.UTTERANCE)}_raw.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Handle SVG interaction (Block Editing)
    const handleSvgInteraction = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!existingSVG) return;

        const target = e.target as Element;
        const group = target.closest('g[role="group"]') || target.closest('[class*=""]');

        if (group) {
            e.preventDefault();
            e.stopPropagation();

            // Get all available classes from config
            const availableClasses = Object.keys(config.svgStyles || { f: {}, k: {} });

            // Find current class
            let currentClassIndex = -1;
            for (let i = 0; i < availableClasses.length; i++) {
                if (group.classList.contains(availableClasses[i])) {
                    currentClassIndex = i;
                    break;
                }
            }

            // Remove current class and add next one (cycle through)
            if (currentClassIndex >= 0) {
                group.classList.remove(availableClasses[currentClassIndex]);
            }
            const nextIndex = (currentClassIndex + 1) % availableClasses.length;
            group.classList.add(availableClasses[nextIndex]);

            const svgRoot = e.currentTarget.querySelector('svg');
            if (svgRoot) {
                const s = new XMLSerializer();
                const newSvgContent = s.serializeToString(svgRoot);

                addSVG({
                    ...existingSVG,
                    svg: newSvgContent
                });
            }
        }
    };



    // Timer Effect
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if ((status === 'vectorizing' || status === 'structuring') && processStartTime) {
            interval = setInterval(() => {
                setElapsedTime((Date.now() - processStartTime) / 1000);
            }, 100);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [status, processStartTime]);

    // Debugging: Monitor row eligibility changes
    useEffect(() => {
        if (eligibility.eligible !== undefined) {
            console.log('[SVGGenerator] Eligibility Updated:', {
                id: row.id,
                eligible: eligibility.eligible,
                reason: eligibility.reason
            });
        }
    }, [eligibility]);

    useEffect(() => {
        if (existingSVG) {
            setStatus('completed');
        } else {
            // Reset status if we switched rows or deleted SVG
            setStatus('idle');
        }
    }, [existingSVG, row.id]);

    // Sync rawSvg state when row changes
    useEffect(() => {
        if (row.rawSvg && !rawSvg) {
            setRawSvg(row.rawSvg);
            setStatus('traced');
        }
    }, [row.id, row.rawSvg]);

    const handleTrace = async () => {
        if (!eligibility.eligible || !row.bitmap) return;

        try {
            setError(undefined);
            const startTime = performance.now();
            setProcessStartTime(Date.now());
            setElapsedTime(0);

            onLog('info', `Iniciando vectorización para: ${row.UTTERANCE}`);

            // Step 1: Vectorize
            setStatus('vectorizing');
            setSubStatus('Vectorizando bitmap (vtracer)...');
            setProgress(0);
            await new Promise(r => setTimeout(r, 600)); // UX Delay

            const vStart = performance.now();
            const tracedSvg = await vectorizeBitmap(
                row.bitmap.replace(/^data:image\/\w+;base64,/, ""),
                {},
                (p) => setProgress(p)
            );
            const vEnd = performance.now();
            onLog('success', `Vectorización completada en ${((vEnd - vStart) / 1000).toFixed(2)}s`);

            // Store raw SVG in local state and persist to row
            setRawSvg(tracedSvg);
            onUpdate({ rawSvg: tracedSvg });
            setStatus('traced');
            setProcessStartTime(null);
            setElapsedTime(0);

        } catch (err) {
            console.error(err);
            setStatus('error');
            const msg = err instanceof Error ? err.message : "Unknown error";
            setError(msg);
            onLog('error', `Fallo en vectorización: ${msg}`);
        }
    };

    const handleFormat = async () => {
        if (!rawSvg) return;

        try {
            setError(undefined);
            const startTime = performance.now();
            setProcessStartTime(Date.now());
            setElapsedTime(0);

            // Step 2: Structure with Gemini
            setStatus('structuring');
            setSubStatus('Preparando prompt semántico...');
            setProgress(0);
            await new Promise(r => setTimeout(r, 600)); // UX Delay

            const nluData = typeof row.NLU === 'object' ? row.NLU as NLUData : undefined;
            if (!nluData) throw new Error("Invalid NLU data");

            onLog('info', `Estructurando SVG semántico con referencia visual...`);
            const sStart = performance.now();
            const result = await structureSVG({
                rawSvg,
                bitmap: row.bitmap || '', // Pass original bitmap as visual reference
                nlu: nluData,
                elements: row.elements || [],
                utterance: row.UTTERANCE,
                config,
                onProgress: (msg) => onLog('info', msg),
                onStatus: (s) => {
                    switch (s) {
                        case 'sending': setSubStatus('Enviando imagen + SVG a Gemini...'); break;
                        case 'receiving': setSubStatus('Recibiendo estructura semántica...'); break;
                        case 'sanitizing': setSubStatus('Sanitizando y aplicando estilos...'); break;
                        default: setSubStatus(s);
                    }
                }
            });

            const sEnd = performance.now();

            if (!result.success || !result.svg) {
                throw new Error(result.error || "Failed to structure SVG");
            }
            onLog('success', `Estructuración completada en ${((sEnd - sStart) / 1000).toFixed(2)}s`);

            // Step 3: Save to library and persist to row
            addSVG({
                id: row.id, // Use row ID as SVG ID to maintain 1:1 relationship
                utterance: row.UTTERANCE,
                svg: result.svg,
                createdAt: new Date().toISOString(),
                sourceRowId: row.id,
                lang: nluData.lang
            });

            // Persist structured SVG to row
            onUpdate({ structuredSvg: result.svg });

            setStatus('completed');
            setRawSvg(null); // Clear local raw SVG state
            const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
            onLog('success', `Proceso SVG finalizado. Tiempo total: ${totalTime}s`);

        } catch (err) {
            console.error(err);
            setStatus('error');
            const msg = err instanceof Error ? err.message : "Unknown error";
            setError(msg);
            onLog('error', `Fallo SVG: ${msg}`);
        }
    };

    if (!eligibility.eligible) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-6 bg-slate-50 border border-slate-100 rounded text-center opacity-75">
                <AlertCircle size={24} className="text-slate-300 mb-2" />
                <p className="text-xs text-slate-400 font-medium mb-1">SVG Generation Unavailable</p>
                <p className="text-[10px] text-slate-400 font-mono">
                    {eligibility.reason || "Requirements not met"}
                </p>
            </div>
        );
    }

    if (status === 'completed' && existingSVG) {
        return (
            <div className="flex flex-col h-full">
                <div className="flex-1 bg-white border border-slate-200 flex items-center justify-center p-4 relative mb-3 overflow-hidden group/svg-preview">
                    <div className="absolute inset-0 pattern-grid-sm opacity-5 pointer-events-none"></div>
                    <div className="absolute top-2 right-2 opacity-0 group-hover/svg-preview:opacity-100 transition-opacity bg-black/70 text-white text-[10px] px-2 py-1 rounded pointer-events-none z-10 font-medium">
                        Click parts to cycle through styles
                    </div>
                    {/* Download overlay — bottom-right on hover */}
                    <button
                        onClick={() => downloadSVG(existingSVG.id)}
                        className="absolute bottom-2 right-2 opacity-0 group-hover/svg-preview:opacity-100 transition-opacity p-2 bg-black/60 hover:bg-black/80 text-white rounded-full shadow-lg z-10"
                        title="Download SVG"
                    >
                        <Download size={14} />
                    </button>
                    <div
                        dangerouslySetInnerHTML={{ __html: displaySvg }}
                        onClick={handleSvgInteraction}
                        className="w-full h-full svg-preview flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-full [&>svg]:max-h-full cursor-pointer"
                    />
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleTrace}
                        title="Re-trace bitmap"
                        className="flex-1 flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 py-2 px-3 rounded transition-colors border border-slate-200 text-[10px] font-bold uppercase tracking-widest"
                    >
                        <RefreshCw size={14} /> Re-trace
                    </button>
                </div>

                <div className="mt-2 flex items-center justify-center gap-1 text-[10px] text-emerald-600 font-medium">
                    <Check size={12} /> mf-svg-schema compliant
                </div>
            </div>
        );
    }

    // Show raw traced SVG with Format button
    if (status === 'traced' && rawSvg) {
        return (
            <div className="flex flex-col h-full">
                <div className="flex-1 bg-white border border-slate-200 flex items-center justify-center p-4 relative mb-3 overflow-hidden group/raw-preview">
                    <div className="absolute inset-0 pattern-grid-sm opacity-5 pointer-events-none"></div>
                    <div className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider pointer-events-none z-10">
                        Raw Trace
                    </div>
                    {/* Download overlay — bottom-right on hover */}
                    <button
                        onClick={downloadRawSvg}
                        className="absolute bottom-2 right-2 opacity-0 group-hover/raw-preview:opacity-100 transition-opacity p-2 bg-black/60 hover:bg-black/80 text-white rounded-full shadow-lg z-10"
                        title="Download raw SVG"
                    >
                        <Download size={14} />
                    </button>
                    <div
                        dangerouslySetInnerHTML={{ __html: displayRawSvg }}
                        className="w-full h-full svg-preview flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-full [&>svg]:max-h-full"
                    />
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleFormat}
                        className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white py-3 px-4 text-xs font-bold uppercase tracking-widest rounded transition-colors shadow-md hover:shadow-lg"
                    >
                        <FileCode size={16} /> Format with Gemini
                    </button>

                    <button
                        onClick={handleTrace}
                        title="Re-trace bitmap"
                        className="flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 py-2 px-3 rounded transition-colors border border-slate-200"
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>

                <div className="mt-2 text-center text-[10px] text-slate-500">
                    Raw vectorization complete. Click <strong>Format</strong> to apply semantic structure.
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center h-full p-6 border border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-white transition-colors group">
            {(status === 'vectorizing' || status === 'structuring') ? (
                <div className="text-center w-full">
                    <div className="mb-3 mx-auto w-8 h-8 rounded-full border-2 border-slate-200 border-t-violet-600 animate-spin"></div>
                    <p className="text-xs font-medium text-slate-600 uppercase tracking-wider mb-1">
                        {status === 'vectorizing' ? 'Vectorizing...' : 'Structuring...'}
                    </p>
                    <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden mt-2">
                        <div
                            className="bg-violet-600 h-full transition-all duration-300 ease-out"
                            style={{ width: status === 'vectorizing' ? `${progress}%` : '90%' }}
                        ></div>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                        <p className="text-[10px] text-slate-400">
                            {subStatus || (status === 'structuring' ? 'Applying semantic schema with Gemini...' : 'Tracing bitmap paths...')}
                        </p>
                        <span className="text-[10px] font-mono text-violet-600 font-bold bg-violet-50 px-1.5 py-0.5 rounded">
                            {elapsedTime.toFixed(1)}s
                        </span>
                    </div>
                </div>
            ) : (
                <>
                    <FileCode size={32} className="text-slate-300 group-hover:text-violet-500 mb-3 transition-colors" />
                    <button
                        onClick={handleTrace}
                        className="bg-white border-2 border-violet-100 group-hover:border-violet-600 text-violet-900 group-hover:text-violet-700 px-6 py-2 font-bold uppercase text-xs tracking-widest transition-all shadow-sm group-hover:shadow-md rounded-full"
                    >
                        Trace SVG
                    </button>
                    <p className="text-[10px] text-slate-400 mt-3 text-center max-w-[200px]">
                        Converts bitmap to semantic SVG using vtracer and Gemini Pro
                    </p>
                    {error && (
                        <div className="mt-3 text-[10px] text-red-500 flex items-center gap-1 bg-red-50 px-2 py-1 rounded">
                            <AlertCircle size={10} /> {error}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
