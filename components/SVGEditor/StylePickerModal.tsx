import React from 'react';
import { X } from 'lucide-react';
import { useSVGEditorStore } from '../../stores/svgEditorStore';
import type { StyleDefinition } from '../../lib/style-editor/lib/types';
import StylePreviewCard from '../../lib/style-editor/lib/components/StylePreviewCard';
import { useTranslation } from '../../hooks/useTranslation';

interface StylePickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    elementId: string;
    styleDefs: StyleDefinition[];
    currentClasses: string[];
}

/**
 * Floating palette for citing/unciting library classes on a single SVG element.
 * Opened from the right panel "+ Agregar estilo" button and from style dots
 * in the left tree panel.
 * @see CSS_STYLING_ARCHITECTURE.md — CITE / UNCITE
 */
export const StylePickerModal: React.FC<StylePickerModalProps> = ({
    isOpen,
    onClose,
    elementId,
    styleDefs,
    currentClasses,
}) => {
    const { t } = useTranslation();
    const { citeClass, unciteClass } = useSVGEditorStore();

    if (!isOpen) return null;

    const handleToggle = (cls: string, isCited: boolean) => {
        if (isCited) {
            unciteClass(elementId, cls);
        } else {
            citeClass(elementId, cls);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center"
            onClick={onClose}
        >
            <div className="absolute inset-0 bg-black/40" />
            <div
                className="relative bg-white rounded-xl shadow-2xl p-4 w-80 max-h-[80vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {t('svgEditor.selectStyle')}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    >
                        <X size={14} />
                    </button>
                </div>

                {styleDefs.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">{t('svgEditor.noStylesDefined')}</p>
                ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                        {styleDefs.map((styleDef) => {
                            const cls = styleDef.selectors[0]?.replace(/^\./, '') ?? '';
                            const isCited = currentClasses.includes(cls);
                            return (
                                <button
                                    key={styleDef.id}
                                    onClick={() => handleToggle(cls, isCited)}
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
                )}
            </div>
        </div>
    );
};
