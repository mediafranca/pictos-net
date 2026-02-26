
import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { Download, RefreshCw, AlertCircle, FileCode, Edit, Settings2, Layers, Eraser } from 'lucide-react';
import { RowData, VisualElement, NLUData } from '../types';
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
    onOpenEditor?: () => void;
    onOpenVectorizer?: () => void;
}

export const SVGGenerator: React.FC<SVGGeneratorProps> = ({ row, config, onLog, onUpdate, onOpenEditor, onOpenVectorizer }) => {
    const { t } = useTranslation();
    const { addSVG, getSVGByRowId, downloadSVG, removeSVGByRowId } = useSVGLibrary();
    const [status, setStatus] = useState<'idle' | 'vectorizing' | 'traced' | 'structuring' | 'completed' | 'error'>('idle');
    const [error, setError] = useState<string | undefined>();
    const [progress, setProgress] = useState(0);
    const [processStartTime, setProcessStartTime] = useState<number | null>(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [subStatus, setSubStatus] = useState<string>('');
    const [rawSvg, setRawSvg] = useState<string | null>(row.rawSvg || null);

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

    // Calculate eligibility (re-runs strictly when row updates)
    const eligibility = canGenerateSVG({
        bitmap: row.bitmap,
        NLU: row.NLU,
        elements: row.elements
    });

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

    // Determine status based on what SVG data is available for this row.
    // Priority: structuredSvg > rawSvg > idle
    useEffect(() => {
        if (structuredSvgEntry) {
            setStatus('completed');
        } else if (row.rawSvg) {
            setRawSvg(row.rawSvg);
            setStatus('traced');
        } else {
            setStatus('idle');
        }
    }, [structuredSvgEntry, row.id, row.rawSvg]);

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

    if (status === 'completed' && structuredSvgEntry) {
        return (
            <div className="flex flex-col h-full">
                <div className="flex-1 bg-white border border-slate-200 flex items-center justify-center p-4 relative mb-3 overflow-hidden group/svg-preview">
                    <div className="absolute inset-0 pattern-grid-sm opacity-5 pointer-events-none"></div>
                    <div className="absolute top-2 right-2 opacity-0 group-hover/svg-preview:opacity-100 transition-opacity bg-black/70 text-white text-[10px] px-2 py-1 rounded pointer-events-none z-10 font-medium">
                        Click parts to cycle through styles
                    </div>
                    <div className="absolute top-2 left-2 bg-emerald-600 text-white text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider pointer-events-none z-10">
                        {t('svg.structureLabel')}
                    </div>
                    {/* Download & Edit overlay — bottom-right */}
                    <div className="absolute bottom-2 right-2 flex gap-2 z-10 opacity-0 group-hover/svg-preview:opacity-100 transition-opacity">
                        {onOpenEditor && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onOpenEditor(); }}
                                className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-full shadow-lg backdrop-blur-sm transition-all"
                                title="Editar SVG"
                            >
                                <Edit size={14} />
                            </button>
                        )}
                        <button
                            onClick={() => downloadSVG(structuredSvgEntry.id)}
                            className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-full shadow-lg backdrop-blur-sm transition-all"
                            title="Descargar SVG"
                        >
                            <Download size={14} />
                        </button>
                    </div>
                    <div
                        dangerouslySetInnerHTML={{ __html: displaySvg }}
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
                            className="flex-1 flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 py-2 px-3 rounded transition-colors border border-slate-200 text-[10px] font-bold uppercase tracking-widest"
                            title={t('svg.reStructureTooltip')}
                        >
                            <Layers size={14} /> {t('svg.reStructure')}
                        </button>
                    )}

                    {/* Re-trace: open vectorizer and clear local raw SVG state */}
                    <button
                        onClick={() => {
                            setRawSvg(null);
                            onOpenVectorizer?.();
                        }}
                        title={t('svg.retrace')}
                        className="flex-1 flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 py-2 px-3 rounded transition-colors border border-slate-200 text-[10px] font-bold uppercase tracking-widest"
                    >
                        <RefreshCw size={14} /> {t('svg.retrace')}
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
                    <div className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider pointer-events-none z-10">
                        {t('svg.traceSvg')}
                    </div>
                    {/* Download & Edit overlay — bottom on hover */}
                    <div className="absolute bottom-2 right-2 flex gap-2 z-10 opacity-0 group-hover/raw-preview:opacity-100 transition-opacity">
                        {onOpenEditor && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onOpenEditor(); }}
                                className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-full shadow-lg"
                                title="Editar SVG"
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
                    </div>
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
                        <Layers size={16} /> {t('svg.formatGemini')}
                    </button>

                    <button
                        onClick={cleanInlineStyles}
                        title={t('svg.clearInlineStyles')}
                        className="flex items-center justify-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 py-2 px-3 rounded transition-colors border border-slate-200 text-[10px]"
                    >
                        <Eraser size={13} />
                    </button>

                    <button
                        onClick={() => onOpenVectorizer?.()}
                        title={t('vectorizer.adjustTrace')}
                        className="flex items-center justify-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 py-2 px-3 rounded transition-colors border border-slate-200 text-[10px]"
                    >
                        <Settings2 size={13} />
                    </button>
                </div>

                <div className="mt-1 text-center text-[10px] text-slate-500">
                    {t('svg.traceDone')}
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
                        onClick={() => onOpenVectorizer?.()}
                        className="bg-white border-2 border-violet-100 group-hover:border-violet-600 text-violet-900 group-hover:text-violet-700 px-6 py-2 font-bold uppercase text-xs tracking-widest transition-all shadow-sm group-hover:shadow-md rounded-full"
                    >
                        {t('svg.traceSvg')}
                    </button>
                    <p className="text-[10px] text-slate-400 mt-2 text-center max-w-[200px]">
                        {t('svg.traceConverts')}
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
