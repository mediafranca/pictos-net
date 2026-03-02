import { create } from 'zustand';
import {
    INITIAL_STYLES,
    INITIAL_KEYFRAMES,
    generateCssString,
    type StyleDefinition,
    type KeyframeDefinition,
} from '@style-editor/lib';
import {
    getSvgStyleText,
    parseCssToStyleDefinitions,
    updateSvgStyleText,
    parseOverrideRules,
    serializeOverrideRules,
    extractLibraryRules,
    setOverrideRule,
    removeOverrideRule,
    type OverrideMap,
} from '../utils/styleUtils';

export interface SVGElement {
    id: string;
    tagName: string;
    attributes: Record<string, string>;
    children: SVGElement[];
    parentId?: string;
}

export interface EditorState {
    // SVG Document
    svgDocument: string | null;
    svgDOM: SVGElement | null;

    // Selection
    selectedElementId: string | null;

    // Styles
    styleDefinitions: StyleDefinition[];
    keyframes: KeyframeDefinition[];
    stylesVersion: number;

    // Two-level CSS model (derived from svgDocument, kept in sync)
    // @see CSS_STYLING_ARCHITECTURE.md
    overrideMap: OverrideMap;
    libraryValues: Map<string, Record<string, string>>;

    // History
    history: string[];
    historyIndex: number;

    // Callback for real-time sync with parent component
    onSvgChange?: (svg: string) => void;

    // Actions
    loadSVG: (svg: string, onChange?: (svg: string) => void) => void;
    updateSVGDOM: (dom: SVGElement) => void;
    selectElement: (id: string | null) => void;
    updateElementId: (oldId: string, newId: string) => void;
    updateElement: (id: string, updates: Partial<SVGElement>) => void;
    updateElementAttributes: (id: string, attributes: Record<string, string | null>) => void;
    moveElement: (dragId: string, targetId: string, mode?: 'inside' | 'after') => void;
    deleteElement: (id: string) => void;
    setStyles: (styles: StyleDefinition[]) => void;
    setKeyframes: (keyframes: KeyframeDefinition[]) => void;
    setElementClasses: (id: string, classes: string[]) => void;
    addElementClasses: (id: string, classes: string[]) => void;
    removeElementClasses: (id: string, classes: string[]) => void;

    // Two-level style actions
    // @see CSS_STYLING_ARCHITECTURE.md
    citeClass: (elementId: string, className: string) => void;
    unciteClass: (elementId: string, className: string) => void;
    setLocalOverride: (elementId: string, className: string, declarations: Record<string, string>) => void;
    restoreClassToLibrary: (elementId: string, className: string) => void;
    getResolvedClassValues: (elementId: string, className: string) => Record<string, string>;
    cleanupInlineAttrs: (elementId: string) => void;

    undo: () => void;
    redo: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
    addToHistory: () => void;
    exportToSchema: () => string;
    reset: () => void;
}

/**
 * Ensures every SVG element has an `id` attribute and writes the result back
 * to the SVG string, keeping svgDocument in sync with what svgDOM will have.
 *
 * normalizeSVG (SVGCanvas) assigns random IDs in-memory but never persists
 * them to svgDocument, so updateElementId would silently fail if an element
 * has an ID only in svgDOM but not in the stored string. Calling this in
 * loadSVG prevents that mismatch.
 */
const assignMissingElementIds = (svg: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return svg;
    let changed = false;
    svgEl.querySelectorAll('*').forEach(el => {
        if (!el.id) {
            el.id = 'el-' + Math.random().toString(36).substr(2, 9);
            changed = true;
        }
    });
    return changed ? new XMLSerializer().serializeToString(doc) : svg;
};

/**
 * Builds a flat className→{property:value} map from StyleDefinition[].
 * Used by StylePanel for drift detection between library values and local overrides.
 * @see CSS_STYLING_ARCHITECTURE.md — libraryValues
 */
