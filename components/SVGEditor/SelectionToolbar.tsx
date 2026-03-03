/**
 * SelectionToolbar — floating toolbar shown when 2+ elements are selected.
 * Provides group, apply class, and delete actions.
 */

import React, { useState } from 'react';
import { Group, Paintbrush, Trash2 } from 'lucide-react';
import { useSVGEditorStore } from '../../stores/svgEditorStore';
import { useTranslation } from '../../hooks/useTranslation';
import type { StyleDefinition } from '../../lib/style-editor/lib/types';

interface SelectionToolbarProps {
    styleDefs: StyleDefinition[];
}

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({ styleDefs }) => {
    const { t } = useTranslation();
    const {
        selectedElementIds,
        groupElements,
        deleteElement,
        addClassToElement,
        clearSelection,
    } = useSVGEditorStore();

    const [showClassPicker, setShowClassPicker] = useState(false);

    const ids = Array.from(selectedElementIds);
    if (ids.length < 2) return null;

    const handleGroup = () => {
        groupElements(ids);
    };

    const handleDelete = () => {
        ids.forEach(id => deleteElement(id));
        clearSelection();
    };

    const handleApplyClass = (className: string) => {
        ids.forEach(id => addClassToElement(id, className));
        setShowClassPicker(false);
    };

    // Extract available class names from style defs
    const availableClasses: string[] = Array.from(
        new Set<string>(
            styleDefs.flatMap(s =>
                s.selectors
                    .filter(sel => sel.startsWith('.'))
                    .map(sel => sel.slice(1))
            )
        )
    );

    return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-white rounded-lg shadow-xl border border-slate-200 px-2 py-1.5">
            <button
                onClick={handleGroup}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-slate-700 hover:bg-slate-100 rounded transition-colors"
                title={t('svgEditor.group')}
            >
                <Group size={13} />
                {t('svgEditor.group')}
            </button>

            <div className="w-px h-5 bg-slate-200" />

            <div className="relative">
                <button
                    onClick={() => setShowClassPicker(!showClassPicker)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-slate-700 hover:bg-slate-100 rounded transition-colors"
                    title={t('svgEditor.applyClass')}
                >
                    <Paintbrush size={13} />
                    {t('svgEditor.applyClass')}
                </button>

                {showClassPicker && availableClasses.length > 0 && (
                    <div className="absolute bottom-full left-0 mb-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[120px] max-h-48 overflow-y-auto">
                        {availableClasses.map(cls => (
                            <button
                                key={cls}
                                onClick={() => handleApplyClass(cls)}
                                className="w-full text-left px-3 py-1.5 text-[10px] font-mono text-slate-700 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                            >
                                .{cls}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="w-px h-5 bg-slate-200" />

            <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-red-500 hover:bg-red-50 rounded transition-colors"
                title={t('svgEditor.deleteSelected')}
            >
                <Trash2 size={13} />
                {t('svgEditor.deleteSelected')}
            </button>

            <div className="ml-1 text-[9px] text-slate-400 tabular-nums">
                {ids.length}
            </div>
        </div>
    );
};
