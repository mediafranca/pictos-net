import React, { useEffect, useState } from 'react';
import { useSVGEditorStore } from '../../stores/svgEditorStore';
import { Trash2, Check, RotateCcw, X } from 'lucide-react';
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

// ── PropertyRow — shows one CSS property with optional override editing ──────
interface PropertyRowProps {
    label: string;
    property: string;
    value: string;
    libraryValue?: string;
    onChange: (property: string, value: string) => void;
}

const PropertyRow: React.FC<PropertyRowProps> = ({ label, property, value, libraryValue, onChange }) => {
    const isOverridden = libraryValue !== undefined && value !== libraryValue;
    const isColor = property === 'fill' || property === 'stroke';

    return (
        <div className="flex items-center gap-1.5 text-[10px]">
            <span className={`w-16 shrink-0 font-mono text-slate-500 ${isOverridden ? 'text-amber-600' : ''}`}>
                {label}
                {isOverridden && <span className="ml-0.5 text-amber-500">*</span>}
            </span>
            {isColor && (
                <div className="relative w-5 h-5 rounded border border-slate-200 overflow-hidden shrink-0">
                    <input
                        type="color"
                        value={value && value !== 'none' ? value : '#000000'}
                        onChange={(e) => onChange(property, e.target.value)}
                        className="absolute -top-0.5 -left-0.5 w-7 h-7 p-0 border-0 cursor-pointer"
                    />
                </div>
            )}
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(property, e.target.value)}
                className="flex-1 min-w-0 font-mono border border-slate-200 rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:border-violet-400 bg-white"
            />
        </div>
    );
};

// ── CitedClassEditor — expand/edit one cited class on the element ─────────────
interface CitedClassEditorProps {
    elementId: string;
    className: string;
    resolvedValues: Record<string, string>;
    libraryValues: Record<string, string>;
    onUncite: () => void;
    onRestore: () => void;
    onOverrideChange: (property: string, value: string) => void;
}

const CitedClassEditor: React.FC<CitedClassEditorProps> = ({
    className,
    resolvedValues,
    libraryValues,
    onUncite,
    onRestore,
    onOverrideChange,
}) => {
    const hasOverrides = Object.entries(resolvedValues).some(
        ([prop, val]) => libraryValues[prop] !== undefined && val !== libraryValues[prop]
    );

    // Show only the editable visual properties
    const editableProps = ['fill', 'stroke', 'stroke-width', 'opacity'].filter(
        p => resolvedValues[p] !== undefined || libraryValues[p] !== undefined
    );

    return (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 border-b border-slate-100">
                <span className="text-[10px] font-mono text-violet-700 font-bold">.{className}</span>
                <div className="flex items-center gap-1">
                    {hasOverrides && (
                        <button
                            onClick={onRestore}
                            className="flex items-center gap-0.5 text-[9px] text-amber-600 hover:text-amber-800 hover:bg-amber-50 px-1.5 py-0.5 rounded transition-colors"
                            title="Restore to library original"
                        >
                            <RotateCcw size={9} />
                            restaurar
                        </button>
                    )}
                    <button
                        onClick={onUncite}
                        className="flex items-center gap-0.5 text-[9px] text-slate-400 hover:text-red-500 hover:bg-red-50 px-1.5 py-0.5 rounded transition-colors"
                        title="Remove class from element"
                    >
                        <X size={9} />
                        quitar
                    </button>
                </div>
            </div>
            <div className="px-2.5 py-2 space-y-1.5">
                {editableProps.length > 0 ? editableProps.map(prop => (
                    <PropertyRow
                        key={prop}
                        label={prop}
                        property={prop}
                        value={resolvedValues[prop] ?? libraryValues[prop] ?? ''}
                        libraryValue={libraryValues[prop]}
                        onChange={onOverrideChange}
                    />
                )) : (
                    <p className="text-[10px] text-slate-400 italic">sin propiedades visuales</p>
                )}
                {hasOverrides && (
                    <p className="text-[9px] text-amber-500 mt-1">
                        * modificado — distinto del original de biblioteca
                    </p>
                )}
            </div>
        </div>
    );
};

// ── StylePanel ────────────────────────────────────────────────────────────────
interface StylePanelProps {
    styleDefs?: StyleDefinition[];
}

/**
 * Right panel of the SVG Editor.
 * Implements the two-level zero-inline-styles model:
 *   - Level 1 (class library): cite/uncite classes from the library grid
 *   - Level 2 (local overrides): edit per-element CSS overrides in the <style> block
 * @see CSS_STYLING_ARCHITECTURE.md
 */
