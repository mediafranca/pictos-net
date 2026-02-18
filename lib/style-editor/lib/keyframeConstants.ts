import { KeyframeDefinition } from './types';

const generateId = () => Math.random().toString(36).substr(2, 9);

export const INITIAL_KEYFRAMES: KeyframeDefinition[] = [
  {
    id: generateId(),
    name: 'kf-blink',
    keyframes: `0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }`,
    description: 'Blink effect - fades in and out',
  },
  {
    id: generateId(),
    name: 'kf-beat',
    keyframes: `0%, 100% { transform: scale(1); }
  50% { transform: scale(1.15); }`,
    description: 'Heartbeat effect - scales up and down',
  },
  {
    id: generateId(),
    name: 'kf-swing',
    keyframes: `20% { transform: rotate(15deg); }
  40% { transform: rotate(-10deg); }
  60% { transform: rotate(5deg); }
  80% { transform: rotate(-5deg); }
  100% { transform: rotate(0deg); }`,
    description: 'Swing effect - rotates side to side',
  },
  {
    id: generateId(),
    name: 'kf-slide-r',
    keyframes: `0%, 100% { transform: translateX(0); }
  50% { transform: translateX(10px); }`,
    description: 'Slide horizontal - moves left and right',
  },
  {
    id: generateId(),
    name: 'kf-slide-u',
    keyframes: `0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }`,
    description: 'Slide vertical - moves up and down',
  },
];
