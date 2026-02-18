import { create } from 'zustand';
import {
    INITIAL_STYLES,
    INITIAL_KEYFRAMES,
    generateCssString,
    type StyleDefinition,
    type KeyframeDefinition,
} from '@style-editor/lib';
import { getSvgStyleText, parseCssToStyleDefinitions, updateSvgStyleText } from '../utils/styleUtils';

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

    // History
    history: string[];
    historyIndex: number;

    // NEW: Callback for real-time sync with parent component
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
    undo: () => void;
    redo: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
    addToHistory: () => void;
    exportToSchema: () => string;
    reset: () => void;
}

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

    const applyUsedStylesToSvg = (
        svg: string,
        styles: StyleDefinition[],
        keyframes: KeyframeDefinition[]
    ) => {
        const usedClasses = getUsedClassNamesFromSvg(svg);
        const usedStyles = getUsedStyles(styles, usedClasses);
        const css = generateCssString(usedStyles, keyframes);
        return updateSvgStyleText(svg, css, true);
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
        history: [],
        historyIndex: -1,
        onSvgChange: undefined,

        loadSVG: (svg: string, onChange?: (svg: string) => void) => {
            const styles = resolveStylesForSvg(svg);
            const keyframes = get().keyframes.length > 0 ? get().keyframes : INITIAL_KEYFRAMES;
            const nextSvg = applyUsedStylesToSvg(svg, styles, keyframes);
            set((state) => ({
                styleDefinitions: styles,
                keyframes,
                stylesVersion: state.stylesVersion + 1,
                onSvgChange: onChange,
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
            const { svgDOM } = get();
            if (!svgDOM) return;

            const updateIds = (element: SVGElement): SVGElement => {
                if (element.id === oldId) {
                    return { ...element, id: newId };
                }
                return {
                    ...element,
                    children: element.children.map(updateIds),
                };
            };

            const updatedDOM = updateIds(svgDOM);
            set({ svgDOM: updatedDOM });
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
                }));

                // Notify parent of undo
                const onChange = get().onSvgChange;
                if (onChange) {
                    onChange(svg);
                }
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
                }));

                // Notify parent of redo
                const onChange = get().onSvgChange;
                if (onChange) {
                    onChange(svg);
                }
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
                history: [],
                historyIndex: -1,
                onSvgChange: undefined,
            });
        },
    };
});
