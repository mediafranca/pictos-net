import { KeyframeDefinition } from './types';

const generateId = () => Math.random().toString(36).substr(2, 9);

export const INITIAL_KEYFRAMES: KeyframeDefinition[] = [
  {
    id: generateId(),
    name: 'kf-blink',
    keyframes: `0%, 100% { opacity: 1; }
  50% { opacity: var(--kf-blink-min, 0.4); }`,
    description: 'Blink effect - fades in and out',
    parameters: [
      { variable: '--kf-blink-min', label: 'Opacidad mínima', min: 0, max: 0.9, default: 0.4, unit: '', step: 0.05 },
    ],
  },
  {
    id: generateId(),
    name: 'kf-beat',
    keyframes: `0%, 100% { transform: scale(1); }
  50% { transform: scale(var(--kf-beat-scale, 1.15)); }`,
    description: 'Heartbeat effect - scales up and down',
    parameters: [
      { variable: '--kf-beat-scale', label: 'Escala pico', min: 1.05, max: 2.5, default: 1.15, unit: '', step: 0.05 },
    ],
  },
  {
    id: generateId(),
    name: 'kf-swing',
    keyframes: `20% { transform: rotate(calc(var(--kf-swing-angle, 15) * 1deg)); }
  40% { transform: rotate(calc(var(--kf-swing-angle, 15) * -0.667deg)); }
  60% { transform: rotate(calc(var(--kf-swing-angle, 15) * 0.333deg)); }
  80% { transform: rotate(calc(var(--kf-swing-angle, 15) * -0.333deg)); }
  100% { transform: rotate(0deg); }`,
    description: 'Swing effect - rotates side to side',
    parameters: [
      { variable: '--kf-swing-angle', label: 'Ángulo', min: 3, max: 45, default: 15, unit: 'deg' },
    ],
  },
  {
    id: generateId(),
    name: 'kf-slide-r',
    keyframes: `0%, 100% { transform: translateX(0); }
  50% { transform: translateX(calc(var(--kf-slide-r-dist, 15) * 1px)); }`,
    description: 'Slide horizontal - moves left and right',
    parameters: [
      { variable: '--kf-slide-r-dist', label: 'Distancia', min: 2, max: 80, default: 15, unit: 'px' },
    ],
  },
  {
    id: generateId(),
    name: 'kf-slide-u',
    keyframes: `0%, 100% { transform: translateY(0); }
  50% { transform: translateY(calc(var(--kf-slide-u-dist, 15) * -1px)); }`,
    description: 'Slide vertical - moves up and down',
    parameters: [
      { variable: '--kf-slide-u-dist', label: 'Distancia', min: 2, max: 80, default: 15, unit: 'px' },
    ],
  },

  // Rotations
  {
    id: generateId(),
    name: 'kf-spin-cw',
    keyframes: `0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }`,
    description: 'Full clockwise rotation',
  },
  {
    id: generateId(),
    name: 'kf-spin-ccw',
    keyframes: `0% { transform: rotate(0deg); }
  100% { transform: rotate(-360deg); }`,
    description: 'Full counter-clockwise rotation',
  },
  {
    id: generateId(),
    name: 'kf-rock',
    keyframes: `0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(calc(var(--kf-rock-angle, 25) * 1deg)); }
  75% { transform: rotate(calc(var(--kf-rock-angle, 25) * -1deg)); }`,
    description: 'Pendulum rocking motion',
    parameters: [
      { variable: '--kf-rock-angle', label: 'Ángulo', min: 5, max: 60, default: 25, unit: 'deg' },
    ],
  },

  // Directional gestures
  {
    id: generateId(),
    name: 'kf-gesture-r',
    keyframes: `0% { transform: translateX(0); opacity: 1; }
  60% { transform: translateX(calc(var(--kf-gesture-r-dist, 30) * 1px)); opacity: 1; }
  100% { transform: translateX(calc(var(--kf-gesture-r-dist, 30) * 1.667px)); opacity: 0; }`,
    description: 'Gesture right with ease-out exit',
    parameters: [
      { variable: '--kf-gesture-r-dist', label: 'Distancia', min: 5, max: 80, default: 30, unit: 'px' },
    ],
  },
  {
    id: generateId(),
    name: 'kf-gesture-l',
    keyframes: `0% { transform: translateX(0); opacity: 1; }
  60% { transform: translateX(calc(var(--kf-gesture-l-dist, 30) * -1px)); opacity: 1; }
  100% { transform: translateX(calc(var(--kf-gesture-l-dist, 30) * -1.667px)); opacity: 0; }`,
    description: 'Gesture left with ease-out exit',
    parameters: [
      { variable: '--kf-gesture-l-dist', label: 'Distancia', min: 5, max: 80, default: 30, unit: 'px' },
    ],
  },
  {
    id: generateId(),
    name: 'kf-gesture-d',
    keyframes: `0% { transform: translateY(0); opacity: 1; }
  50% { transform: translateY(calc(var(--kf-gesture-d-dist, 25) * 1px)); opacity: 1; }
  100% { transform: translateY(calc(var(--kf-gesture-d-dist, 25) * 1.8px)); opacity: 0; }`,
    description: 'Gesture down (falling)',
    parameters: [
      { variable: '--kf-gesture-d-dist', label: 'Distancia', min: 5, max: 80, default: 25, unit: 'px' },
    ],
  },

  // Scale & presence
  {
    id: generateId(),
    name: 'kf-inflate-rise',
    keyframes: `0% { transform: scale(1) translateY(0); }
  50% { transform: scale(var(--kf-inflate-scale, 1.3)) translateY(calc(var(--kf-inflate-rise, 15) * -1px)); }
  100% { transform: scale(1) translateY(0); }`,
    description: 'Inflate and rise like a balloon',
    parameters: [
      { variable: '--kf-inflate-scale', label: 'Escala', min: 1.05, max: 2.5, default: 1.3, unit: '', step: 0.05 },
      { variable: '--kf-inflate-rise', label: 'Altura', min: 0, max: 50, default: 15, unit: 'px' },
    ],
  },
  {
    id: generateId(),
    name: 'kf-pop-in',
    keyframes: `0% { transform: scale(0); opacity: 0; }
  70% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }`,
    description: 'Pop in with elastic overshoot',
  },
  {
    id: generateId(),
    name: 'kf-pulse',
    keyframes: `0%, 100% { opacity: 1; }
  50% { opacity: var(--kf-pulse-min, 0.6); }`,
    description: 'Subtle opacity throb (gentler than blink)',
    parameters: [
      { variable: '--kf-pulse-min', label: 'Opacidad mínima', min: 0, max: 0.9, default: 0.6, unit: '', step: 0.05 },
    ],
  },

  // Agitation & emphasis
  {
    id: generateId(),
    name: 'kf-shake',
    keyframes: `0%, 100% { transform: translateX(0); }
  20% { transform: translateX(calc(var(--kf-shake-amp, 8) * -1px)); }
  40% { transform: translateX(calc(var(--kf-shake-amp, 8) * 1px)); }
  60% { transform: translateX(calc(var(--kf-shake-amp, 8) * -0.75px)); }
  80% { transform: translateX(calc(var(--kf-shake-amp, 8) * 0.625px)); }`,
    description: 'Horizontal shaking vibration',
    parameters: [
      { variable: '--kf-shake-amp', label: 'Amplitud', min: 1, max: 30, default: 8, unit: 'px' },
    ],
  },
  {
    id: generateId(),
    name: 'kf-tremble',
    keyframes: `0% { transform: translate(0, 0); }
  25% { transform: translate(calc(var(--kf-tremble-amp, 3) * -1px), calc(var(--kf-tremble-amp, 3) * 0.667px)); }
  50% { transform: translate(calc(var(--kf-tremble-amp, 3) * 1px), calc(var(--kf-tremble-amp, 3) * -0.667px)); }
  75% { transform: translate(calc(var(--kf-tremble-amp, 3) * -0.667px), calc(var(--kf-tremble-amp, 3) * -1px)); }
  100% { transform: translate(calc(var(--kf-tremble-amp, 3) * 0.667px), calc(var(--kf-tremble-amp, 3) * 1px)); }`,
    description: 'Micro-vibration (fear, cold, electricity)',
    parameters: [
      { variable: '--kf-tremble-amp', label: 'Amplitud', min: 1, max: 15, default: 3, unit: 'px' },
    ],
  },
  {
    id: generateId(),
    name: 'kf-bounce',
    keyframes: `0%, 100% { transform: translateY(0) scaleY(1); }
  30% { transform: translateY(calc(var(--kf-bounce-h, 25) * -1px)) scaleY(1.08); }
  50% { transform: translateY(0) scaleY(0.92); }
  65% { transform: translateY(calc(var(--kf-bounce-h, 25) * -0.4px)) scaleY(1.04); }
  80% { transform: translateY(0) scaleY(0.97); }`,
    description: 'Elastic bouncing with squash/stretch',
    parameters: [
      { variable: '--kf-bounce-h', label: 'Altura del rebote', min: 5, max: 80, default: 25, unit: 'px' },
    ],
  },
  {
    id: generateId(),
    name: 'kf-float',
    keyframes: `0%, 100% { transform: translateY(0); }
  50% { transform: translateY(calc(var(--kf-float-h, 14) * -1px)); }`,
    description: 'Gentle floating levitation',
    parameters: [
      { variable: '--kf-float-h', label: 'Altura de flotación', min: 2, max: 50, default: 14, unit: 'px' },
    ],
  },

  // Communicative gestures
  {
    id: generateId(),
    name: 'kf-nod-yes',
    keyframes: `0%, 100% { transform: translateY(0); }
  25% { transform: translateY(calc(var(--kf-nod-yes-d, 8) * 1px)); }
  55% { transform: translateY(calc(var(--kf-nod-yes-d, 8) * 1px)); }
  80% { transform: translateY(0); }`,
    description: 'Vertical nod (affirmation)',
    parameters: [
      { variable: '--kf-nod-yes-d', label: 'Distancia', min: 2, max: 30, default: 8, unit: 'px' },
    ],
  },
  {
    id: generateId(),
    name: 'kf-nod-no',
    keyframes: `0%, 100% { transform: translateX(0); }
  25% { transform: translateX(calc(var(--kf-nod-no-d, 8) * -1px)); }
  75% { transform: translateX(calc(var(--kf-nod-no-d, 8) * 1px)); }`,
    description: 'Horizontal head shake (denial)',
    parameters: [
      { variable: '--kf-nod-no-d', label: 'Distancia', min: 2, max: 30, default: 8, unit: 'px' },
    ],
  },

  // Transitions
  {
    id: generateId(),
    name: 'kf-fade-in',
    keyframes: `0% { opacity: 0; }
  100% { opacity: 1; }`,
    description: 'Simple fade in',
  },
];
