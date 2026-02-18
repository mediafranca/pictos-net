import React, { useState, useEffect } from 'react';
import { INITIAL_STYLES } from './constants';
import { INITIAL_KEYFRAMES } from './keyframeConstants';
import { StyleDefinition, KeyframeDefinition, ViewMode, ShapeType } from './types';
import { updateDynamicStyles, generateCssString } from './utils/cssGenerator';
import StylePreviewCard from './components/StylePreviewCard';
import EditModal from './components/EditModal';
import KeyframeEditor from './components/KeyframeEditor';
import { Plus, Code, Grid, Download, Square, Circle, Triangle, Slash, Activity, Film } from 'lucide-react';

export interface StyleEditorProps {
  /** Initial styles to load. Defaults to INITIAL_STYLES */
  initialStyles?: StyleDefinition[];
  /** Initial keyframes to load. Defaults to INITIAL_KEYFRAMES */
  initialKeyframes?: KeyframeDefinition[];
  /** Callback when styles change */
  onStylesChange?: (styles: StyleDefinition[]) => void;
  /** Callback when keyframes change */
  onKeyframesChange?: (keyframes: KeyframeDefinition[]) => void;
  /** Hide the header/navbar */
  hideHeader?: boolean;
  /** Hide the export button */
  hideExport?: boolean;
  /** Hide the new style button */
  hideNewButton?: boolean;
  /** Default view mode */
  defaultView?: ViewMode;
  /** Custom shapes to display */
  availableShapes?: ShapeType[];
  /** Callback when a style is saved */
  onSave?: (style: StyleDefinition) => void;
  /** Callback when a style is deleted */
  onDelete?: (id: string) => void;
  /** Callback when CSS is exported */
  onExport?: (css: string) => void;
  /** Custom className for the container */
  className?: string;
}

