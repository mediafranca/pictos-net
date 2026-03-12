
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { Download, RefreshCw, AlertCircle, FileCode, Edit, Settings2, Layers, Eraser, Trash2 } from 'lucide-react';
import { RowData, VisualElement, NLUData } from '../types';
import { structureSVG, canVectorize, canStructureSVG } from '../services/svgStructureService';
import useSVGLibrary from '../hooks/useSVGLibrary';
import { GlobalConfig } from '../types';

import { generateStylesheet } from '../services/svgStructureService';
import { injectSvgA11y } from '../utils/svgAccessibility';

// Track active structuring processes across mount/unmount cycles.
// Key = row ID, value = start timestamp. Survives component unmount.
const activeStructuring = new Map<string, number>();

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
    onOpenEditor?: (source?: 'raw' | 'structured') => void;
    onOpenVectorizer?: () => void;
}

export const SVGGenerator: React.FC<SVGGeneratorProps> = ({ row, config, onLog, onUpdate, onOpenEditor, onOpenVectorizer }) => {
    const { t } = useTranslation();
    const { addSVG, getSVGByRowId, removeSVGByRowId } = useSVGLibrary();
    const [status, setStatus] = useState<'idle' | 'vectorizing' | 'traced' | 'structuring' | 'completed' | 'error'>('idle');
    const [error, setError] = useState<string | undefined>();
    const [progress, setProgress] = useState(0);
    const [processStartTime, setProcessStartTime] = useState<number | null>(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [subStatus, setSubStatus] = useState<string>('');
    const [rawSvg, setRawSvg] = useState<string | null>(row.rawSvg || null);
    const [confirmingDelete, setConfirmingDelete] = useState<'raw' | 'structured' | null>(null);
    const [structureProgress, setStructureProgress] = useState(0);
    const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // row.structuredSvg is the authoritative source (updated by parent via updateRow).
    // The local SVG library may be stale because each useSVGLibrary() instance has
    // independent state loaded only on mount. We use the library only to inherit
    // metadata (lang, createdAt) if available, but the SVG content always comes from the prop.
    const structuredSvgEntry = React.useMemo(() => {
        const libSvg = getSVGByRowId(row.id);

        if (row.structuredSvg) {
            return {
                id: libSvg?.id ?? `svg-${row.id}`,
                utterance: row.UTTERANCE,
                svg: row.structuredSvg,
                sourceRowId: row.id,
                createdAt: libSvg?.createdAt ?? new Date().toISOString(),
                lang: libSvg?.lang,
            };
        }

        if (libSvg) return libSvg;

        return undefined;
    }, [row.id, row.structuredSvg, row.UTTERANCE, getSVGByRowId]);

    // Vectorization only needs a bitmap (VTracer is independent of NLU/elements)
    const vectorizeEligibility = canVectorize({ bitmap: row.bitmap });
    // Structuring requires rawSvg + NLU + non-empty elements (no bitmap needed)
    const structureEligibility = canStructureSVG({ rawSvg: row.rawSvg, NLU: row.NLU, elements: row.elements });

    // Dynamic Style Injection (Visual only)
    const displaySvg = React.useMemo(() => {
        if (!structuredSvgEntry) return '';
        const currentStyles = generateStylesheet(config);
        return structuredSvgEntry.svg
            .replace(/<style>[\s\S]*?<\/style>/i, `<style>${currentStyles}</style>`)
            .replace(/<g /g, '<g tabindex="0" style="cursor: pointer;" ');
    }, [structuredSvgEntry, config]);

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

    // Download helpers — use the SVG string directly instead of relying on
    // the library lookup (which can miss due to ID mismatch or stale state).
    const triggerDownload = (svgString: string, suffix: string) => {
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sanitizeFilename(row.UTTERANCE)}${suffix}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const downloadRawSvg = () => {
        if (rawSvg) triggerDownload(rawSvg, '_raw');
    };

    const downloadStructuredSvg = () => {
        if (structuredSvgEntry?.svg) triggerDownload(structuredSvgEntry.svg, '');
    };

    // Strip hardcoded inline styles from the raw traced SVG so CSS classes take effect
    const cleanInlineStyles = () => {
        if (!rawSvg) return;
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(rawSvg, 'image/svg+xml');
            const INLINE_ATTRS = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity', 'style'];
            doc.querySelectorAll('*').forEach(el => {
                INLINE_ATTRS.forEach(attr => el.removeAttribute(attr));
            });
            const cleaned = new XMLSerializer().serializeToString(doc.documentElement);
            setRawSvg(cleaned);
            onUpdate({ rawSvg: cleaned });
        } catch (err) {
            console.error('cleanInlineStyles error:', err);
        }
    };

    // Handle SVG interaction (Block Editing)
    const handleSvgInteraction = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!structuredSvgEntry) return;

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
                    ...structuredSvgEntry,
                    svg: newSvgContent
                });
                // Keep row.structuredSvg in sync as the SSoT
                onUpdate({ structuredSvg: newSvgContent });
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

    // Cleanup heartbeat on unmount
    useEffect(() => {
        return () => {
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        };
    }, []);

    // Debugging: Monitor row eligibility changes
    useEffect(() => {
        console.log('[SVGGenerator] Eligibility Updated:', {
            id: row.id,
            vectorize: vectorizeEligibility,
            structure: structureEligibility,
        });
    }, [vectorizeEligibility, structureEligibility]); // eslint-disable-line react-hooks/exhaustive-deps

    // Determine status based on what SVG data is available for this row.
    // Priority: structuredSvg > active structuring > rawSvg > idle
    useEffect(() => {
        if (structuredSvgEntry) {
            // Structuring finished while we were unmounted
            activeStructuring.delete(row.id);
            setStatus('completed');
        } else if (activeStructuring.has(row.id)) {
            // Remounted while structuring is still in progress — restore UI
            const startedAt = activeStructuring.get(row.id)!;
            setRawSvg(row.rawSvg || null);
            setStatus('structuring');
            setProcessStartTime(startedAt);
            setElapsedTime((Date.now() - startedAt) / 1000);
            setSubStatus('Estructurando SVG semántico...');
            // Restart heartbeat from an estimated progress based on elapsed time
            if (!heartbeatRef.current) {
                const elapsed = (Date.now() - startedAt) / 1000;
                const estimatedProgress = elapsed < 5 ? Math.min(elapsed * 5, 25)
                    : elapsed < 30 ? Math.min(25 + (elapsed - 5) * 1.8, 70)
                    : Math.min(70 + (elapsed - 30) * 0.3, 88);
                setStructureProgress(estimatedProgress);
                startHeartbeat();
            }
        } else if (row.rawSvg) {
            setRawSvg(row.rawSvg);
            setStatus('traced');
        } else {
            setStatus('idle');
        }
    }, [structuredSvgEntry, row.id, row.rawSvg]); // eslint-disable-line react-hooks/exhaustive-deps

    const startHeartbeat = () => {
        const start = Date.now();
        heartbeatRef.current = setInterval(() => {
            const elapsed = (Date.now() - start) / 1000;
            setStructureProgress(prev => {
                if (prev >= 92) return prev;
                // Fast progression: Gemini Flash typically responds in < 3s
                if (elapsed < 1) return Math.min(prev + 10, 30);
                if (elapsed < 3) return Math.min(prev + 8, 70);
                if (elapsed < 8) return Math.min(prev + 3, 85);
                return Math.min(prev + 0.5, 92);
            });
        }, 200);
    };

    const stopHeartbeat = (finalValue = 100) => {
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
        setStructureProgress(finalValue);
    };

    const handleFormat = async () => {
        if (!rawSvg) return;

        try {
            setError(undefined);
            const startTime = performance.now();
            setProcessStartTime(Date.now());
            setElapsedTime(0);

            // Structure with Gemini
            setStatus('structuring');
            setSubStatus('Preparando prompt semántico...');
            setStructureProgress(0);
            activeStructuring.set(row.id, Date.now());
            startHeartbeat();
            await new Promise(r => setTimeout(r, 600)); // UX Delay

            const nluData = typeof row.NLU === 'object' ? row.NLU as NLUData : undefined;
            if (!nluData) throw new Error("Invalid NLU data");

            onLog('info', `Estructurando SVG semántico con contexto NLU...`);
            const sStart = performance.now();
            const result = await structureSVG({
                rawSvg,
                nlu: nluData,
                elements: row.elements || [],
                utterance: row.UTTERANCE,
                config,
                onProgress: (msg) => onLog('info', msg),
                onStatus: (s) => {
                    switch (s) {
                        case 'sending': setSubStatus('Enviando inventario a Gemini Flash...'); break;
                        case 'receiving': setSubStatus('Recibiendo asignación JSON...'); break;
                        case 'sanitizing': setSubStatus('Ensamblando SVG + IDs semánticos...'); break;
                        default: setSubStatus(s);
                    }
                }
            });

            stopHeartbeat();
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

            activeStructuring.delete(row.id);
            setStatus('completed');
            const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
            onLog('success', `Proceso SVG finalizado. Tiempo total: ${totalTime}s`);

        } catch (err) {
            stopHeartbeat(0);
            activeStructuring.delete(row.id);
            console.error(err);
            setStatus('error');
            const msg = err instanceof Error ? err.message : "Unknown error";
            setError(msg);
            onLog('error', `Fallo SVG: ${msg}`);
        }
    };


    if (!vectorizeEligibility.eligible) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-6 bg-slate-50 border border-slate-100 rounded text-center opacity-75">
                <AlertCircle size={24} className="text-slate-500 mb-2" />
                <p className="text-xs text-slate-500 font-medium mb-1">SVG Generation Unavailable</p>
                <p className="text-xs text-slate-500 font-mono">
                    {vectorizeEligibility.reason || "Requirements not met"}
                </p>
            </div>
        );
    }

    if (status === 'completed' && structuredSvgEntry) {
        return (
            <div className="flex flex-col h-full">
                {/* Raw traced SVG — compact preview (only when rawSvg exists) */}
                {rawSvg && (
                    <div className="bg-white border border-slate-200 flex items-center justify-center p-3 relative overflow-hidden group/raw-compact mb-2" style={{ flex: '2 1 0%', minHeight: 80 }}>
                        <div className="absolute inset-0 pattern-grid-sm opacity-5 pointer-events-none"></div>
                        <div className="absolute top-1.5 left-1.5 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider pointer-events-none z-10">
                            {t('svg.traceSvg')}
                        </div>
                        <div className="absolute bottom-1.5 right-1.5 flex gap-1.5 z-10 opacity-0 group-hover/raw-compact:opacity-100 transition-opacity">
                            {onOpenEditor && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onOpenEditor('raw'); }}
                                    className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full shadow-lg"
                                    title="Editar SVG trazado"
                                >
                                    <Edit size={12} />
                                </button>
                            )}
                            <button
                                onClick={() => onOpenVectorizer?.()}
                                className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full shadow-lg"
                                title={t('vectorizer.adjustTrace')}
                            >
                                <Settings2 size={12} />
                            </button>
                            <button
                                onClick={downloadRawSvg}
                                className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full shadow-lg"
                                title="Download raw SVG"
                            >
                                <Download size={12} />
                            </button>
                            <button
                                onClick={() => setConfirmingDelete('raw')}
                                className="p-1.5 bg-black/60 hover:bg-rose-600 text-white rounded-full shadow-lg"
                                title={t('actions.delete')}
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                        {confirmingDelete === 'raw' && (
                            <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20 gap-2">
                                <button
                                    onClick={() => {
                                        setRawSvg(null);
                                        onUpdate({ rawSvg: undefined });
                                        setConfirmingDelete(null);
                                    }}
                                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider rounded"
                                >
                                    {t('actions.delete')}
                                </button>
                                <button
                                    onClick={() => setConfirmingDelete(null)}
                                    className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold uppercase tracking-wider rounded"
                                >
                                    {t('actions.cancel')}
                                </button>
                            </div>
                        )}
                        <div
                            dangerouslySetInnerHTML={{ __html: injectSvgA11y(displayRawSvg, row.UTTERANCE) }}
                            className="w-full h-full svg-preview flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-full [&>svg]:max-h-full"
                        />
                    </div>
                )}

                {/* Structured SVG — main preview */}
                <div className="bg-white border border-slate-200 flex items-center justify-center p-4 relative overflow-hidden group/svg-preview mb-3" style={{ flex: '3 1 0%', minHeight: 120 }}>
                    <div className="absolute inset-0 pattern-grid-sm opacity-5 pointer-events-none"></div>
                    <div className="absolute top-2 left-2 bg-emerald-600 text-white text-xs px-2 py-1 rounded font-bold uppercase tracking-wider pointer-events-none z-10">
                        {t('svg.structureLabel')}
                    </div>
                    <div className="absolute bottom-2 right-2 flex gap-2 z-10 opacity-0 group-hover/svg-preview:opacity-100 transition-opacity">
                        {onOpenEditor && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onOpenEditor('structured'); }}
                                className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-full shadow-lg backdrop-blur-sm transition-all"
                                title="Editar SVG estructurado"
                            >
                                <Edit size={14} />
                            </button>
                        )}
                        <button
                            onClick={downloadStructuredSvg}
                            className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-full shadow-lg backdrop-blur-sm transition-all"
                            title="Descargar SVG"
                        >
                            <Download size={14} />
                        </button>
                        <button
                            onClick={() => setConfirmingDelete('structured')}
                            className="p-2 bg-black/60 hover:bg-rose-600 text-white rounded-full shadow-lg backdrop-blur-sm transition-all"
                            title={t('actions.delete')}
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                    {confirmingDelete === 'structured' && (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20 gap-2">
                            <button
                                onClick={() => {
                                    removeSVGByRowId(row.id);
                                    onUpdate({ structuredSvg: undefined });
                                    setConfirmingDelete(null);
                                    if (rawSvg) {
                                        setStatus('traced');
                                    } else {
                                        setStatus('idle');
                                    }
                                }}
                                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider rounded"
                            >
                                {t('actions.delete')}
                            </button>
                            <button
                                onClick={() => setConfirmingDelete(null)}
                                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold uppercase tracking-wider rounded"
                            >
                                {t('actions.cancel')}
                            </button>
                        </div>
                    )}
                    <div
                        dangerouslySetInnerHTML={{ __html: injectSvgA11y(displaySvg, row.UTTERANCE, row.prompt) }}
                        onClick={handleSvgInteraction}
                        className="w-full h-full svg-preview flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-full [&>svg]:max-h-full cursor-pointer"
                    />
                </div>

                <div className="flex gap-2">
                    {/* Re-structure: go back to traced if a raw SVG is available */}
                    {row.rawSvg && (
                        <button
                            onClick={() => {
                                removeSVGByRowId(row.id);
                                onUpdate({ structuredSvg: undefined });
                                setRawSvg(row.rawSvg!);
                                setStatus('traced');
                            }}
                            className="flex-1 flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-600 py-2 px-3 rounded transition-colors border border-slate-200 text-xs font-bold uppercase tracking-widest"
                            title={t('svg.reStructureTooltip')}
                        >
                            <Layers size={14} aria-hidden="true" /> {t('svg.reStructure')}
                        </button>
                    )}

                    {/* Re-trace: clear structured SVG and open vectorizer for a fresh trace */}
                    <button
                        onClick={() => {
                            removeSVGByRowId(row.id);
                            onUpdate({ structuredSvg: undefined });
                            setRawSvg(null);
                            onOpenVectorizer?.();
                        }}
                        title={t('svg.retrace')}
                        className="flex-1 flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-600 py-2 px-3 rounded transition-colors border border-slate-200 text-xs font-bold uppercase tracking-widest"
                    >
                        <RefreshCw size={14} aria-hidden="true" /> {t('svg.retrace')}
                    </button>
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
                    <div className="absolute top-2 right-2 bg-amber-500 text-white text-xs px-2 py-1 rounded font-bold uppercase tracking-wider pointer-events-none z-10">
                        {t('svg.traceSvg')}
                    </div>
                    {/* Download, Edit & Delete overlay — bottom on hover */}
                    <div className="absolute bottom-2 right-2 flex gap-2 z-10 opacity-0 group-hover/raw-preview:opacity-100 transition-opacity">
                        {onOpenEditor && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onOpenEditor('raw'); }}
                                className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-full shadow-lg"
                                title="Editar SVG trazado"
                            >
                                <Edit size={14} />
                            </button>
                        )}
                        <button
                            onClick={downloadRawSvg}
                            className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-full shadow-lg"
                            title="Download raw SVG"
                        >
                            <Download size={14} />
                        </button>
                        <button
                            onClick={() => setConfirmingDelete('raw')}
                            className="p-2 bg-black/60 hover:bg-rose-600 text-white rounded-full shadow-lg"
                            title={t('actions.delete')}
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                    {confirmingDelete === 'raw' && (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20 gap-2">
                            <button
                                onClick={() => {
                                    setRawSvg(null);
                                    onUpdate({ rawSvg: undefined });
                                    setConfirmingDelete(null);
                                    setStatus('idle');
                                }}
                                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider rounded"
                            >
                                {t('actions.delete')}
                            </button>
                            <button
                                onClick={() => setConfirmingDelete(null)}
                                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold uppercase tracking-wider rounded"
                            >
                                {t('actions.cancel')}
                            </button>
                        </div>
                    )}
                    <div
                        dangerouslySetInnerHTML={{ __html: injectSvgA11y(displayRawSvg, row.UTTERANCE) }}
                        className="w-full h-full svg-preview flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-full [&>svg]:max-h-full"
                    />
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleFormat}
                        disabled={!structureEligibility.eligible}
                        title={structureEligibility.eligible ? undefined : structureEligibility.reason}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold uppercase tracking-widest rounded transition-colors shadow-md ${structureEligibility.eligible ? 'bg-violet-600 hover:bg-violet-700 text-white hover:shadow-lg' : 'bg-slate-200 text-slate-500 cursor-not-allowed shadow-none'}`}
                    >
                        <Layers size={16} aria-hidden="true" /> {t('svg.formatGemini')}
                    </button>

                    <button
                        onClick={cleanInlineStyles}
                        title={t('svg.clearInlineStyles')}
                        className="flex items-center justify-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-600 py-2 px-3 rounded transition-colors border border-slate-200 text-xs"
                    >
                        <Eraser size={13} />
                    </button>

                    <button
                        onClick={() => onOpenVectorizer?.()}
                        title={t('vectorizer.adjustTrace')}
                        className="flex items-center justify-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-600 py-2 px-3 rounded transition-colors border border-slate-200 text-xs"
                    >
                        <Settings2 size={13} />
                    </button>
                </div>

                <div className="mt-1 text-center text-xs text-slate-500">
                    {t('svg.traceDone')}
                </div>
            </div>
        );
    }

    // Structuring in progress — keep rawSvg visible with progress bar below
    if (status === 'structuring' && rawSvg) {
        return (
            <div className="flex flex-col h-full">
                <div
                    className="flex-1 bg-white border border-slate-200 flex items-center justify-center p-4 relative mb-3 overflow-hidden"
                    style={{ minHeight: 120 }}
                >
                    <div className="absolute inset-0 pattern-grid-sm opacity-5 pointer-events-none" />
                    <div className="absolute top-2 right-2 bg-amber-500 text-white text-xs px-2 py-1 rounded font-bold uppercase tracking-wider pointer-events-none z-10">
                        {t('svg.traceSvg')}
                    </div>
                    <div
                        dangerouslySetInnerHTML={{ __html: injectSvgA11y(displayRawSvg, row.UTTERANCE) }}
                        className="w-full h-full svg-preview flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-full [&>svg]:max-h-full"
                    />
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-violet-600 animate-spin flex-none" />
                        <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                            {t('svg.structuring')}
                        </p>
                        <div className="ml-auto flex items-center gap-2">
                            {onOpenEditor && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onOpenEditor('raw'); }}
                                    className="p-1.5 bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded border border-slate-200 transition-colors"
                                    title="Editar SVG trazado"
                                >
                                    <Edit size={12} />
                                </button>
                            )}
                            <button
                                onClick={() => onOpenVectorizer?.()}
                                className="p-1.5 bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded border border-slate-200 transition-colors"
                                title={t('vectorizer.adjustTrace')}
                            >
                                <Settings2 size={12} />
                            </button>
                            <span className="text-xs font-mono text-violet-600 font-bold bg-violet-50 px-1.5 py-0.5 rounded">
                                {elapsedTime.toFixed(1)}s
                            </span>
                        </div>
                    </div>
                    <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
                        <div
                            className="bg-violet-600 h-full rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${structureProgress}%` }}
                        />
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5 truncate">
                        {subStatus || 'Aplicando esquema semántico con Gemini...'}
                    </p>
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
                        {status === 'vectorizing' ? t('svg.generating') : t('svg.structuring')}
                    </p>
                    <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden mt-2">
                        <div
                            className="bg-violet-600 h-full transition-all duration-300 ease-out"
                            style={{ width: status === 'vectorizing' ? `${progress}%` : `${structureProgress}%` }}
                        ></div>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                        <p className="text-xs text-slate-500">
                            {subStatus || (status === 'structuring' ? 'Applying semantic schema with Gemini...' : 'Tracing bitmap paths...')}
                        </p>
                        <span className="text-xs font-mono text-violet-600 font-bold bg-violet-50 px-1.5 py-0.5 rounded">
                            {elapsedTime.toFixed(1)}s
                        </span>
                    </div>
                </div>
            ) : (
                <>
                    <FileCode size={32} className="text-slate-500 group-hover:text-violet-500 mb-3 transition-colors" />
                    <div className="flex flex-col gap-2 items-center">
                        <button
                            onClick={() => onOpenVectorizer?.()}
                            className="bg-white border-2 border-violet-100 group-hover:border-violet-600 text-violet-900 group-hover:text-violet-700 px-6 py-2 font-bold uppercase text-xs tracking-widest transition-all shadow-sm group-hover:shadow-md rounded-full"
                        >
                            {t('svg.traceSvg')}
                        </button>
                        <button
                            disabled
                            className="bg-slate-100 border-2 border-slate-200 text-slate-400 px-6 py-2 font-bold uppercase text-xs tracking-widest rounded-full cursor-not-allowed"
                            title={t('svg.structureTooltip')}
                        >
                            <Layers size={14} className="inline mr-1.5" aria-hidden="true" />{t('svg.formatGemini')}
                        </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 text-center max-w-[200px]">
                        {t('svg.traceConverts')}
                    </p>
                    {error && (
                        <div className="mt-3 text-xs text-red-500 flex items-center gap-1 bg-red-50 px-2 py-1 rounded">
                            <AlertCircle size={10} aria-hidden="true" /> {error}
                        </div>
                    )}
                </>
            )}
        </div>

    );
};
