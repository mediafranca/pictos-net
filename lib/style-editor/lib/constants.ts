import { StyleDefinition } from './types';

// Simple ID generator to avoid external dependencies in this specific output format
const generateId = () => Math.random().toString(36).substr(2, 9);

export const INITIAL_STYLES: StyleDefinition[] = [
  {
    id: generateId(),
    selectors: ['.main', '.primary', '.foreground'],
    description: 'Primary dark fill with white outline',
    rules: [
      { id: generateId(), property: 'fill', value: '#1a1a1a' },
      { id: generateId(), property: 'stroke', value: '#ffffff' },
      { id: generateId(), property: 'stroke-width', value: '3pt' },
      { id: generateId(), property: 'vector-effect', value: 'non-scaling-stroke' },
    ],
  },
  {
    id: generateId(),
    selectors: ['.secondary', '.background'],
    description: 'Secondary white fill with dark outline',
    rules: [
      { id: generateId(), property: 'fill', value: '#ffffff' },
      { id: generateId(), property: 'stroke', value: '#1a1a1a' },
      { id: generateId(), property: 'stroke-width', value: '3pt' },
      { id: generateId(), property: 'vector-effect', value: 'non-scaling-stroke' },
    ],
  },
  {
    id: generateId(),
    selectors: ['.tertiary', '.neutral'],
    description: 'Tertiary gray fill',
    rules: [
      { id: generateId(), property: 'fill', value: '#98a0ae' },
      { id: generateId(), property: 'stroke', value: '#7e838b' },
      { id: generateId(), property: 'stroke-width', value: '3pt' },
      { id: generateId(), property: 'vector-effect', value: 'non-scaling-stroke' },
    ],
  },
  {
    id: generateId(),
    selectors: ['.accent', '.highlight'],
    description: 'Cyan accent color',
    rules: [
      { id: generateId(), property: 'fill', value: '#00ccff' },
      { id: generateId(), property: 'stroke', value: '#06a0c6' },
    ],
  },
  {
    id: generateId(),
    selectors: ['.red', '.danger'],
    description: 'Semantic Red',
    rules: [
      { id: generateId(), property: 'fill', value: '#ef4444' },
      { id: generateId(), property: 'stroke', value: '#b91c1c' },
    ],
  },
  {
    id: generateId(),
    selectors: ['.green', '.success'],
    description: 'Semantic Green',
    rules: [
      { id: generateId(), property: 'fill', value: '#22c55e' },
      { id: generateId(), property: 'stroke', value: '#15803d' },
    ],
  },
  {
    id: generateId(),
    selectors: ['.st-dark'],
    description: 'Stroke modifier: Dark',
    rules: [
      { id: generateId(), property: 'stroke', value: '#000000' },
      { id: generateId(), property: 'stroke-width', value: '3pt' },
      { id: generateId(), property: 'vector-effect', value: 'non-scaling-stroke' },
    ],
  },
  {
    id: generateId(),
    selectors: ['.st-light'],
    description: 'Stroke modifier: Light',
    rules: [
      { id: generateId(), property: 'stroke', value: '#ffffff' },
      { id: generateId(), property: 'stroke-width', value: '3pt' },
      { id: generateId(), property: 'fill', value: 'none' },
      { id: generateId(), property: 'vector-effect', value: 'non-scaling-stroke' },
    ],
  },
  {
    id: generateId(),
    selectors: ['.dashed'],
    description: 'Stroke modifier: Dashed Round',
    rules: [
      { id: generateId(), property: 'stroke-dasharray', value: '4 8' },
      { id: generateId(), property: 'fill', value: 'none' },
      { id: generateId(), property: 'stroke', value: '#636363' },
      { id: generateId(), property: 'stroke-width', value: '3pt' },
      { id: generateId(), property: 'stroke-linecap', value: 'round' },
    ],
  },
  {
    id: generateId(),
    selectors: ['.glow'],
    description: 'Effect: Blue Glow',
    rules: [
      { id: generateId(), property: 'filter', value: 'drop-shadow(0 0 4pt #0ea5e9)' },
      { id: generateId(), property: 'stroke', value: 'none' },
    ],
  },
  // Animations
  {
    id: generateId(),
    selectors: ['.anim-blink'],
    description: 'Animation: Blink',
    rules: [
      { id: generateId(), property: 'animation', value: 'kf-blink 1.5s infinite ease-in-out' },
    ],
  },
  {
    id: generateId(),
    selectors: ['.anim-beat'],
    description: 'Animation: Heartbeat',
    rules: [
      { id: generateId(), property: 'animation', value: 'kf-beat 1.5s infinite ease-in-out' },
      { id: generateId(), property: 'transform-box', value: 'fill-box' },
      { id: generateId(), property: 'transform-origin', value: 'center' },
    ],
  },
  {
    id: generateId(),
    selectors: ['.anim-swing'],
    description: 'Animation: Swing',
    rules: [
      { id: generateId(), property: 'animation', value: 'kf-swing 2s infinite ease-in-out' },
      { id: generateId(), property: 'transform-box', value: 'fill-box' },
      { id: generateId(), property: 'transform-origin', value: 'center' },
    ],
  },
  {
    id: generateId(),
    selectors: ['.slide-r'],
    description: 'Animation: Slide Horizontal',
    rules: [
      { id: generateId(), property: 'animation', value: 'kf-slide-r 2s infinite ease-in-out' },
    ],
  },
  {
    id: generateId(),
    selectors: ['.slide-u'],
    description: 'Animation: Slide Vertical',
    rules: [
      { id: generateId(), property: 'animation', value: 'kf-slide-u 2s infinite ease-in-out' },
    ],
  },
];
