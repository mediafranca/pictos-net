import React, { useEffect, useState } from 'react';
import { X, Undo, Redo, Download } from 'lucide-react';
import { useSVGEditorStore } from '../../stores/svgEditorStore';
import SemanticTree from './SemanticTree';
import SVGCanvas from './SVGCanvas';
import { StylePanel } from './StylePanel';

interface SVGEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialSvg: string;
    utterance: string;
    onSave: (svg: string) => void;
}

export const SVGEditorModal: React.FC<SVGEditorModalProps> = ({
    // ... (destructuring remains same)
    isOpen,
    onClose,
    initialSvg,
    utterance,
    onSave
}) => {
    // ... (state and effects remain same)
    const [currentSvg, setCurrentSvg] = useState(initialSvg);
    const loadSVG = useSVGEditorStore(state => state.loadSVG);
    const svgDocument = useSVGEditorStore(state => state.svgDocument);
    const undo = useSVGEditorStore(state => state.undo);
    const redo = useSVGEditorStore(state => state.redo);
    const canUndo = useSVGEditorStore(state => state.canUndo);
    const canRedo = useSVGEditorStore(state => state.canRedo);
    const reset = useSVGEditorStore(state => state.reset);

    useEffect(() => {
        if (isOpen && initialSvg) {
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
    // ... (handleExport remains same)
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
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center animate-in fade-in duration-200">
            <div className="bg-slate-900 w-full h-full flex flex-col">
                {/* Header */}
                <header className="h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-6">
                    <div className="flex items-center gap-4">
                        <button onClick={onClose} className="text-white hover:text-slate-300">
                            <X size={24} />
                        </button>
                        <div>
                            <h2 className="text-lg font-bold text-white font-mono leading-none">
                                SVG Editor
                            </h2>
                            <span className="text-xs text-slate-400 font-mono">
                                {utterance}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Undo/Redo */}
                        <div className="flex bg-slate-800 rounded-md border border-slate-700 mr-4">
                            <button
                                onClick={undo}
                                disabled={!canUndo()}
                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-r border-slate-700"
                                title="Undo (Ctrl+Z)"
                            >
                                <Undo size={16} />
                            </button>
                            <button
                                onClick={redo}
                                disabled={!canRedo()}
                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                title="Redo (Ctrl+Y)"
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
                            Export
                        </button>

                        {/* Save & Close */}
                        <button
                            onClick={() => { handleSave(); onClose(); }}
                            className="px-4 py-1.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg"
                        >
                            Save Changes
                        </button>
                    </div>
                </header>

                {/* Main Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Panel: Semantic Tree */}
                    <aside className="w-80 bg-white border-r border-slate-200 flex flex-col z-10 shadow-xl">
                        <div className="p-3 border-b border-slate-100 bg-slate-50">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                Layers & Structure
                            </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            <SemanticTree />
                        </div>
                    </aside>

                    {/* Center: Canvas */}
                    <main className="flex-1 bg-slate-100 overflow-hidden relative">
                        <SVGCanvas />
                    </main>

                    {/* Right Panel: Style Forge (placeholder) */}
                    {/* Right Panel: Style Properties */}
                    <aside className="w-80 border-l border-slate-200 bg-white flex flex-col shrink-0 z-10 shadow-lg">
                        <StylePanel />
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
