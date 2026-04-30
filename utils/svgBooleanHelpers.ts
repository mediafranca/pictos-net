/**
 * DOM-side helpers for SVG boolean operations.
 *
 * Extracts each operand's geometry as an absolute path d-string, baked into
 * the SVG root coordinate space. The pure clipping happens in
 * services/svgBooleanOps.ts.
 *
 * V1 scope: <path>, <rect>, <circle>, <ellipse>, <polygon>, <polyline>.
 * Group operands and cross-branch DCA placement are deferred.
 */

import { bakeMatrixIntoPathD, parseTransformToMatrix } from './svgNormalizer';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type EligibilityResult =
    | { ok: true }
    | { ok: false; reason: string };

/** Tags this V1 supports as boolean operands. */
const SUPPORTED_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline']);

/**
 * Convert a geometric SVG primitive to a path d-string in its own local
 * coordinate space (transform NOT yet applied). Returns null if the element
 * is not a supported geometric primitive.
 */
export function primitiveToPathD(el: Element): string | null {
    const tag = el.tagName.toLowerCase();
    const num = (name: string, fallback = 0): number => {
        const v = el.getAttribute(name);
        return v == null ? fallback : parseFloat(v);
    };
    switch (tag) {
        case 'path':
            return el.getAttribute('d');
        case 'rect': {
            const x = num('x'), y = num('y'), w = num('width'), h = num('height');
            if (w <= 0 || h <= 0) return null;
            return `M${x},${y} L${x + w},${y} L${x + w},${y + h} L${x},${y + h} Z`;
        }
        case 'circle': {
            const cx = num('cx'), cy = num('cy'), r = num('r');
            if (r <= 0) return null;
            return `M${cx + r},${cy} A${r},${r} 0 1 0 ${cx - r},${cy} A${r},${r} 0 1 0 ${cx + r},${cy} Z`;
        }
        case 'ellipse': {
            const cx = num('cx'), cy = num('cy'), rx = num('rx'), ry = num('ry');
            if (rx <= 0 || ry <= 0) return null;
            return `M${cx + rx},${cy} A${rx},${ry} 0 1 0 ${cx - rx},${cy} A${rx},${ry} 0 1 0 ${cx + rx},${cy} Z`;
        }
        case 'polygon':
        case 'polyline': {
            const points = (el.getAttribute('points') || '').trim();
            if (!points) return null;
            const pairs = points.split(/[\s,]+/).map(parseFloat);
            if (pairs.length < 4 || pairs.length % 2 !== 0) return null;
            const cmds: string[] = [`M${pairs[0]},${pairs[1]}`];
            for (let i = 2; i < pairs.length; i += 2) {
                cmds.push(`L${pairs[i]},${pairs[i + 1]}`);
            }
            if (tag === 'polygon') cmds.push('Z');
            return cmds.join(' ');
        }
        default:
            return null;
    }
}

/**
 * Compose the matrix that takes coordinates from `el`'s local space to the
 * coordinate space of `stopAt` (typically the <svg> root). Each ancestor's
 * `transform` attribute is multiplied in, outermost first.
 */
export function getCumulativeMatrix(el: Element, stopAt: Element | null): DOMMatrix {
    const chain: Element[] = [];
    let cur: Element | null = el;
    while (cur && cur !== stopAt) {
        chain.push(cur);
        cur = cur.parentElement;
    }
    let m = new DOMMatrix();
    for (let i = chain.length - 1; i >= 0; i--) {
        const t = chain[i].getAttribute('transform');
        if (t) m = m.multiply(parseTransformToMatrix(t));
    }
    return m;
}

/**
 * Read an element's geometry as a path d-string in the coordinate space of
 * the SVG root. Returns null for unsupported tags or degenerate geometry.
 */
export function getAbsolutePathData(el: Element, svgRoot: Element): string | null {
    const local = primitiveToPathD(el);
    if (!local) return null;
    const m = getCumulativeMatrix(el, svgRoot);
    if (m.isIdentity) return local;
    return bakeMatrixIntoPathD(local, m);
}

/**
 * Validate that a set of selected element ids can take part in a boolean
 * operation. Returns ok or a reason string suitable for a tooltip.
 */
export function checkBooleanEligibility(
    op: 'union' | 'subtract' | 'intersect',
    ids: string[],
    svgDocument: string
): EligibilityResult {
    if (op === 'subtract') {
        if (ids.length !== 2) return { ok: false, reason: 'Subtract requires exactly 2 shapes' };
    } else {
        if (ids.length < 2) return { ok: false, reason: 'Select at least 2 shapes' };
    }
    if (!svgDocument) return { ok: false, reason: 'No SVG loaded' };

    const doc = new DOMParser().parseFromString(svgDocument, 'image/svg+xml');
    for (const id of ids) {
        const el = doc.querySelector(`#${CSS.escape(id)}`);
        if (!el) return { ok: false, reason: `Element ${id} not found` };
        const tag = el.tagName.toLowerCase();
        if (!SUPPORTED_TAGS.has(tag)) {
            return { ok: false, reason: `Unsupported element type: <${tag}>` };
        }
    }
    return { ok: true };
}

/**
 * Sort element ids by document order (top-of-Z last). Used by subtract to
 * pick the bottom shape (Base) and the top shape (biter).
 */
export function sortByDocumentOrder(ids: string[], svgDocument: string): string[] {
    const doc = new DOMParser().parseFromString(svgDocument, 'image/svg+xml');
    const elements = ids
        .map(id => ({ id, el: doc.querySelector(`#${CSS.escape(id)}`) }))
        .filter((x): x is { id: string; el: Element } => x.el !== null);
    elements.sort((a, b) => {
        const pos = a.el.compareDocumentPosition(b.el);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
    });
    return elements.map(x => x.id);
}
