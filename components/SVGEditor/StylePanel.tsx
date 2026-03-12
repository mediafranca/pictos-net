import React, { useEffect, useState } from 'react';
import { useSVGEditorStore } from '../../stores/svgEditorStore';
import { Trash2, Check, RotateCcw, X, Plus, Ungroup, AlertTriangle, Sparkles, Pencil, Wand2 } from 'lucide-react';
import type { StyleDefinition } from '../../lib/style-editor/lib/types';
import { useTranslation } from '../../hooks/useTranslation';
import { StylePickerModal } from './StylePickerModal';
import EditModal from '../../lib/style-editor/lib/components/EditModal';
import { INITIAL_KEYFRAMES } from '../../lib/style-editor/lib/keyframeConstants';

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
            {status === 'error' && <p className="text-xs text-red-500">{errorMsg}</p>}
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
            <Trash2 size={13} aria-hidden="true" />
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
        <div className="flex items-center gap-1.5 text-xs">
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
                className="flex-1 min-w-0 font-mono border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-violet-400 bg-white"
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

    const editableProps = ['fill', 'stroke', 'stroke-width', 'opacity'].filter(
        p => resolvedValues[p] !== undefined || libraryValues[p] !== undefined
    );

    return (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 border-b border-slate-100">
                <span className="text-xs font-mono text-violet-700 font-bold">.{className}</span>
                <div className="flex items-center gap-1">
                    {hasOverrides && (
                        <button
                            onClick={onRestore}
                            className="flex items-center gap-0.5 text-xs text-amber-600 hover:text-amber-800 hover:bg-amber-50 px-1.5 py-0.5 rounded transition-colors"
                            title="Restore to library original"
                        >
                            <RotateCcw size={9} />
                            restaurar
                        </button>
                    )}
                    <button
                        onClick={onUncite}
                        className="flex items-center gap-0.5 text-xs text-slate-500 hover:text-red-500 hover:bg-red-50 px-1.5 py-0.5 rounded transition-colors"
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
                    <p className="text-xs text-slate-500 italic">sin propiedades visuales</p>
                )}
                {hasOverrides && (
                    <p className="text-xs text-amber-500 mt-1">
                        * modificado — distinto del original de biblioteca
                    </p>
                )}
            </div>
        </div>
    );
};

// ── InlineAttrsPanel — displays presentation attrs for raw SVG elements ──────
interface InlineAttrsPanelProps {
    elementId: string;
    onConvertToClass?: (declarations: Record<string, string>) => void;
}

const InlineAttrsPanel: React.FC<InlineAttrsPanelProps> = ({ elementId, onConvertToClass }) => {
    const { t } = useTranslation();
    const { svgDocument, updateElementAttributes, stripInlineStyles } = useSVGEditorStore();
    const [confirming, setConfirming] = useState(false);

    if (!svgDocument) return null;

    const doc = new DOMParser().parseFromString(svgDocument, 'image/svg+xml');
    const el = doc.getElementById(elementId);
    if (!el) return null;

    const fill = el.getAttribute('fill');
    const stroke = el.getAttribute('stroke');
    const opacity = el.getAttribute('opacity');
    const strokeWidth = el.getAttribute('stroke-width');

    const attrs = [
        fill && { label: t('svgEditor.inlineFill'), prop: 'fill', value: fill },
        stroke && { label: t('svgEditor.inlineStroke'), prop: 'stroke', value: stroke },
        strokeWidth && { label: t('svgEditor.strokeWidth'), prop: 'stroke-width', value: strokeWidth },
        opacity && { label: t('svgEditor.inlineOpacity'), prop: 'opacity', value: opacity },
    ].filter(Boolean) as { label: string; prop: string; value: string }[];

    if (attrs.length === 0) return null;

    return (
        <div className="px-4 py-3 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {t('svgEditor.presentationAttrs')}
            </label>
            <div className="space-y-1.5">
                {attrs.map(a => (
                    <PropertyRow
                        key={a.prop}
                        label={a.label}
                        property={a.prop}
                        value={a.value}
                        onChange={(prop, val) => updateElementAttributes(elementId, { [prop]: val })}
                    />
                ))}
            </div>

            {onConvertToClass && (
                <button
                    onClick={() => onConvertToClass(attrs.reduce((acc, a) => ({ ...acc, [a.prop]: a.value }), {} as Record<string, string>))}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-violet-600 hover:bg-violet-50 border border-violet-200 rounded transition-colors"
                >
                    <Wand2 size={11} aria-hidden="true" />
                    {t('svgEditor.convertToClass')}
                </button>
            )}

            {confirming ? (
                <div className="space-y-2 mt-2">
                    <p className="text-xs text-amber-600 flex items-start gap-1">
                        <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                        {t('svgEditor.removeInlineStylesWarning')}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setConfirming(false)}
                            className="flex-1 py-1 text-xs border border-slate-200 rounded hover:bg-slate-100 transition-colors"
                        >
                            {t('actions.cancel')}
                        </button>
                        <button
                            onClick={() => { stripInlineStyles(elementId); setConfirming(false); }}
                            className="flex-1 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded transition-colors"
                        >
                            {t('svgEditor.removeInlineStyles')}
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setConfirming(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-amber-600 hover:bg-amber-50 border border-amber-200 rounded transition-colors"
                >
                    {t('svgEditor.removeInlineStyles')}
                </button>
            )}
        </div>
    );
};

