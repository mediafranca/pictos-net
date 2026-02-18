import React from 'react';
import { StyleDefinition, ShapeType } from '../types';
import { Edit2, Copy } from 'lucide-react';

interface Props {
  styleDef: StyleDefinition;
  onClick: () => void;
  shape: ShapeType;
}

const StylePreviewCard: React.FC<Props> = ({ styleDef, onClick, shape }) => {
  // We strip the dot for the className usage in the SVG
  // We apply ALL selectors to the preview to ensure it matches any of them
  const classNames = styleDef.selectors.map(s => s.replace('.', '')).join(' ');

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(styleDef.selectors.join(', '));
  };

  // Check if style has fill property defined
  const hasFill = styleDef.rules.some(rule => rule.property.toLowerCase() === 'fill');

  const renderShape = () => {
    const commonProps = {
      className: `transition-all duration-300 ${classNames}`,
      // If no fill is defined, use a gray pattern as default
      ...((!hasFill) && { fill: 'url(#preview-gray-pattern)', stroke: '#999', strokeWidth: 1 })
    };

    switch (shape) {
      case 'circle':
        return <circle cx="50" cy="50" r="35" {...commonProps} />;
      case 'triangle':
        return <polygon points="50,15 85,80 15,80" {...commonProps} />;
      case 'line':
        return <line x1="15" y1="15" x2="85" y2="85" {...commonProps} />;
      case 'path':
        return <path d="M 26.79,48.39 C 19.17,37.49 13.22,32.84 21.63,24.72 36.85,10.00 48.35,14.05 55.73,24.60 61.98,33.52 50.00,39.42 60.18,44.99 70.26,50.50 67.33,30.93 79.05,30.81 86.78,30.73 83.89,57.58 83.74,63.50 83.50,72.29 77.42,90.00 67.92,81.20 56.91,71.01 53.03,70.18 47.76,73.11 42.49,76.04 34.64,85.18 34.64,85.18 L 14.13,62.10 Z" {...commonProps} />;
      case 'square':
      default:
        return <rect x="15" y="15" width="70" height="70" rx="0" {...commonProps} />;
    }
  };

  return (
    <div 
      onClick={onClick}
      className="group relative bg-white border border-gray-200 rounded-xl p-4 hover:shadow-lg transition-all cursor-pointer hover:border-blue-400 flex flex-col items-center gap-4"
    >
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
        <button 
          onClick={handleCopy}
          className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-600"
          title="Copy Selectors"
        >
          <Copy size={14} />
        </button>
        <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md">
           <Edit2 size={14} />
        </div>
      </div>

      {/* The Visual Preview - Darker Background */}
      <div className="w-24 h-24 flex items-center justify-center bg-gray-200 rounded-lg border border-gray-300 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] shadow-inner">
        <svg width="64" height="64" viewBox="0 0 100 100" className="overflow-visible">
          <defs>
            {/* Pattern for shapes without fill - diagonal gray lines */}
            <pattern id="preview-gray-pattern" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
              <rect width="8" height="8" fill="#cacaca" />
              <path d="M-1,1 l2,-2 M0,8 l8,-8 M7,9 l2,-2" stroke="#a4a4a4" strokeWidth=".75" />
            </pattern>
          </defs>
          {renderShape()}
        </svg>
      </div>

      <div className="w-full text-center">
        <div className="flex flex-wrap gap-1 justify-center mb-1">
          {styleDef.selectors.map(sel => (
            <span key={sel} className="text-xs font-mono font-medium bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
              {sel}
            </span>
          ))}
        </div>
        {styleDef.description && (
          <p className="text-xs text-gray-400 truncate px-2">{styleDef.description}</p>
        )}
      </div>
    </div>
  );
};

export default StylePreviewCard;