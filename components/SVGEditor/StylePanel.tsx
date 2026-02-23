import React, { useEffect, useMemo, useState } from 'react';
import { useSVGEditorStore } from '../../stores/svgEditorStore';
import { Trash2, Check } from 'lucide-react';
import type { StyleDefinition } from '../../lib/style-editor/lib/types';
import StylePreviewCard from '../../lib/style-editor/lib/components/StylePreviewCard';

// ── RenameField sub-component ──────────────────────────────────────────────
const RenameField: React.FC<{ elementId: string }> = ({ elementId }) => {
    const { updateElementId, svgDocument } = useSVGEditorStore();
    const [value, setValue] = useState(elementId);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        setValue(elementId);
        setStatus('idle');
    }, [elementId]);

    const validate = (v: string): string | null => {
        if (!v.trim()) return 'El ID no puede estar vacío';
        if (!/^[a-zA-Z0-9_-]+$/.test(v)) return 'Solo alfanuméricos, guiones y guión bajo';
        if (v === elementId) return null;
        if (svgDocument) {
            const doc = new DOMParser().parseFromString(svgDocument, 'image/svg+xml');
            if (doc.getElementById(v)) return `El ID "${v}" ya existe`;
        }
        return null;
    };

    const handleCommit = () => {
        const trimmed = value.trim();
        const err = validate(trimmed);
        if (err) {
            setStatus('error');
            setErrorMsg(err);
            return;
        }
        if (trimmed !== elementId) updateElementId(elementId, trimmed);
        setStatus('success');
        setTimeout(() => setStatus('idle'), 1500);
    };

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-1">
                <input
                    type="text"
                    value={value}
                    onChange={(e) => { setValue(e.target.value); setStatus('idle'); }}
                    onBlur={handleCommit}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    className={`flex-1 text-xs font-mono border rounded px-2 py-1.5 outline-none transition-colors ${
                        status === 'error' ? 'border-red-400 bg-red-50' :
                        status === 'success' ? 'border-emerald-400 bg-emerald-50' :
                        'border-slate-200 focus:border-violet-400'
                    }`}
                />
                {status === 'success' && <Check size={14} className="text-emerald-500 shrink-0" />}
            </div>
            {status === 'error' && <p className="text-[10px] text-red-500">{errorMsg}</p>}
        </div>
    );
};

// ── DeleteButton sub-component ─────────────────────────────────────────────
const DeleteButton: React.FC<{ elementId: string }> = ({ elementId }) => {
    const { deleteElement } = useSVGEditorStore();
    const [confirming, setConfirming] = useState(false);

    return confirming ? (
        <div className="space-y-2">
            <p className="text-xs text-slate-600">¿Eliminar este elemento y sus hijos?</p>
            <div className="flex gap-2">
                <button
                    onClick={() => setConfirming(false)}
                    className="flex-1 py-1.5 text-xs border border-slate-200 rounded hover:bg-slate-100 transition-colors"
                >
                    Cancelar
                </button>
                <button
                    onClick={() => { deleteElement(elementId); setConfirming(false); }}
                    className="flex-1 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
                >
                    Eliminar
                </button>
            </div>
        </div>
    ) : (
        <button
            onClick={() => setConfirming(true)}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 border border-red-200 rounded transition-colors"
        >
            <Trash2 size={13} />
            Eliminar elemento
        </button>
    );
};

// ── StylePanel ─────────────────────────────────────────────────────────────
interface StylePanelProps {
    styleDefs?: StyleDefinition[];
}

