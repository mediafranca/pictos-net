/**
 * SelectionToolbar — floating toolbar shown when 1+ elements are selected.
 * Provides group, ungroup, duplicate, reorder, apply class, and delete actions.
 */

import React, { useState } from 'react';
import {
    Group, Ungroup, Paintbrush, Trash2, Copy,
    ArrowUp, ArrowDown,
} from 'lucide-react';
import { useSVGEditorStore } from '../../stores/svgEditorStore';
import { useTranslation } from '../../hooks/useTranslation';
import type { StyleDefinition } from '../../lib/style-editor/lib/types';

const LEFT_PANEL = 288;
const RIGHT_PANEL = 320;

/** WCAG arrow-key navigation for toolbar children with [data-toolbar-item] */
function handleToolbarKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const toolbar = e.currentTarget;
    const items: HTMLElement[] = Array.from(toolbar.querySelectorAll('[data-toolbar-item]:not(:disabled)'));
    if (items.length === 0) return;

    const current = document.activeElement as HTMLElement;
    const idx = items.indexOf(current);
    let next = -1;

    switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
            e.preventDefault();
            next = idx < items.length - 1 ? idx + 1 : 0;
            break;
        case 'ArrowLeft':
        case 'ArrowUp':
            e.preventDefault();
            next = idx > 0 ? idx - 1 : items.length - 1;
            break;
        case 'Home':
            e.preventDefault();
            next = 0;
            break;
        case 'End':
            e.preventDefault();
            next = items.length - 1;
            break;
        default:
            return;
    }

    if (next >= 0) {
        items.forEach((item, i) => item.tabIndex = i === next ? 0 : -1);
        items[next].focus();
    }
}

interface SelectionToolbarProps {
    styleDefs: StyleDefinition[];
}

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({ styleDefs }) => {
    const { t } = useTranslation();
    const {
        selectedElementId,
        selectedElementIds,
        groupElements,
        ungroupElement,
        deleteElement,
        addClassToElement,
        clearSelection,
        duplicateElement,
        bringForward,
        sendBackward,
        svgDocument,
    } = useSVGEditorStore();

    const [showClassPicker, setShowClassPicker] = useState(false);

    const ids = Array.from(selectedElementIds);
    const singleId = ids.length === 1 ? ids[0] : (selectedElementIds.size === 0 ? selectedElementId : null);
    const hasSelection = ids.length > 0 || !!selectedElementId;

    if (!hasSelection) return null;

    // Check if single selection is a <g> element (for ungroup)
    const isGroup = (() => {
        if (!singleId || !svgDocument) return false;
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgDocument, 'image/svg+xml');
        const el = doc.querySelector(`#${CSS.escape(singleId)}`);
        return el?.tagName.toLowerCase() === 'g';
    })();

    const allIds = ids.length > 0 ? ids : (selectedElementId ? [selectedElementId] : []);

    const handleGroup = () => {
        if (allIds.length >= 2) groupElements(allIds);
    };

    const handleUngroup = () => {
        if (singleId && isGroup) ungroupElement(singleId);
    };

    const handleDelete = () => {
        allIds.forEach(id => deleteElement(id));
        clearSelection();
    };

    const handleDuplicate = () => {
        if (singleId) duplicateElement(singleId);
    };

    const handleBringForward = () => {
        if (singleId) bringForward(singleId);
    };

    const handleSendBackward = () => {
        if (singleId) sendBackward(singleId);
    };

    const handleApplyClass = (className: string) => {
        allIds.forEach(id => addClassToElement(id, className));
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

    // Center between panels
    const centerX = LEFT_PANEL + (window.innerWidth - LEFT_PANEL - RIGHT_PANEL) / 2;

    const btnClass = "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded transition-colors";
    const divider = <div className="w-px h-5 bg-slate-200" />;

    return (
        <div
            role="toolbar"
            aria-label="Selection"
            className="fixed z-[15] flex items-center gap-1 bg-white rounded-lg shadow-xl border border-slate-200 px-2 py-1.5"
            style={{ top: 76, left: centerX, transform: 'translateX(-50%)' }}
            onKeyDown={handleToolbarKeyDown}
        >
            {/* Group — 2+ selected */}
            {allIds.length >= 2 && (
                <button
                    onClick={handleGroup}
                    className={btnClass}
                    title={t('svgEditor.group')}
                    aria-label={t('svgEditor.group')}
                    data-toolbar-item
                    tabIndex={0}
                >
                    <Group size={13} aria-hidden="true" />
                    {t('svgEditor.group')}
                </button>
            )}

            {/* Ungroup — 1 selected <g> */}
            {singleId && isGroup && (
                <button
                    onClick={handleUngroup}
                    className={btnClass}
                    title={t('svgEditor.ungroup')}
                    aria-label={t('svgEditor.ungroup')}
                    data-toolbar-item
                    tabIndex={-1}
                >
                    <Ungroup size={13} aria-hidden="true" />
                    {t('svgEditor.ungroup')}
                </button>
            )}

            {(allIds.length >= 2 || (singleId && isGroup)) && divider}

            {/* Duplicate — single selection */}
            {singleId && (
                <button
                    onClick={handleDuplicate}
                    className={btnClass}
                    title={t('svgEditor.duplicate')}
                    aria-label={t('svgEditor.duplicate')}
                    data-toolbar-item
                    tabIndex={-1}
                >
                    <Copy size={13} aria-hidden="true" />
                </button>
            )}

            {/* Bring Forward / Send Backward — single selection */}
            {singleId && (
                <>
                    <button
                        onClick={handleBringForward}
                        className={btnClass}
                        title={t('svgEditor.bringForward')}
                        aria-label={t('svgEditor.bringForward')}
                        data-toolbar-item
                        tabIndex={-1}
                    >
                        <ArrowUp size={13} aria-hidden="true" />
                    </button>
                    <button
                        onClick={handleSendBackward}
                        className={btnClass}
                        title={t('svgEditor.sendBackward')}
                        aria-label={t('svgEditor.sendBackward')}
                        data-toolbar-item
                        tabIndex={-1}
                    >
                        <ArrowDown size={13} aria-hidden="true" />
                    </button>
                </>
            )}

            {divider}

            {/* Apply Class */}
            <div className="relative">
                <button
                    onClick={() => setShowClassPicker(!showClassPicker)}
                    className={btnClass}
                    title={t('svgEditor.applyClass')}
                    aria-label={t('svgEditor.applyClass')}
                    data-toolbar-item
                    tabIndex={-1}
                >
                    <Paintbrush size={13} aria-hidden="true" />
                    {t('svgEditor.applyClass')}
                </button>

                {showClassPicker && availableClasses.length > 0 && (
                    <div className="absolute bottom-full left-0 mb-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[120px] max-h-48 overflow-y-auto">
                        {availableClasses.map(cls => (
                            <button
                                key={cls}
                                onClick={() => handleApplyClass(cls)}
                                className="w-full text-left px-3 py-1.5 text-xs font-mono text-slate-700 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                            >
                                .{cls}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {divider}

            {/* Delete */}
            <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 rounded transition-colors"
                title={t('svgEditor.deleteSelected')}
                aria-label={t('svgEditor.deleteSelected')}
                data-toolbar-item
                tabIndex={-1}
            >
                <Trash2 size={13} aria-hidden="true" />
            </button>

            <div className="ml-1 text-xs text-slate-500 tabular-nums">
                {allIds.length}
            </div>
        </div>
    );
};