// ── GroupPanel — actions for <g> elements ─────────────────────────────────────
interface GroupPanelProps {
    elementId: string;
    onOpenPicker: () => void;
}

const GroupPanel: React.FC<GroupPanelProps> = ({ elementId, onOpenPicker }) => {
    const { t } = useTranslation();
    const { ungroupElement, stripInlineStyles, svgDocument } = useSVGEditorStore();
    const [confirmStrip, setConfirmStrip] = useState(false);

    // Check if element is a <g>
    if (!svgDocument) return null;
    const doc = new DOMParser().parseFromString(svgDocument, 'image/svg+xml');
    const el = doc.getElementById(elementId);
    if (!el || el.tagName.toLowerCase() !== 'g') return null;

    return (
        <div className="px-4 py-3 space-y-2 border-b border-slate-100">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {t('svgEditor.groupName')}
            </label>

            {/* Apply class — delegates to parent StylePickerModal */}
            <button
                onClick={onOpenPicker}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-violet-600 hover:bg-violet-50 border border-violet-200 rounded transition-colors"
            >
                <Plus size={10} aria-hidden="true" />
                {t('svgEditor.applyClass')}
            </button>

            {/* Strip inline styles with warning */}
            {confirmStrip ? (
                <div className="space-y-2">
                    <p className="text-xs text-amber-600 flex items-start gap-1">
                        <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                        {t('svgEditor.removeInlineStylesWarning')}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setConfirmStrip(false)}
                            className="flex-1 py-1 text-xs border border-slate-200 rounded hover:bg-slate-100 transition-colors"
                        >
                            {t('actions.cancel')}
                        </button>
                        <button
                            onClick={() => { stripInlineStyles(elementId); setConfirmStrip(false); }}
                            className="flex-1 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded transition-colors"
                        >
                            {t('svgEditor.removeInlineStyles')}
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setConfirmStrip(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-amber-600 hover:bg-amber-50 border border-amber-200 rounded transition-colors"
                >
                    {t('svgEditor.removeInlineStyles')}
                </button>
            )}

            {/* Animation placeholder */}
            <button
                disabled
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-slate-500 border border-slate-200 rounded cursor-not-allowed opacity-50"
                title={t('svgEditor.animationComingSoon')}
            >
                <Sparkles size={10} aria-hidden="true" />
                {t('svgEditor.animationComingSoon')}
            </button>

            {/* Ungroup */}
            <button
                onClick={() => ungroupElement(elementId)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 border border-slate-200 rounded transition-colors"
            >
                <Ungroup size={12} aria-hidden="true" />
                {t('svgEditor.ungroup')}
            </button>
        </div>
    );
};

// ── PathEditButton — enter/exit node editing mode ─────────────────────────────
const PathEditButton: React.FC<{ elementId: string }> = ({ elementId }) => {
    const { t } = useTranslation();
    const { pathEditMode, enterPathEditMode, exitPathEditMode, convertShapeToPath, svgDocument } = useSVGEditorStore();

    const elementTag = React.useMemo(() => {
        if (!svgDocument) return null;
        const doc = new DOMParser().parseFromString(svgDocument, 'image/svg+xml');
        const el = doc.getElementById(elementId);
        return el?.tagName.toLowerCase() ?? null;
    }, [elementId, svgDocument]);

    const editableTags = ['path', 'polygon', 'polyline', 'line', 'rect', 'circle', 'ellipse'];
    if (!elementTag || !editableTags.includes(elementTag)) return null;

    const isEditing = pathEditMode?.elementId === elementId;
    const needsConversion = ['rect', 'circle', 'ellipse'].includes(elementTag);

    if (needsConversion && !isEditing) {
        return (
            <div className="px-4 py-3 border-b border-slate-100 space-y-2">
                <p className="text-xs text-slate-500">{t('svgEditor.convertToPathDesc')}</p>
                <button
                    onClick={() => convertShapeToPath(elementId)}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs text-violet-600 hover:bg-violet-50 border border-violet-200 rounded transition-colors"
                >
                    <Pencil size={12} aria-hidden="true" />
                    {t('svgEditor.convertToPath')}
                </button>
            </div>
        );
    }

    return (
        <div className="px-4 py-3 border-b border-slate-100">
            {isEditing ? (
                <button
                    onClick={exitPathEditMode}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded transition-colors"
                >
                    <Pencil size={12} aria-hidden="true" />
                    {t('svgEditor.exitNodeEdit')}
                </button>
            ) : (
                <button
                    onClick={() => enterPathEditMode(elementId)}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs text-violet-600 hover:bg-violet-50 border border-violet-200 rounded transition-colors"
                >
                    <Pencil size={12} aria-hidden="true" />
                    {t('svgEditor.editNodes')}
                </button>
            )}
        </div>
    );
};

// ── StylePanel ────────────────────────────────────────────────────────────────
interface StylePanelProps {
    styleDefs?: StyleDefinition[];
    svgSource?: 'raw' | 'structured' | null;
}

/**
 * Right panel of the SVG Editor.
 *
 * Layout order:
 *   1. Element ID (RenameField) — header
 *   2. Inline presentation attributes (with "convert to class")
 *   3. Cited classes with local override editors
 *   4. Apply class / Define buttons
 *   5. Danger zone (delete)
 *
 * @see CSS_STYLING_ARCHITECTURE.md
 */
export const StylePanel: React.FC<StylePanelProps> = ({ styleDefs = [], svgSource = null }) => {
    const { t } = useTranslation();
    const {
        selectedElementId,
        svgDocument,
        overrideMap,
        libraryValues,
        unciteClass,
        citeClass,
        setLocalOverride,
        restoreClassToLibrary,
        getResolvedClassValues,
        defineLocalStyle,
    } = useSVGEditorStore();

    const [currentClasses, setCurrentClasses] = useState<string[]>([]);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editModalPreset, setEditModalPreset] = useState<Record<string, string> | null>(null);
    const isRaw = svgSource === 'raw';

    // Sync currentClasses from svgDocument whenever element or document changes
    useEffect(() => {
        if (!selectedElementId || !svgDocument) { setCurrentClasses([]); return; }
        const doc = new DOMParser().parseFromString(svgDocument, 'image/svg+xml');
        const el = doc.getElementById(selectedElementId);
        if (!el) { setCurrentClasses([]); return; }
        const classAttr = el.getAttribute('class') || '';
        setCurrentClasses(classAttr.split(' ').filter(Boolean));
    }, [selectedElementId, svgDocument]);

    // Close modals when selection changes
    useEffect(() => {
        setIsPickerOpen(false);
        setIsEditModalOpen(false);
        setEditModalPreset(null);
    }, [selectedElementId]);

    if (!selectedElementId) {
        return (
            <div id="svg-editor-props-empty" className="p-6 text-center text-slate-500 text-sm">
                <p>{t('svgEditor.selectElement')}</p>
            </div>
        );
    }

    const handleUncite = (cls: string) => unciteClass(selectedElementId, cls);
    const handleRestore = (cls: string) => restoreClassToLibrary(selectedElementId, cls);
    const handleOverrideChange = (cls: string, property: string, value: string) => {
        setLocalOverride(selectedElementId, cls, { [property]: value });
    };

    const handleSaveNewClass = (styleDef: StyleDefinition) => {
        const className = styleDef.selectors[0]?.replace(/^\./, '') ?? '';
        if (!className) return;
        defineLocalStyle(className, Object.fromEntries(styleDef.rules.map(r => [r.property, r.value])));
        if (selectedElementId) {
            citeClass(selectedElementId, className);
        }
        setIsEditModalOpen(false);
        setEditModalPreset(null);
    };

    const handleConvertToClass = (declarations: Record<string, string>) => {
        setEditModalPreset(declarations);
        setIsEditModalOpen(true);
    };

    return (
        <div id="svg-editor-props-content" className="flex flex-col h-full">

            {/* 1. Header with editable Element ID */}
            <div id="svg-editor-props-header" className="px-4 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    {t('svgEditor.properties')}
                </p>
                <RenameField elementId={selectedElementId} />
            </div>

            <div className="flex-1 overflow-y-auto">

                {/* Path edit mode */}
                <PathEditButton elementId={selectedElementId} />

                {/* Group-specific panel */}
                <GroupPanel
                    elementId={selectedElementId}
                    onOpenPicker={() => setIsPickerOpen(true)}
                />

                {/* 2. Inline presentation attributes */}
                <InlineAttrsPanel
                    elementId={selectedElementId}
                    onConvertToClass={handleConvertToClass}
                />

                {/* 3. Cited classes with local override editors */}
                <div id="svg-editor-props-overrides" className="px-4 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            {isRaw ? t('svgEditor.applyClass') : t('svgEditor.localOverride')}
                        </label>
                        {/* 4. Apply class / Define buttons */}
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setIsEditModalOpen(true)}
                                className="flex items-center gap-1 text-xs text-slate-500 hover:text-violet-600 hover:bg-violet-50 px-2 py-1 rounded transition-colors border border-transparent hover:border-violet-200"
                                title={t('svgEditor.defineNewClass')}
                            >
                                <Plus size={10} aria-hidden="true" />
                                Define
                            </button>
                            <button
                                onClick={() => setIsPickerOpen(true)}
                                className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 hover:bg-violet-50 px-2 py-1 rounded transition-colors border border-violet-200"
                            >
                                <Plus size={10} aria-hidden="true" />
                                {t('svgEditor.addStyle')}
                            </button>
                        </div>
                    </div>

                    {currentClasses.length === 0 ? (
                        <div className="py-6 text-center">
                            <p className="text-xs text-slate-500 italic">{t('svgEditor.noStylesAssigned')}</p>
                        </div>
                    ) : (
                        currentClasses.map(cls => {
                            const resolved = getResolvedClassValues(selectedElementId, cls);
                            const libVals = libraryValues.get(cls) ?? {};
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
                        })
                    )}
                </div>

                {/* From-inline rules (not linked to a library class) — only for structured */}
                {!isRaw && (() => {
                    const fromInline = overrideMap.get(selectedElementId)?.get('from-inline');
                    if (!fromInline || Object.keys(fromInline).length === 0) return null;
                    return (
                        <div className="px-4 pb-4">
                            <div className="border border-amber-200 rounded-lg overflow-hidden bg-amber-50">
                                <div className="px-2.5 py-1.5 border-b border-amber-100 flex items-center justify-between">
                                    <span className="text-xs font-mono text-amber-700 font-bold">from-inline</span>
                                    <span className="text-xs text-amber-600">{t('svgEditor.fromInlineLabel')}</span>
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

            {/* 5. Danger zone */}
            <div id="svg-editor-props-danger" className="border-t border-red-100 px-4 py-3 shrink-0">
                <DeleteButton elementId={selectedElementId} />
            </div>

            {/* Style picker modal */}
            <StylePickerModal
                isOpen={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                elementId={selectedElementId}
                styleDefs={styleDefs}
                currentClasses={currentClasses}
            />

            {/* EditModal for defining new classes (from "Define" button or "Convert inline to class") */}
            <EditModal
                isOpen={isEditModalOpen}
                onClose={() => { setIsEditModalOpen(false); setEditModalPreset(null); }}
                styleDef={editModalPreset ? {
                    id: '',
                    selectors: ['.nueva-clase'],
                    rules: Object.entries(editModalPreset).map(([property, value]) => ({
                        id: Math.random().toString(36).slice(2, 9),
                        property,
                        value,
                    })),
                } : null}
                onSave={handleSaveNewClass}
                onDelete={() => {}}
                keyframes={INITIAL_KEYFRAMES}
            />
        </div>
    );
};
