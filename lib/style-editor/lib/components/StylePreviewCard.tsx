import React from 'react';
import { StyleDefinition, ShapeType } from '../types';

interface Props {
  styleDef: StyleDefinition;
  onClick: () => void;
  shape: ShapeType;
}

const StylePreviewCard: React.FC<Props> = ({ styleDef, onClick, shape }) => {
  const classNames = styleDef.selectors.map(s => s.replace('.', '')).join(' ');
  const hatchId = `hatch-${styleDef.id}`;

  // A style is "visually empty" if it defines no fill (or fill:none) and no stroke (or stroke:none).
  // Animation-only, filter-only, and transform-only classes fall into this bucket.
  const hasVisualFill = styleDef.rules.some(r =>
    r.property.toLowerCase() === 'fill' && r.value.trim().toLowerCase() !== 'none'
  );
  const hasVisualStroke = styleDef.rules.some(r =>
    r.property.toLowerCase() === 'stroke' &&
    !['none', 'transparent', ''].includes(r.value.trim().toLowerCase())
  );
  const useHatch = !hasVisualFill && !hasVisualStroke;

  const shapeProps = {
    className: `transition-all duration-300 ${classNames}`,
    ...(useHatch && { fill: `url(#${hatchId})`, stroke: '#9ca3af', strokeWidth: 2 })
  };

  const renderShape = () => {
    switch (shape) {
      case 'circle':
        return <circle cx="50" cy="50" r="38" {...shapeProps} />;
      case 'triangle':
        return <polygon points="50,12 88,82 12,82" {...shapeProps} />;
      case 'line':
        return <line x1="12" y1="12" x2="88" y2="88" {...shapeProps} />;
      case 'path':
        return <path d="M 26.79,48.39 C 19.17,37.49 13.22,32.84 21.63,24.72 36.85,10.00 48.35,14.05 55.73,24.60 61.98,33.52 50.00,39.42 60.18,44.99 70.26,50.50 67.33,30.93 79.05,30.81 86.78,30.73 83.89,57.58 83.74,63.50 83.50,72.29 77.42,90.00 67.92,81.20 56.91,71.01 53.03,70.18 47.76,73.11 42.49,76.04 34.64,85.18 34.64,85.18 L 14.13,62.10 Z" {...shapeProps} />;
      case 'heart':
        return <path d="M 50 30 C 50 22 58 12 70 14 C 83 16 88 30 84 44 C 80 58 50 80 50 80 C 50 80 20 58 16 44 C 12 30 17 16 30 14 C 42 12 50 22 50 30 Z" {...shapeProps} />;
      case 'square':
      default:
        return <rect x="10" y="10" width="80" height="80" {...shapeProps} />;
    }
  };

  return (
    <div
      onClick={onClick}
      className="group w-full flex flex-col items-center gap-1 cursor-pointer select-none"
    >
      <svg viewBox="0 0 100 100" className="w-full aspect-square overflow-visible">
        <defs>
          <pattern id={hatchId} x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill="#e5e7eb" />
            <path d="M-1,1 l2,-2 M0,8 l8,-8 M7,9 l2,-2" stroke="#9ca3af" strokeWidth="1" />
          </pattern>
        </defs>
        {renderShape()}
      </svg>

      <div className="flex flex-wrap gap-x-1 justify-center px-0.5">
        {styleDef.selectors.map(sel => (
          <span
            key={sel}
            className="text-[10px] leading-tight font-mono text-gray-400 group-hover:text-gray-700 transition-colors"
          >
            {sel}
          </span>
        ))}
      </div>
    </div>
  );
};

export default StylePreviewCard;
