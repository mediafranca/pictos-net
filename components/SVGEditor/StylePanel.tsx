import React, { useEffect, useState } from 'react';
import { useSVGEditorStore } from '../../stores/svgEditorStore';
import { Trash2, Check, Eraser } from 'lucide-react';
import type { StyleDefinition } from '../../lib/style-editor/lib/types';
import StylePreviewCard from '../../lib/style-editor/lib/components/StylePreviewCard';
import { useTranslation } from '../../hooks/useTranslation';

// ── RenameField ─────────────────────────────────────────────────────────────
const RenameField: React.FC<{ elementId: string }> = ({ elementId }) => {
    const { t } = useTranslation();
    const { updateElementId, svgDocument } = useSVGEditorStore();
    const [value, setValue] = useState(elementId);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        setValue(elementId);
        setStatus('idle');
    }, [elementId]);

    const validate = (v: string): string | null => {
        if (!v.trim()) return t('svgEditor.idEmpty');
        if (!/^[a-zA-Z0-9_-]+$/.test(v)) return t('svgEditor.idInvalidChars');
        if (v === elementId) return null;
        if (svgDocument) {
            const doc = new DOMParser().parseFromString(svgDocument, 'image/svg+xml');
            if (doc.getElementById(v)) return t('svgEditor.idExists', { id: v });
        }
        return null;
    };

    const handleCommit = () => {
        const trimmed = value.trim();
        const err = validate(trimmed);
        if (err) { setStatus('error'); setErrorMsg(err); return; }
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
                        status === 'error'   ? 'border-red-400 bg-red-50' :
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

// ── DeleteButton ─────────────────────────────────────────────────────────────
const DeleteButton: React.FC<{ elementId: string }> = ({ elementId }) => {
    const { t } = useTranslation();
    const { deleteElement } = useSVGEditorStore();
    const [confirming, setConfirming] = useState(false);

    return confirming ? (
        <div className="space-y-2">
            <p className="text-xs text-slate-600">{t('svgEditor.deleteWithChildren')}</p>
            <div className="flex gap-2">
                <button
                    onClick={() => setConfirming(false)}
                    className="flex-1 py-1.5 text-xs border border-slate-200 rounded hover:bg-slate-100 transition-colors"
                >
                    {t('actions.cancel')}
                </button>
                <button
                    onClick={() => { deleteElement(elementId); setConfirming(false); }}
                    className="flex-1 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
                >
                    {t('actions.delete')}
                </button>
            </div>
        </div>
    ) : (
        <button
            onClick={() => setConfirming(true)}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 border border-red-200 rounded transition-colors"
        >
            <Trash2 size={13} />
            {t('svgEditor.deleteElement')}
        </button>
    );
};

// ── StylePanel ────────────────────────────────────────────────────────────────
interface StylePanelProps {
    styleDefs?: StyleDefinition[];
}

export const StylePanel: React.FC<StylePanelProps> = ({ styleDefs = [] }) => {
    const { t } = useTranslation();
    const { selectedElementId, svgDocument, updateElementAttributes } = useSVGEditorStore();

    // Multi-class set: each class is an independent on/off switch
    const [currentClasses, setCurrentClasses] = useState<Set<string>>(new Set());

    // Inline style values (empty string = not set)
    const [styles, setStyles] = useState({ fill: '', stroke: '', strokeWidth: '' });
    const [hasInline, setHasInline] = useState(false);

    useEffect(() => {
        if (!selectedElementId || !svgDocument) return;
        const doc = new DOMParser().parseFromString(svgDocument, 'image/svg+xml');
        const el = doc.getElementById(selectedElementId);
        if (!el) return;

        // Parse active classes
        const classAttr = el.getAttribute('class') || '';
        setCurrentClasses(new Set(classAttr.split(' ').filter(Boolean)));

        // Parse inline style attributes
        const fill = el.getAttribute('fill') || el.style.fill || '';
        const stroke = el.getAttribute('stroke') || el.style.stroke || '';
        const strokeWidth = el.getAttribute('stroke-width') || el.style.strokeWidth || '';
        setStyles({ fill, stroke, strokeWidth });
        setHasInline(!!(fill || stroke || strokeWidth || el.getAttribute('style')));
    }, [selectedElementId, svgDocument]);

    // Toggle a single CSS class on/off (multi-select: other classes stay)
    const handleClassToggle = (cls: string) => {
        if (!selectedElementId) return;
        const next = new Set(currentClasses);
        if (next.has(cls)) {
            next.delete(cls);
        } else {
            next.add(cls);
        }
        setCurrentClasses(next);
        const classStr = [...next].join(' ') || null;
        updateElementAttributes(selectedElementId, { class: classStr });
    };

    // Set an inline attribute; passing empty removes it
    const handleInlineChange = (attr: 'fill' | 'stroke' | 'stroke-width', value: string) => {
        if (!selectedElementId) return;
        const stateKey = attr === 'stroke-width' ? 'strokeWidth' : attr;
        setStyles(prev => ({ ...prev, [stateKey]: value }));
        updateElementAttributes(selectedElementId, { [attr]: value || null });
        if (value) setHasInline(true);
    };

    const handleClearInline = () => {
        if (!selectedElementId) return;
        updateElementAttributes(selectedElementId, {
            fill: null, stroke: null, 'stroke-width': null, opacity: null, style: null,
        });
        setStyles({ fill: '', stroke: '', strokeWidth: '' });
        setHasInline(false);
    };

    if (!selectedElementId) {
        return (
            <div id="svg-editor-props-empty" className="p-6 text-center text-slate-400 text-sm">
                <p>{t('svgEditor.selectElement')}</p>
            </div>
        );
    }

    return (
        <div id="svg-editor-props-content" className="flex flex-col h-full">

            {/* Header */}
            <div id="svg-editor-props-header" className="px-4 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('svgEditor.properties')}</p>
                <p className="text-xs font-mono text-slate-700 mt-0.5 truncate">{selectedElementId}</p>
            </div>

            <div className="flex-1 overflow-y-auto">

                {/* ── CSS Classes: multi-select toggles ── */}
                <div id="svg-editor-props-styles" className="px-4 py-4 border-b border-slate-100 space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            {t('svgEditor.cssClass')}
                        </label>
                        {currentClasses.size > 0 && (
                            <button
                                onClick={() => {
                                    if (!selectedElementId) return;
                                    setCurrentClasses(new Set());
                                    updateElementAttributes(selectedElementId, { class: null });
                                }}
                                className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
                            >
                                {t('svgEditor.noClass')}
                            </button>
                        )}
                    </div>

                    {styleDefs.length > 0 ? (
                        <div className="grid grid-cols-4 gap-1.5">
                            {styleDefs.map(styleDef => {
                                const cls = styleDef.selectors[0]?.replace(/^\./, '') ?? '';
                                const isActive = currentClasses.has(cls);
                                return (
                                    <button
                                        key={styleDef.id}
                                        onClick={() => handleClassToggle(cls)}
                                        title={`.${cls}`}
                                        className={`rounded-lg p-1.5 transition-all text-left ${
                                            isActive
                                                ? 'ring-2 ring-violet-500 bg-violet-50'
                                                : 'bg-slate-100 hover:ring-1 hover:ring-slate-300'
                                        }`}
                                    >
                                        <StylePreviewCard
                                            styleDef={styleDef}
                                            shape="square"
                                            onClick={() => {}}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-[11px] text-slate-400 italic">No hay estilos definidos.</p>
                    )}

                    {/* Active classes summary */}
                    {currentClasses.size > 0 && (
                        <p className="text-[10px] font-mono text-violet-600">
                            {[...currentClasses].map(c => `.${c}`).join(' ')}
                        </p>
                    )}
                </div>

                {/* ── Inline style controls — always visible ── */}
                <div id="svg-editor-props-inline" className="px-4 py-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            {t('svgEditor.inlineStyles')}
                        </label>
                        <button
                            onClick={handleClearInline}
                            disabled={!hasInline}
                            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors ${
                                hasInline
                                    ? 'text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200'
                                    : 'text-slate-300 border-slate-100 cursor-not-allowed'
                            }`}
                        >
                            <Eraser size={10} />
                            {t('svg.clearInlineStyles')}
                        </button>
                    </div>

                    {/* Fill */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">
                            {t('svgEditor.fill')}
                        </label>
                        <div className="flex items-center gap-2">
                            <div className="relative w-8 h-8 rounded border border-slate-200 overflow-hidden shrink-0">
                                <input
                                    type="color"
                                    value={styles.fill && styles.fill !== 'none' ? styles.fill : '#000000'}
                                    onChange={(e) => handleInlineChange('fill', e.target.value)}
                                    className="absolute -top-1 -left-1 w-12 h-12 p-0 border-0 cursor-pointer"
                                />
                            </div>
                            <input
                                type="text"
                                value={styles.fill}
                                placeholder="—"
                                onChange={(e) => handleInlineChange('fill', e.target.value)}
                                className="flex-1 text-xs border border-slate-200 rounded px-2 py-1.5 font-mono focus:outline-none focus:border-violet-400"
                            />
                            <button
                                onClick={() => handleInlineChange('fill', 'none')}
                                className={`px-2 py-1.5 text-[10px] border rounded shrink-0 transition-colors ${
                                    styles.fill === 'none'
                                        ? 'bg-slate-800 text-white border-slate-800'
                                        : 'border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                {t('svgEditor.noFill')}
                            </button>
                        </div>
                    </div>

                    {/* Stroke */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">
                            {t('svgEditor.stroke')}
                        </label>
                        <div className="flex items-center gap-2">
                            <div className="relative w-8 h-8 rounded border border-slate-200 overflow-hidden shrink-0">
                                <input
                                    type="color"
                                    value={styles.stroke && styles.stroke !== 'none' ? styles.stroke : '#000000'}
                                    onChange={(e) => handleInlineChange('stroke', e.target.value)}
                                    className="absolute -top-1 -left-1 w-12 h-12 p-0 border-0 cursor-pointer"
                                />
                            </div>
                            <input
                                type="text"
                                value={styles.stroke}
                                placeholder="—"
                                onChange={(e) => handleInlineChange('stroke', e.target.value)}
                                className="flex-1 text-xs border border-slate-200 rounded px-2 py-1.5 font-mono focus:outline-none focus:border-violet-400"
                            />
                            <button
                                onClick={() => handleInlineChange('stroke', 'none')}
                                className={`px-2 py-1.5 text-[10px] border rounded shrink-0 transition-colors ${
                                    styles.stroke === 'none'
                                        ? 'bg-slate-800 text-white border-slate-800'
                                        : 'border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                {t('svgEditor.noStroke')}
                            </button>
                        </div>
                    </div>

                    {/* Stroke-width */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">
                            {t('svgEditor.strokeWidth')}
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                type="range"
                                min="0"
                                max="20"
                                step="0.5"
                                value={parseFloat(styles.strokeWidth) || 0}
                                onChange={(e) => handleInlineChange('stroke-width', e.target.value)}
                                className="flex-1"
                            />
                            <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={parseFloat(styles.strokeWidth) || 0}
                                onChange={(e) => handleInlineChange('stroke-width', e.target.value)}
                                className="w-14 text-xs border border-slate-200 rounded px-2 py-1.5 font-mono text-right focus:outline-none focus:border-violet-400"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Identity ── */}
            <div id="svg-editor-props-identity" className="border-t border-slate-100 px-4 py-3 space-y-1.5 shrink-0">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {t('svgEditor.elementId')}
                </label>
                <RenameField elementId={selectedElementId} />
            </div>

            {/* ── Danger zone ── */}
            <div id="svg-editor-props-danger" className="border-t border-red-100 px-4 py-3 shrink-0">
                <DeleteButton elementId={selectedElementId} />
            </div>
        </div>
    );
};
