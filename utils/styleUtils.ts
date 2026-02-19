import type { StyleDefinition, CssRule } from '@style-editor/lib/types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const RULE_BLOCK_REGEX = /([^{}]+)\{([^}]*)\}/g;

const generateId = () => Math.random().toString(36).slice(2, 9);

export const getSvgStyleText = (svgDocument: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgDocument, 'image/svg+xml');
  const styleElement = doc.querySelector('style');
  return styleElement?.textContent?.trim() ?? '';
};

export const updateSvgStyleText = (
  svgDocument: string,
  cssText: string,
  removeIfEmpty: boolean = false
): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgDocument, 'image/svg+xml');
  const svgElement = doc.querySelector('svg');
  if (!svgElement) return svgDocument;

  const trimmed = cssText.trim();
  let styleElement = svgElement.querySelector('style');
  if (!trimmed && removeIfEmpty) {
    if (styleElement) {
      styleElement.remove();
    }
    return new XMLSerializer().serializeToString(doc);
  }

  if (!styleElement) {
    styleElement = doc.createElementNS(SVG_NS, 'style');
    svgElement.insertBefore(styleElement, svgElement.firstChild);
  }

  styleElement.textContent = cssText;
  return new XMLSerializer().serializeToString(doc);
};

export const parseCssToStyleDefinitions = (cssText: string): StyleDefinition[] => {
  const cleaned = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  if (!cleaned.trim()) return [];

  const styles: StyleDefinition[] = [];
  let match: RegExpExecArray | null;

  while ((match = RULE_BLOCK_REGEX.exec(cleaned)) !== null) {
    const selectorText = match[1].trim();
    if (!selectorText || selectorText.startsWith('@')) continue;

    const selectors = selectorText
      .split(',')
      .map((sel) => sel.trim())
      .filter((sel) => sel.length > 0 && sel.startsWith('.'));

    if (selectors.length === 0) continue;

    const rulesText = match[2].trim();
    const rules: CssRule[] = [];

    rulesText.split(';').forEach((rule) => {
      const [property, value] = rule.split(':').map((part) => part.trim());
      if (!property || !value) return;
      rules.push({
        id: generateId(),
        property,
        value,
      });
    });

    styles.push({
      id: generateId(),
      selectors,
      rules,
    });
  }

  return styles;
};