export const StyleEditor: React.FC<StyleEditorProps> = ({
  initialStyles = INITIAL_STYLES,
  initialKeyframes = INITIAL_KEYFRAMES,
  onStylesChange,
  onKeyframesChange,
  hideHeader = false,
  hideExport = false,
  hideNewButton = false,
  defaultView = ViewMode.GRID,
  availableShapes = ['square', 'circle', 'triangle', 'line', 'path'],
  onSave,
  onDelete,
  onExport,
  className = '',
}) => {
  const [styles, setStyles] = useState<StyleDefinition[]>(initialStyles);
  const [keyframes, setKeyframes] = useState<KeyframeDefinition[]>(initialKeyframes);
  const [viewMode, setViewMode] = useState<ViewMode>(defaultView);
  const [currentShape, setCurrentShape] = useState<ShapeType>(availableShapes[0] || 'square');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentEditingStyle, setCurrentEditingStyle] = useState<StyleDefinition | null>(null);

  // Initialize CSS in DOM
  useEffect(() => {
    updateDynamicStyles(styles, keyframes);
  }, [styles, keyframes]);

  // Notify parent when styles change
  useEffect(() => {
    onStylesChange?.(styles);
  }, [styles, onStylesChange]);

  // Notify parent when keyframes change
  useEffect(() => {
    onKeyframesChange?.(keyframes);
  }, [keyframes, onKeyframesChange]);

  const handleEditClick = (style: StyleDefinition) => {
    setCurrentEditingStyle(style);
    setIsModalOpen(true);
  };

  const handleCreateNew = () => {
    setCurrentEditingStyle(null);
    setIsModalOpen(true);
  };

  const handleSaveStyle = (updatedStyle: StyleDefinition) => {
    setStyles(prev => {
      const exists = prev.find(s => s.id === updatedStyle.id);
      if (exists) {
        return prev.map(s => s.id === updatedStyle.id ? updatedStyle : s);
      }
      return [...prev, updatedStyle];
    });
    onSave?.(updatedStyle);
  };

  const handleDeleteStyle = (id: string) => {
    if (confirm('Are you sure you want to delete this style?')) {
      setStyles(prev => prev.filter(s => s.id !== id));
      onDelete?.(id);
    }
  };

  const handleDownloadCss = () => {
    const css = generateCssString(styles, keyframes);

    if (onExport) {
      onExport(css);
    } else {
      const blob = new Blob([css], { type: 'text/css' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'svg-styles.css';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const shapeIcons: Record<ShapeType, React.ComponentType<{ size?: number }>> = {
    square: Square,
    circle: Circle,
    triangle: Triangle,
    line: Slash,
    path: Activity,
  };

  return (
    <div className={`flex flex-col h-full bg-gray-50 text-gray-900 ${className}`}>

      {/* Navbar */}
      {!hideHeader && (
        <header className="flex-none bg-white border-b border-gray-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <h1 className="text-xl font-bold tracking-tight text-gray-900 leading-tight">Style Editor</h1>
              <span className="text-xs text-gray-500 font-medium tracking-wide">PICTOS.net by mediafranca</span>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">

            {/* Shape Selector - Only visible in GRID mode */}
            {viewMode === ViewMode.GRID && (
              <>
                <div className="flex bg-gray-100 p-1 rounded-lg items-center">
                  {availableShapes.map((shapeType) => {
                    const Icon = shapeIcons[shapeType];
                    return (
                      <button
                        key={shapeType}
                        onClick={() => setCurrentShape(shapeType)}
                        className={`p-2 rounded-md transition-all ${currentShape === shapeType ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        title={`View as ${shapeType}`}
                      >
                        <Icon size={18} />
                      </button>
                    );
                  })}
                </div>

                <div className="w-px h-6 bg-gray-200 hidden md:block" />
              </>
            )}

            {/* View Mode */}
            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setViewMode(ViewMode.GRID)}
                className={`p-2 rounded-md transition-all ${viewMode === ViewMode.GRID ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Grid View"
              >
                <Grid size={18} />
              </button>
              <button
                onClick={() => setViewMode(ViewMode.CODE)}
                className={`p-2 rounded-md transition-all ${viewMode === ViewMode.CODE ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Code View"
              >
                <Code size={18} />
              </button>
              <button
                onClick={() => setViewMode(ViewMode.ANIMATIONS)}
                className={`p-2 rounded-md transition-all ${viewMode === ViewMode.ANIMATIONS ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                title="Animations"
              >
                <Film size={18} />
              </button>
            </div>

            {!hideExport && (
              <button
                onClick={handleDownloadCss}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
              >
                <Download size={16} /> <span className="hidden sm:inline">Export CSS</span>
              </button>
            )}

            {!hideNewButton && viewMode === ViewMode.GRID && (
              <button
                onClick={handleCreateNew}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 rounded-lg transition-all shadow-md hover:shadow-lg"
              >
                <Plus size={16} /> <span className="hidden sm:inline">New Style</span>
              </button>
            )}
          </div>
        </header>
      )}

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto p-6 md:p-8">

        {viewMode === ViewMode.GRID && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {styles.map(style => (
              <StylePreviewCard
                key={style.id}
                styleDef={style}
                shape={currentShape}
                onClick={() => handleEditClick(style)}
              />
            ))}
            {/* Empty State / Add New Card */}
            {!hideNewButton && (
              <button
                onClick={handleCreateNew}
                className="group flex flex-col items-center justify-center gap-3 p-4 border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50/50 transition-all min-h-[180px]"
              >
                <div className="w-12 h-12 rounded-full bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center text-gray-400 group-hover:text-blue-500 transition-colors">
                  <Plus size={24} />
                </div>
                <span className="text-sm font-medium text-gray-500 group-hover:text-blue-600">Add New Style</span>
              </button>
            )}
          </div>
        )}

        {viewMode === ViewMode.CODE && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
                <span className="text-xs font-mono text-gray-400">generated-styles.css</span>
                <button
                  onClick={() => navigator.clipboard.writeText(generateCssString(styles, keyframes))}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                >
                  Copy to Clipboard
                </button>
              </div>
              <pre className="p-6 text-sm font-mono text-gray-300 overflow-x-auto">
                {generateCssString(styles, keyframes)}
              </pre>
            </div>
          </div>
        )}

        {viewMode === ViewMode.ANIMATIONS && (
          <KeyframeEditor
            keyframes={keyframes}
            onUpdate={setKeyframes}
          />
        )}
      </main>

      {/* Editor Modal */}
      <EditModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        styleDef={currentEditingStyle}
        onSave={handleSaveStyle}
        onDelete={handleDeleteStyle}
        currentShape={currentShape}
      />
    </div>
  );
};

export default StyleEditor;
