// Styles import - Users should import this in their app
import './styles.css';

// Main component export
export { StyleEditor, type StyleEditorProps } from './StyleEditor';

// Component exports (if users want to build custom UI)
export { default as StylePreviewCard } from './components/StylePreviewCard';
export { default as EditModal } from './components/EditModal';
export { default as KeyframeEditor } from './components/KeyframeEditor';

// Type exports
export type { StyleDefinition, CssRule, ShapeType, KeyframeDefinition } from './types';
export { ViewMode } from './types';

// Utility exports
export { generateCssString, updateDynamicStyles } from './utils/cssGenerator';
export { SVG_CSS_PROPERTIES } from './utils/svgProperties';

// Constants
export { INITIAL_STYLES } from './constants';
export { INITIAL_KEYFRAMES } from './keyframeConstants';