const buildLibraryValuesMap = (styles: StyleDefinition[]): Map<string, Record<string, string>> => {
    const map = new Map<string, Record<string, string>>();
    styles.forEach(style => {
        const declarations: Record<string, string> = {};
        style.rules.forEach(rule => { declarations[rule.property] = rule.value; });
        style.selectors.forEach(selector => {
            if (!selector.startsWith('.')) return;
            const cls = selector.slice(1);
            map.set(cls, { ...(map.get(cls) ?? {}), ...declarations });
        });
    });
    return map;
};

const mergeStyles = (base: StyleDefinition[], extra: StyleDefinition[]) => {
    const byKey = new Map<string, StyleDefinition>();
    const keyFor = (s: StyleDefinition) => s.selectors.slice().sort().join(',');
    base.forEach((style) => {
        byKey.set(keyFor(style), style);
    });
    extra.forEach((style) => {
        byKey.set(keyFor(style), style);
    });
    return Array.from(byKey.values());
};

const getElementClassesFromSvg = (svg: string, id: string): string[] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    const element = doc.querySelector(`#${CSS.escape(id)}`);
    if (!element) return [];
    const classAttr = element.getAttribute('class') || '';
    return classAttr.split(' ').map((c) => c.trim()).filter(Boolean);
};

const updateElementClassesInSvg = (svg: string, id: string, classes: string[]): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    const element = doc.querySelector(`#${CSS.escape(id)}`);
    if (!element) return svg;
    if (classes.length === 0) {
        element.removeAttribute('class');
    } else {
        element.setAttribute('class', classes.join(' '));
    }
    return new XMLSerializer().serializeToString(doc);
};

