export interface CssRule {
  id: string;
  property: string;
  value: string;
}

export interface StyleDefinition {
  id: string;
  selectors: string[]; // e.g. ['.primary', '.main']
  rules: CssRule[];
  description?: string;
}

export interface KeyframeDefinition {
  id: string;
  name: string; // e.g. 'kf-custom-spin'
  keyframes: string; // CSS keyframes content: "0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); }"
  description?: string;
}

export enum ViewMode {
  GRID = 'GRID',
  CODE = 'CODE',
  ANIMATIONS = 'ANIMATIONS',
}

export type ShapeType = 'square' | 'circle' | 'triangle' | 'line' | 'path';