export const StylePanel: React.FC<StylePanelProps> = ({ styleDefs = [] }) => {
    const { t } = useTranslation();
    const {
        selectedElementId,
        svgDocument,
        overrideMap,
        libraryValues,
        citeClass,
        unciteClass,
        setLocalOverride,
        restoreClassToLibrary,
        getResolvedClassValues,
    } = useSVGEditorStore();

    const [currentClasses, setCurrentClasses] = useState<string[]>([]);

    // Sync currentClasses from svgDocument whenever element or document changes
    useEffect(() => {
        if (!selectedElementId || !svgDocument) { setCurrentClasses([]); return; }
        const doc = new DOMParser().parseFromString(svgDocument, 'image/svg+xml');
        const el = doc.getElementById(selectedElementId);
        if (!el) { setCurrentClasses([]); return; }
        const classAttr = el.getAttribute('class') || '';
        setCurrentClasses(classAttr.split(' ').filter(Boolean));
    }, [selectedElementId, svgDocument]);

    if (!selectedElementId) {
        return (
            <div id="svg-editor-props-empty" className="p-6 text-center text-slate-400 text-sm">
                <p>{t('svgEditor.selectElement')}</p>
            </div>
        );
    }

    const handleCite = (cls: string) => {
        if (!selectedElementId) return;
        citeClass(selectedElementId, cls);
    };

    const handleUncite = (cls: string) => {
        if (!selectedElementId) return;
        unciteClass(selectedElementId, cls);
    };

    const handleRestore = (cls: string) => {
        if (!selectedElementId) return;
        restoreClassToLibrary(selectedElementId, cls);
    };

    const handleOverrideChange = (cls: string, property: string, value: string) => {
        if (!selectedElementId) return;
        setLocalOverride(selectedElementId, cls, { [property]: value });
    };

    return (
        <div id="svg-editor-props-content" className="flex flex-col h-full">

            {/* Header */}
            <div id="svg-editor-props-header" className="px-4 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('svgEditor.properties')}</p>
                <p className="text-xs font-mono text-slate-700 mt-0.5 truncate">{selectedElementId}</p>
            </div>

            <div className="flex-1 overflow-y-auto">

                {/* ── Section A: Library — cite/uncite from grid ── */}
                <div id="svg-editor-props-styles" className="px-4 py-4 border-b border-slate-100 space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        {t('svgEditor.cssClass')}
                    </label>

                    {styleDefs.length > 0 ? (
                        <div className="grid grid-cols-4 gap-1.5">
                            {styleDefs.map(styleDef => {
                                const cls = styleDef.selectors[0]?.replace(/^\./, '') ?? '';
                                const isCited = currentClasses.includes(cls);
                                return (
                                    <button
                                        key={styleDef.id}
                                        onClick={() => isCited ? handleUncite(cls) : handleCite(cls)}
                                        title={isCited ? `quitar .${cls}` : `citar .${cls}`}
                                        className={`rounded-lg p-1.5 transition-all text-left ${
                                            isCited
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
                </div>

                {/* ── Section B: Cited classes — local overrides ── */}
                {currentClasses.length > 0 && (
                    <div id="svg-editor-props-overrides" className="px-4 py-4 space-y-3">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                            {t('svgEditor.localOverride')}
                        </label>

                        {currentClasses.map(cls => {
                            const resolved = getResolvedClassValues(selectedElementId, cls);
                            const libVals = libraryValues.get(cls) ?? {};
                            // Also show from-inline override rules if present
                            const overrides = overrideMap.get(selectedElementId)?.get(cls) ?? {};
                            const mergedResolved = { ...libVals, ...overrides, ...resolved };

                            return (
                                <CitedClassEditor
                                    key={cls}
                                    elementId={selectedElementId}
                                    className={cls}
                                    resolvedValues={mergedResolved}
                                    libraryValues={libVals}
                                    onUncite={() => handleUncite(cls)}
                                    onRestore={() => handleRestore(cls)}
                                    onOverrideChange={(prop, val) => handleOverrideChange(cls, prop, val)}
                                />
                            );
                        })}
                    </div>
                )}

                {/* From-inline rules (unlinked to a library class) */}
                {(() => {
                    const fromInline = overrideMap.get(selectedElementId)?.get('from-inline');
                    if (!fromInline || Object.keys(fromInline).length === 0) return null;
                    return (
                        <div className="px-4 pb-4">
                            <div className="border border-amber-200 rounded-lg overflow-hidden bg-amber-50">
                                <div className="px-2.5 py-1.5 border-b border-amber-100 flex items-center justify-between">
                                    <span className="text-[10px] font-mono text-amber-700 font-bold">from-inline</span>
                                    <span className="text-[9px] text-amber-600">estilos convertidos del pipeline</span>
                                </div>
                                <div className="px-2.5 py-2 space-y-1.5">
                                    {Object.entries(fromInline).map(([prop, val]) => (
                                        <PropertyRow
                                            key={prop}
                                            label={prop}
                                            property={prop}
                                            value={val}
                                            onChange={(p, v) => setLocalOverride(selectedElementId, 'from-inline', { [p]: v })}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    );
                })()}
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
