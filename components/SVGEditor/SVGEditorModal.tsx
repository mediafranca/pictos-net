import React, { useEffect, useState } from 'react';
import { X, Undo, Redo, Download } from 'lucide-react';
import { useSVGEditorStore } from '../../stores/svgEditorStore';
import { useTranslation } from '../../hooks/useTranslation';
import SemanticTree from './SemanticTree';
import SVGCanvas from './SVGCanvas';
import { StylePanel } from './StylePanel';
import type { StyleDefinition } from '../../lib/style-editor/lib/types';

interface SVGEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialSvg: string;
    utterance: string;
    onSave: (svg: string) => void;
    styleDefs?: StyleDefinition[];
}

export const SVGEditorModal: React.FC<SVGEditorModalProps> = ({
    isOpen,
    onClose,
    initialSvg,
    utterance,
    onSave,
    styleDefs = []
}) => {
    const { t } = useTranslation();
    const [currentSvg, setCurrentSvg] = useState(initialSvg);
    const loadSVG = useSVGEditorStore(state => state.loadSVG);
    const setStyles = useSVGEditorStore(state => state.setStyles);
    const svgDocument = useSVGEditorStore(state => state.svgDocument);
    const undo = useSVGEditorStore(state => state.undo);
    const redo = useSVGEditorStore(state => state.redo);
    const canUndo = useSVGEditorStore(state => state.canUndo);
    const canRedo = useSVGEditorStore(state => state.canRedo);
    const reset = useSVGEditorStore(state => state.reset);

    useEffect(() => {
        if (isOpen && initialSvg) {
            // Prime the store with global style definitions BEFORE parsing the SVG,
            // so resolveStylesForSvg uses them as the base and applyUsedStylesToSvg
            // can include custom classes (e.g. .yellow) in the embedded <style>.
            if (styleDefs.length > 0) {
                setStyles(styleDefs);
            }
            loadSVG(initialSvg);
        }

        // Cleanup on close
        return () => {
            if (!isOpen) {
                reset();
            }
        };
    }, [isOpen, initialSvg]);

    // Sync local state with store updates
    useEffect(() => {
        if (svgDocument) {
            setCurrentSvg(svgDocument);
        }
    }, [svgDocument]);

    const handleSave = () => {
        if (currentSvg) {
            onSave(currentSvg);
        }
    };

    const handleExport = () => {
        if (!svgDocument) return;

        const blob = new Blob([svgDocument], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${utterance.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_edited.svg`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!isOpen) return null;

    return (
        <div id="svg-editor-modal" className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center animate-in fade-in duration-200">
            <div id="svg-editor-container" className="bg-slate-900 w-full h-full flex flex-col">
                {/* Header */}
                <header id="svg-editor-header" className="h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-6">
                    <div className="flex items-center gap-4">
                        <button onClick={onClose} className="text-white hover:text-slate-300">
                            <X size={24} />
                        </button>
                        <div>
                            <h2 className="text-lg font-bold text-white font-mono leading-none">
                                {t('svg.editor')}
                            </h2>
                            <span className="text-xs text-slate-400 font-mono">
                                {utterance}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Undo/Redo */}
                        <div id="svg-editor-history-controls" className="flex bg-slate-800 rounded-md border border-slate-700 mr-4">
                            <button
                                onClick={undo}
                                disabled={!canUndo()}
                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-r border-slate-700"
                                title={t('svgEditor.undo')}
                            >
                                <Undo size={16} />
                            </button>
                            <button
                                onClick={redo}
                                disabled={!canRedo()}
                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                title={t('svgEditor.redo')}
                            >
                                <Redo size={16} />
                            </button>
                        </div>

                        {/* Export */}
                        <button
                            onClick={handleExport}
                            className="px-3 py-1.5 text-sm rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-2 mr-2"
                        >
                            <Download size={14} />
                            {t('svg.editorExport')}
                        </button>

                        {/* Save & Close */}
                        <button
                            onClick={() => { handleSave(); onClose(); }}
                            className="px-4 py-1.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg"
                        >
                            {t('svg.editorSave')}
                        </button>
                    </div>
                </header>

                {/* Main Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Panel: Semantic Tree */}
                    <aside id="svg-editor-tree-panel" className="w-80 bg-white border-r border-slate-200 flex flex-col z-10 shadow-xl text-slate-700">
                        <div id="svg-editor-tree-header" className="p-3 border-b border-slate-100 bg-slate-50">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                {t('svg.editorLayers')}
                            </h3>
                        </div>
                        <div id="svg-editor-tree-content" className="flex-1 overflow-y-auto p-2">
                            <SemanticTree />
                        </div>
                    </aside>

                    {/* Center: Canvas */}
                    <main id="svg-editor-canvas" className="flex-1 bg-slate-100 overflow-hidden relative">
                        <SVGCanvas />
                    </main>

                    {/* Right Panel: Style Properties */}
                    <aside id="svg-editor-properties-panel" className="w-80 border-l border-slate-200 bg-white flex flex-col shrink-0 z-10 shadow-lg text-slate-700">
                        <StylePanel styleDefs={styleDefs} />
                    </aside>
                </div>
            </div>

            <style>{`
        .svg-preview svg {
          max-width: 100%;
          max-height: 600px;
          width: auto;
          height: auto;
        }
      `}</style>
        </div>
    );
};
