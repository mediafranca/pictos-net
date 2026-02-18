import React, { useEffect, useState } from 'react';
import { useSVGEditorStore } from '../../stores/svgEditorStore';

export const StylePanel = () => {
    const { selectedElementId, svgDocument, updateElementAttributes } = useSVGEditorStore();
    const [styles, setStyles] = useState({
        fill: '#000000',
        stroke: 'none',
        strokeWidth: '0',
        opacity: '1'
    });

    useEffect(() => {
        if (!selectedElementId || !svgDocument) return;
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgDocument, 'image/svg+xml');
        // Need to escape colons etc in ID if any, but usually safe
        const el = doc.getElementById(selectedElementId);

        if (el) {
            // Priority: attribute -> style attribute -> computed style (not available in string parse)
            const getVal = (attr: string) => {
                return el.getAttribute(attr) || el.style.getPropertyValue(attr) || (attr === 'opacity' ? '1' : (attr === 'stroke' ? 'none' : (attr === 'stroke-width' ? '0' : '#000000')));
            };

            setStyles({
                fill: getVal('fill'),
                stroke: getVal('stroke'),
                strokeWidth: getVal('stroke-width'),
                opacity: getVal('opacity')
            });
        }
    }, [selectedElementId, svgDocument]);

    const handleChange = (key: string, value: string) => {
        if (!selectedElementId) return;
        setStyles(prev => ({ ...prev, [key]: value }));

        // Update both attribute and clear inline style if present to ensure attribute takes precedence or vice versa
        // Simplest is to set attribute. SVG normalization usually handles moving to classes but raw editing can stay in attributes.
        updateElementAttributes(selectedElementId, { [key]: value });
    };

    if (!selectedElementId) {
        return (
            <div className="p-6 text-center text-slate-500 text-sm">
                <p>Selecciona un elemento en el lienzo o en el árbol para editar sus propiedades.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="p-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900">Propiedades</h3>
                <p className="text-xs text-slate-500">ID: {selectedElementId}</p>
            </div>

            <div className="p-4 space-y-6 overflow-y-auto flex-1">
                {/* Fill Control */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Relleno (Fill)</label>
                    <div className="flex items-center gap-3">
                        <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-slate-200 shadow-sm shrink-0">
                            <input
                                type="color"
                                value={styles.fill === 'none' ? '#ffffff' : styles.fill}
                                onChange={(e) => handleChange('fill', e.target.value)}
                                className="absolute -top-2 -left-2 w-16 h-16 p-0 border-0 cursor-pointer"
                            />
                        </div>
                        <div className="flex-1 flex flex-col gap-1">
                            <input
                                type="text"
                                value={styles.fill}
                                onChange={(e) => handleChange('fill', e.target.value)}
                                className="w-full text-xs border border-slate-200 rounded px-2 py-1 font-mono"
                            />
                            <div className="flex gap-1">
                                <button
                                    onClick={() => handleChange('fill', 'none')}
                                    className={`px-2 py-1 text-[10px] border rounded ${styles.fill === 'none' ? 'bg-slate-800 text-white' : 'bg-slate-50 hover:bg-slate-100'}`}
                                >
                                    Sin Relleno
                                </button>
                                <button
                                    onClick={() => handleChange('fill', '#000000')}
                                    className="px-2 py-1 text-[10px] border rounded bg-slate-50 hover:bg-slate-100"
                                >
                                    Negro
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stroke Control */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Borde (Stroke)</label>
                    <div className="flex items-center gap-3">
                        <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-slate-200 shadow-sm shrink-0">
                            <input
                                type="color"
                                value={styles.stroke === 'none' ? '#ffffff' : styles.stroke}
                                onChange={(e) => handleChange('stroke', e.target.value)}
                                className="absolute -top-2 -left-2 w-16 h-16 p-0 border-0 cursor-pointer"
                            />
                        </div>
                        <div className="flex-1 flex flex-col gap-1">
                            <input
                                type="text"
                                value={styles.stroke}
                                onChange={(e) => handleChange('stroke', e.target.value)}
                                className="w-full text-xs border border-slate-200 rounded px-2 py-1 font-mono"
                            />
                            <button
                                onClick={() => handleChange('stroke', 'none')}
                                className={`px-2 py-1 text-[10px] border rounded w-fit ${styles.stroke === 'none' ? 'bg-slate-800 text-white' : 'bg-slate-50 hover:bg-slate-100'}`}
                            >
                                Sin Borde
                            </button>
                        </div>
                    </div>
                </div>

                {/* Stroke Width */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Grosor de Borde</label>
                    <div className="flex items-center gap-3">
                        <input
                            type="range"
                            min="0"
                            max="20"
                            step="0.5"
                            value={parseFloat(styles.strokeWidth) || 0}
                            onChange={(e) => handleChange('stroke-width', e.target.value)}
                            className="flex-1"
                        />
                        <input
                            type="number"
                            min="0"
                            value={parseFloat(styles.strokeWidth) || 0}
                            onChange={(e) => handleChange('stroke-width', e.target.value)}
                            className="w-16 text-xs border border-slate-200 rounded px-2 py-1 font-mono text-right"
                        />
                        <span className="text-xs text-slate-400">px</span>
                    </div>
                </div>

                {/* Opacity */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Opacidad</label>
                    <div className="flex items-center gap-3">
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={styles.opacity}
                            onChange={(e) => handleChange('opacity', e.target.value)}
                            className="flex-1"
                        />
                        <div className="w-12 text-xs text-right font-mono text-slate-600">
                            {Math.round(parseFloat(styles.opacity) * 100)}%
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