export const useSVGEditorStore = create<EditorState>((set, get) => {
    const commitSvg = (svg: string) => {
        set((state) => ({
            svgDocument: svg,
            history: [...state.history.slice(0, state.historyIndex + 1), svg],
            historyIndex: state.historyIndex + 1,
        }));

        // NEW: Notify parent component of changes
        const onChange = get().onSvgChange;
        if (onChange) {
            onChange(svg);
        }
    };

    const getUsedClassNamesFromSvg = (svg: string): Set<string> => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svg, 'image/svg+xml');
        const elementsWithClass = doc.querySelectorAll('[class]');
        const classes = new Set<string>();
        elementsWithClass.forEach((el) => {
            const classAttr = el.getAttribute('class') || '';
            classAttr
                .split(' ')
                .map((c) => c.trim())
                .filter(Boolean)
                .forEach((cls) => classes.add(cls));
        });
        return classes;
    };

    const getUsedStyles = (styles: StyleDefinition[], usedClasses: Set<string>) => {
        return styles.filter((style) =>
            style.selectors.some((selector) => {
                if (!selector.startsWith('.')) return false;
                const className = selector.replace('.', '');
                return usedClasses.has(className);
            })
        );
    };

    /**
     * Regenerates library rules from used classes, then re-appends any existing
     * local override rules so they are not lost during <style> reconstruction.
     * @see CSS_STYLING_ARCHITECTURE.md — Rebuild Cycle
     */
    const applyUsedStylesToSvg = (
        svg: string,
        styles: StyleDefinition[],
        keyframes: KeyframeDefinition[]
    ) => {
        // Preserve existing local override rules before regenerating the style block
        const currentCss = getSvgStyleText(svg);
        const overrides = parseOverrideRules(currentCss);
        const overrideCss = serializeOverrideRules(overrides).trim();

        const usedClasses = getUsedClassNamesFromSvg(svg);
        const usedStyles = getUsedStyles(styles, usedClasses);
        const libraryCss = generateCssString(usedStyles, keyframes).trim();

        // If there are no library styles and no overrides, remove the <style> element
        if (!libraryCss && !overrideCss) {
            return updateSvgStyleText(svg, '', true);
        }

        const parts: string[] = [];
        if (libraryCss) parts.push(libraryCss);
        if (overrideCss) parts.push(overrideCss);
        const combined = parts.join('\n\n/* --- local overrides --- */\n\n');

        return updateSvgStyleText(svg, combined, false);
    };

    const resolveStylesForSvg = (svg: string) => {
        const cssText = getSvgStyleText(svg);
        const parsed = cssText.trim() ? parseCssToStyleDefinitions(cssText) : [];
        const baseStyles = get().styleDefinitions.length > 0 ? get().styleDefinitions : INITIAL_STYLES;
        if (parsed.length > 0) {
            return mergeStyles(baseStyles, parsed);
        }
        return baseStyles;
    };

    return {
        svgDocument: null,
        svgDOM: null,
        selectedElementId: null,
        styleDefinitions: INITIAL_STYLES,
        keyframes: INITIAL_KEYFRAMES,
        stylesVersion: 0,
        overrideMap: new Map(),
        libraryValues: new Map(),
        history: [],
        historyIndex: -1,
        onSvgChange: undefined,

        loadSVG: (svg: string, onChange?: (svg: string) => void) => {
            // Persist IDs to svgDocument so updateElementId can find elements
            // by ID. normalizeSVG in SVGCanvas assigns IDs only in-memory;
            // without this step those IDs exist in svgDOM but not svgDocument.
            const withIds = assignMissingElementIds(svg);
            const styles = resolveStylesForSvg(withIds);
            const keyframes = get().keyframes.length > 0 ? get().keyframes : INITIAL_KEYFRAMES;
            const nextSvg = applyUsedStylesToSvg(withIds, styles, keyframes);
            const overrideMap = parseOverrideRules(getSvgStyleText(nextSvg));
            const libraryValues = buildLibraryValuesMap(styles);
            set((state) => ({
                styleDefinitions: styles,
                keyframes,
                stylesVersion: state.stylesVersion + 1,
                onSvgChange: onChange,
                overrideMap,
                libraryValues,
            }));
            commitSvg(nextSvg);
        },

        updateSVGDOM: (dom: SVGElement) => {
            set({ svgDOM: dom });
        },

        selectElement: (id: string | null) => {
            set({ selectedElementId: id });
        },

        updateElementId: (oldId: string, newId: string) => {
            const svgDocument = get().svgDocument;
            if (!svgDocument) return;

            const parser = new DOMParser();
            const doc = parser.parseFromString(svgDocument, 'image/svg+xml');
            const element = doc.querySelector(`#${CSS.escape(oldId)}`);
            if (!element) return;

            element.id = newId;
            let serialized = new XMLSerializer().serializeToString(doc);

            // Migrate override rules: #oldId.class { ... } → #newId.class { ... }
            const css = getSvgStyleText(serialized);
            const overrides = parseOverrideRules(css);
            if (overrides.has(oldId)) {
                overrides.set(newId, overrides.get(oldId)!);
                overrides.delete(oldId);
                const libRules = extractLibraryRules(css).trim();
                const overrideCss = serializeOverrideRules(overrides).trim();
                const parts: string[] = [];
                if (libRules) parts.push(libRules);
                if (overrideCss) parts.push(overrideCss);
                const combined = parts.join('\n\n/* --- local overrides --- */\n\n');
                serialized = updateSvgStyleText(serialized, combined, !combined.trim());
            }

            const nextSvg = applyUsedStylesToSvg(serialized, get().styleDefinitions, get().keyframes);
            const newOverrideMap = parseOverrideRules(getSvgStyleText(nextSvg));
            const wasSelected = get().selectedElementId === oldId;

            // Batch document, history, overrideMap and selectedElementId in one set
            set((state) => ({
                svgDocument: nextSvg,
                history: [...state.history.slice(0, state.historyIndex + 1), nextSvg],
                historyIndex: state.historyIndex + 1,
                overrideMap: newOverrideMap,
                selectedElementId: wasSelected ? newId : state.selectedElementId,
            }));
            const onChange = get().onSvgChange;
            if (onChange) onChange(nextSvg);
        },

        updateElement: (id: string, updates: Partial<SVGElement>) => {
            const { svgDOM } = get();
            if (!svgDOM) return;

            const updateNode = (element: SVGElement): SVGElement => {
                if (element.id === id) {
                    return { ...element, ...updates };
                }
                return {
                    ...element,
                    children: element.children.map(updateNode),
                };
            };

            const updatedDOM = updateNode(svgDOM);
            set({ svgDOM: updatedDOM });
        },

        updateElementAttributes: (id: string, attributes: Record<string, string | null>) => {
            const svgDocument = get().svgDocument;
            if (!svgDocument) return;

            const parser = new DOMParser();
            const doc = parser.parseFromString(svgDocument, 'image/svg+xml');
            const element = doc.querySelector(`#${CSS.escape(id)}`);
            if (!element) return;

            Object.entries(attributes).forEach(([key, value]) => {
                if (value === null) {
                    element.removeAttribute(key);
                } else {
                    element.setAttribute(key, value);
                }
            });

            const serialized = new XMLSerializer().serializeToString(doc);
            const nextSvg = applyUsedStylesToSvg(
                serialized,
                get().styleDefinitions,
                get().keyframes
            );
            commitSvg(nextSvg);
        },

        moveElement: (dragId: string, targetId: string, mode: 'inside' | 'after' = 'after') => {
            const svgDocument = get().svgDocument;
            if (!svgDocument) return;

            const parser = new DOMParser();
            const doc = parser.parseFromString(svgDocument, 'image/svg+xml');
            const dragElement = doc.querySelector(`#${CSS.escape(dragId)}`);
            const targetElement = doc.querySelector(`#${CSS.escape(targetId)}`);

            if (!dragElement || !targetElement || dragElement === targetElement) return;
            if (dragElement.contains(targetElement)) return;

            if (mode === 'inside') {
                targetElement.appendChild(dragElement);
            } else {
                const parent = targetElement.parentNode;
                if (!parent) return;
                parent.insertBefore(dragElement, targetElement.nextSibling);
            }

            const serialized = new XMLSerializer().serializeToString(doc);
            const nextSvg = applyUsedStylesToSvg(
                serialized,
                get().styleDefinitions,
                get().keyframes
            );
            commitSvg(nextSvg);
        },

        deleteElement: (id: string) => {
            const svgDocument = get().svgDocument;
            if (!svgDocument) return;

            const parser = new DOMParser();
            const doc = parser.parseFromString(svgDocument, 'image/svg+xml');
            const element = doc.querySelector(`#${CSS.escape(id)}`);
            if (!element) return;
            element.remove();

            const serialized = new XMLSerializer().serializeToString(doc);
            const nextSvg = applyUsedStylesToSvg(
                serialized,
                get().styleDefinitions,
                get().keyframes
            );
            commitSvg(nextSvg);
            set({ selectedElementId: null });
        },

        setStyles: (styles: StyleDefinition[]) => {
            set({ styleDefinitions: styles });
            const svgDocument = get().svgDocument;
            if (!svgDocument) return;
            const keyframes = get().keyframes;
            const updatedSvg = applyUsedStylesToSvg(svgDocument, styles, keyframes);
            commitSvg(updatedSvg);
        },

        setKeyframes: (keyframes: KeyframeDefinition[]) => {
            set({ keyframes });
            const svgDocument = get().svgDocument;
            if (!svgDocument) return;
            const styles = get().styleDefinitions;
            const updatedSvg = applyUsedStylesToSvg(svgDocument, styles, keyframes);
            commitSvg(updatedSvg);
        },

        setElementClasses: (id: string, classes: string[]) => {
            const svgDocument = get().svgDocument;
            if (!svgDocument) return;
            const updatedSvg = updateElementClassesInSvg(svgDocument, id, classes);
            const nextSvg = applyUsedStylesToSvg(
                updatedSvg,
                get().styleDefinitions,
                get().keyframes
            );
            commitSvg(nextSvg);
        },

        addElementClasses: (id: string, classes: string[]) => {
            const svgDocument = get().svgDocument;
            if (!svgDocument) return;
            const current = getElementClassesFromSvg(svgDocument, id);
            const next = [...current];
            classes.forEach((cls) => {
                if (!next.includes(cls)) next.push(cls);
            });
            const updatedSvg = updateElementClassesInSvg(svgDocument, id, next);
            const nextSvg = applyUsedStylesToSvg(
                updatedSvg,
                get().styleDefinitions,
                get().keyframes
            );
            commitSvg(nextSvg);
        },

        removeElementClasses: (id: string, classes: string[]) => {
            const svgDocument = get().svgDocument;
            if (!svgDocument) return;
            const current = getElementClassesFromSvg(svgDocument, id);
            const next = current.filter((cls) => !classes.includes(cls));
            const updatedSvg = updateElementClassesInSvg(svgDocument, id, next);
            const nextSvg = applyUsedStylesToSvg(
                updatedSvg,
                get().styleDefinitions,
                get().keyframes
            );
            commitSvg(nextSvg);
        },

        // ── Two-level CSS model actions ────────────────────────────────────────

        /**
         * CITE: Adds className to element, instantiates its library rule in
         * <style>, and strips any remaining inline presentation attrs.
         * @see CSS_STYLING_ARCHITECTURE.md — CITE step
         */
        citeClass: (elementId: string, className: string) => {
            const svgDocument = get().svgDocument;
            if (!svgDocument) return;

            const current = getElementClassesFromSvg(svgDocument, elementId);
            if (current.includes(className)) return; // already cited

            // Add class to element
            let svg = updateElementClassesInSvg(svgDocument, elementId, [...current, className]);

            // Regenerate <style> with the new class (preserves overrides)
            svg = applyUsedStylesToSvg(svg, get().styleDefinitions, get().keyframes);

            // Strip any lingering inline presentation attrs from this element
            const parser = new DOMParser();
            const doc = parser.parseFromString(svg, 'image/svg+xml');
            const el = doc.querySelector(`#${CSS.escape(elementId)}`);
            if (el) {
                ['fill', 'stroke', 'stroke-width', 'opacity', 'style'].forEach(attr => {
                    el.removeAttribute(attr);
                });
                svg = new XMLSerializer().serializeToString(doc);
            }

            set({ overrideMap: parseOverrideRules(getSvgStyleText(svg)) });
            commitSvg(svg);
        },

        /**
         * UNCITE: Removes className from element, deletes its local override rule,
         * and garbage-collects the library rule if no element uses the class anymore.
         * @see CSS_STYLING_ARCHITECTURE.md — UNCITE + Garbage Collection
         */
        unciteClass: (elementId: string, className: string) => {
            const svgDocument = get().svgDocument;
            if (!svgDocument) return;

            const current = getElementClassesFromSvg(svgDocument, elementId);
            let svg = updateElementClassesInSvg(svgDocument, elementId, current.filter(c => c !== className));

            // Remove any local override rule for this (elementId, className)
            svg = removeOverrideRule(svg, elementId, className);

            // GC: rebuild <style> — unused class rules are dropped automatically
            svg = applyUsedStylesToSvg(svg, get().styleDefinitions, get().keyframes);

            set({ overrideMap: parseOverrideRules(getSvgStyleText(svg)) });
            commitSvg(svg);
        },

        /**
         * MODIFY: Writes property overrides for (elementId, className) into the
         * <style> block as a #id.class { ... } rule. Never writes inline attrs.
         * @see CSS_STYLING_ARCHITECTURE.md — Level 2: Local Overrides
         */
        setLocalOverride: (elementId: string, className: string, declarations: Record<string, string>) => {
            const svgDocument = get().svgDocument;
            if (!svgDocument) return;
            const svg = setOverrideRule(svgDocument, elementId, className, declarations);
            set({ overrideMap: parseOverrideRules(getSvgStyleText(svg)) });
            commitSvg(svg);
        },

        /**
         * RESTORE: Removes the local override rule for (elementId, className),
         * reverting that element back to the library definition.
         * @see CSS_STYLING_ARCHITECTURE.md — Restore to Library
         */
        restoreClassToLibrary: (elementId: string, className: string) => {
            const svgDocument = get().svgDocument;
            if (!svgDocument) return;
            const svg = removeOverrideRule(svgDocument, elementId, className);
            set({ overrideMap: parseOverrideRules(getSvgStyleText(svg)) });
            commitSvg(svg);
        },

        /**
         * Returns the resolved visual values for (elementId, className):
         * library defaults merged with any local overrides.
         * @see CSS_STYLING_ARCHITECTURE.md — Resolved Values
         */
        getResolvedClassValues: (elementId: string, className: string) => {
            const { libraryValues, overrideMap } = get();
            const base = libraryValues.get(className) ?? {};
            const overrides = overrideMap.get(elementId)?.get(className) ?? {};
            return { ...base, ...overrides };
        },

        /**
         * Strips all inline presentation attrs from a single element in the
         * current svgDocument. Safe to call on an already-clean element.
         * @see CSS_STYLING_ARCHITECTURE.md — Pipeline Cleanup
         */
        cleanupInlineAttrs: (elementId: string) => {
            const svgDocument = get().svgDocument;
            if (!svgDocument) return;
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgDocument, 'image/svg+xml');
            const el = doc.querySelector(`#${CSS.escape(elementId)}`);
            if (!el) return;
            ['fill', 'stroke', 'stroke-width', 'opacity', 'style'].forEach(attr => el.removeAttribute(attr));
            const svg = new XMLSerializer().serializeToString(doc);
            commitSvg(svg);
        },

        undo: () => {
            const { history, historyIndex } = get();
            if (historyIndex > 0) {
                const newIndex = historyIndex - 1;
                const svg = history[newIndex];
                set((state) => ({
                    svgDocument: svg,
                    historyIndex: newIndex,
                    styleDefinitions: mergeStyles(
                        state.styleDefinitions.length > 0 ? state.styleDefinitions : INITIAL_STYLES,
                        parseCssToStyleDefinitions(getSvgStyleText(svg))
                    ),
                    keyframes: state.keyframes.length > 0 ? state.keyframes : INITIAL_KEYFRAMES,
                    overrideMap: parseOverrideRules(getSvgStyleText(svg)),
                }));
                const onChange = get().onSvgChange;
                if (onChange) onChange(svg);
            }
        },

        redo: () => {
            const { history, historyIndex } = get();
            if (historyIndex < history.length - 1) {
                const newIndex = historyIndex + 1;
                const svg = history[newIndex];
                set((state) => ({
                    svgDocument: svg,
                    historyIndex: newIndex,
                    styleDefinitions: mergeStyles(
                        state.styleDefinitions.length > 0 ? state.styleDefinitions : INITIAL_STYLES,
                        parseCssToStyleDefinitions(getSvgStyleText(svg))
                    ),
                    keyframes: state.keyframes.length > 0 ? state.keyframes : INITIAL_KEYFRAMES,
                    overrideMap: parseOverrideRules(getSvgStyleText(svg)),
                }));
                const onChange = get().onSvgChange;
                if (onChange) onChange(svg);
            }
        },

        canUndo: () => {
            const { historyIndex } = get();
            return historyIndex > 0;
        },

        canRedo: () => {
            const { history, historyIndex } = get();
            return historyIndex < history.length - 1;
        },

        addToHistory: () => {
            const { svgDocument, history, historyIndex } = get();
            if (svgDocument) {
                set({
                    history: [...history.slice(0, historyIndex + 1), svgDocument],
                    historyIndex: historyIndex + 1,
                });
            }
        },

        exportToSchema: () => {
            const { svgDocument } = get();
            return svgDocument || '';
        },

        reset: () => {
            set({
                svgDocument: null,
                svgDOM: null,
                selectedElementId: null,
                styleDefinitions: INITIAL_STYLES,
                keyframes: INITIAL_KEYFRAMES,
                stylesVersion: 0,
                overrideMap: new Map(),
                libraryValues: new Map(),
                history: [],
                historyIndex: -1,
                onSvgChange: undefined,
            });
        },
    };
});