export const StylePanel: React.FC<StylePanelProps> = ({ styleDefs = [] }) => {
    const { selectedElementId, svgDocument, updateElementAttributes } = useSVGEditorStore();
    const [styles, setStyles] = useState({
        fill: '#000000',
        stroke: 'none',
        strokeWidth: '0',
        opacity: '1'
    });
    const [hasInline, setHasInline] = useState(false);
    const [currentClass, setCurrentClass] = useState('');

    useEffect(() => {
        if (!selectedElementId || !svgDocument) return;
        const doc = new DOMParser().parseFromString(svgDocument, 'image/svg+xml');
        const el = doc.getElementById(selectedElementId);

        if (el) {
            setCurrentClass(el.getAttribute('class') || '');

            const hasInlineStyles = !!(
                el.getAttribute('fill') ||
                el.getAttribute('stroke') ||
                el.getAttribute('stroke-width') ||
                el.getAttribute('style')
            );
            setHasInline(hasInlineStyles);

            const getVal = (attr: string) =>
                el.getAttribute(attr) || el.style.getPropertyValue(attr) ||
                (attr === 'opacity' ? '1' : attr === 'stroke' ? 'none' : attr === 'stroke-width' ? '0' : '#000000');

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
        updateElementAttributes(selectedElementId, { [key]: value });
    };

    const handleClearInlineStyles = () => {
        if (!selectedElementId) return;
        updateElementAttributes(selectedElementId, {
            fill: null,
            stroke: null,
            'stroke-width': null,
            opacity: null,
            style: null,
        });
        setHasInline(false);
    };

    const handleClassToggle = (cls: string) => {
        if (!selectedElementId) return;
        if (currentClass === cls) {
            updateElementAttributes(selectedElementId, { class: null });
            setCurrentClass('');
        } else {
            updateElementAttributes(selectedElementId, { class: cls });
            setCurrentClass(cls);
        }
    };

    if (!selectedElementId) {
        return (
            <div id="svg-editor-props-empty" className="p-6 text-center text-slate-500 text-sm">
                <p>Selecciona un elemento en el lienzo o en el árbol para editar sus propiedades.</p>
            </div>
        );
    }

    return (
        <div id="svg-editor-props-content" className="flex flex-col h-full bg-white">
            {/* Header */}
            <div id="svg-editor-props-header" className="p-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900">Propiedades</h3>
                <p className="text-xs text-slate-500">ID: {selectedElementId}</p>
            </div>

            <div className="p-4 space-y-6 overflow-y-auto flex-1">

                {/* Galería de estilos CSS */}
                <div id="svg-editor-props-styles" className="space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Clase CSS
                        </label>
                        {currentClass && (
                            <button
                                onClick={() => handleClassToggle(currentClass)}
                                className="text-[10px] text-slate-400 hover:text-red-500 font-mono underline underline-offset-2 transition-colors"
                            >
                                sin clase
                            </button>
                        )}
                    </div>

                    {styleDefs.length > 0 ? (
                        <div className="grid grid-cols-4 gap-2">
                            {styleDefs.map(styleDef => {
                                const cls = styleDef.selectors[0]?.replace(/^\./, '') ?? '';
                                const isActive = currentClass === cls;
                                return (
                                    <div
                                        key={styleDef.id}
                                        onClick={() => handleClassToggle(cls)}
                                        className={`bg-slate-100 rounded-lg p-1.5 cursor-pointer transition-all
                                            ${isActive
                                                ? 'ring-2 ring-violet-500 bg-violet-50'
                                                : 'hover:ring-1 hover:ring-slate-300'
                                            }`}
                                    >
                                        <StylePreviewCard
                                            styleDef={styleDef}
                                            shape="square"
                                            onClick={() => {}}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-[11px] text-slate-400 italic">
                            No hay estilos definidos.
                        </p>
                    )}
                </div>

                {/* Estilos inline — solo si el elemento los tiene */}
                {hasInline && (
                    <div id="svg-editor-props-inline" className="space-y-6">
                        <div className="flex items-center justify-between pt-1">
                            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                                Estilos hardcodeados
                            </span>
                            <button
                                onClick={handleClearInlineStyles}
                                className="text-[10px] text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                            >
                                Limpiar todos
                            </button>
                        </div>

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
                )}
            </div>

            {/* ── Element identity section ── */}
            <div id="svg-editor-props-identity" className="border-t border-slate-100 p-4 space-y-3">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Identidad
                </h4>
                <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase tracking-wider">ID del elemento</label>
                    <RenameField elementId={selectedElementId} />
                </div>
            </div>

            {/* ── Danger zone ── */}
            <div id="svg-editor-props-danger" className="border-t border-red-100 p-4 mt-auto shrink-0">
                <DeleteButton elementId={selectedElementId} />
            </div>
        </div>
    );
};
