/**
 * SVG Normalizer
 * Strips all inline style attributes and converts them to CSS classes
 */

export interface NormalizeResult {
    svg: string;
    cssRules: string;
}

function generateId(): string {
    return 'el-' + Math.random().toString(36).substr(2, 9);
}

export function normalizeSVG(svgString: string): NormalizeResult {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgElement = doc.querySelector('svg');

    if (!svgElement) {
        // Return original if invalid, to avoid crash
        console.error('Invalid SVG document');
        return { svg: svgString, cssRules: '' };
    }

    // Auto-generate IDs for elements without them
    const allElements = svgElement.querySelectorAll('*');
    allElements.forEach((element) => {
        if (!element.id) {
            element.id = generateId();
        }
    });

    const cssRules: Map<string, string> = new Map();
    let classCounter = 0;

    // Recursive function to process elements
    function processElement(element: Element) {
        const styleAttr = element.getAttribute('style');

        if (styleAttr) {
            // Check if it already has a class from style extraction
            // For simplicity, we just extract everything
            const className = `mf-style-${classCounter++}`;

            cssRules.set(className, styleAttr);

            element.removeAttribute('style');
            const existingClass = element.getAttribute('class');
            element.setAttribute('class', existingClass ? `${existingClass} ${className}` : className);
        }

        Array.from(element.children).forEach(processElement);
    }

    processElement(svgElement);

    let cssBlock = '';
    if (cssRules.size > 0) {
        cssBlock = Array.from(cssRules.entries())
            .map(([className, styles]) => `.${className} { ${styles} }`)
            .join('\n');
    }

    // Inject extraction style block logic if needed, but here we just return the cleaned SVG string
    // and the CSS rules separately, or inject them.
    // The store handles styles separately usually via extracting extracting extracting into styleExtraction logic.
    // The original extraction logic put it into <style> tag.

    // Let's keep extraction minimal.
    const serializer = new XMLSerializer();
    return {
        svg: serializer.serializeToString(doc),
        cssRules: cssBlock,
    };
}

/**
 * Parse SVG string into a structured DOM tree compatible with our store
 */
import { SVGElement } from '../stores/svgEditorStore';

export function parseSVGToDOM(svgString: string): SVGElement | null {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgElement = doc.querySelector('svg');

    if (!svgElement) {
        return null;
    }

    function elementToNode(element: Element): SVGElement {
        const attributes: Record<string, string> = {};
        Array.from(element.attributes).forEach((attr) => {
            attributes[attr.name] = attr.value;
        });

        const id = element.getAttribute('id') || generateId();
        if (!element.id) element.id = id;

        const children = Array.from(element.children).map((child) => elementToNode(child));

        return {
            id,
            tagName: element.tagName,
            attributes,
            children,
            // innerText omitted as SVG usually doesn't use it for structure except <text>
        };
    }

    return elementToNode(svgElement);
}
