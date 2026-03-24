/**
 * SVG path `d` attribute parser and serializer.
 * Converts path commands to an AST of ParsedNode for canvas editing.
 *
 * Supports: M, L, H, V, C, S, Q, T, A, Z (absolute and relative)
 * Normalizes everything to absolute coordinates.
 * Expands shorthand: H/V → L, S → C, T → Q
 */

export type NodeKind =
    | 'anchor-corner'   // cusp: M/L/H/V — no handles — diamond ◆
    | 'anchor-smooth'   // bezier smooth (collinear handles) — circle ●
    | 'anchor-asymm'    // bezier asymmetric — square ■
    | 'anchor-close'    // Z point (return to M) — hollow circle ○
    | 'control';        // Bézier handle — small grey circle •

export interface Point {
    x: number;
    y: number;
}

export interface ParsedNode {
    index: number;
    command: string;
    anchor: Point;
    cp1?: Point;    // control point 1 (outgoing from previous anchor)
    cp2?: Point;    // control point 2 (incoming to this anchor)
    kind: NodeKind;
}

// ── Tokenizer ────────────────────────────────────────────────────────────────

interface RawCommand {
    command: string;
    args: number[];
}

/**
 * Extrae todos los números de un string de argumentos SVG path.
 * Maneja separadores implícitos del estándar SVG:
 *   - signo `-` como separador (e.g. "300.5-100.2" → [300.5, -100.2])
 *   - punto decimal consecutivo (e.g. "1.5.3" → [1.5, 0.3])
 *   - notación científica (e.g. "1e-4")
 * Se usa en parsePathToNodes y en extractVertices (vista Outline del Vectorizer).
 */
function extractNumbers(argStr: string): number[] {
    const re = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
    const result: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(argStr)) !== null) {
        const n = Number(m[0]);
        if (!isNaN(n)) result.push(n);
    }
    return result;
}

function tokenize(d: string): RawCommand[] {
    const commands: RawCommand[] = [];
    // Match command letter followed by everything until the next command letter
    const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(d)) !== null) {
        const cmd = match[1];
        const argStr = match[2].trim();
        const args = argStr.length > 0 ? extractNumbers(argStr) : [];
        commands.push({ command: cmd, args });
    }
    return commands;
}

// ── Normalize to absolute ────────────────────────────────────────────────────

interface AbsCommand {
    command: string;   // uppercase
    args: number[];
}

function toAbsolute(raw: RawCommand[]): AbsCommand[] {
    const result: AbsCommand[] = [];
    let cx = 0, cy = 0;   // current point
    let sx = 0, sy = 0;   // subpath start (for Z)

    for (const { command, args } of raw) {
        const isRel = command === command.toLowerCase();
        const cmd = command.toUpperCase();

        if (cmd === 'Z') {
            result.push({ command: 'Z', args: [] });
            cx = sx; cy = sy;
            continue;
        }

        // Determine how many args per implicit repetition
        const argsPerCmd: Record<string, number> = {
            M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7,
        };
        const count = argsPerCmd[cmd] ?? 0;
        if (count === 0) continue;

        // Process args in chunks
        for (let i = 0; i < args.length; i += count) {
            const chunk = args.slice(i, i + count);
            if (chunk.length < count) break;

            const absArgs: number[] = [];

            if (cmd === 'H') {
                absArgs.push(isRel ? cx + chunk[0] : chunk[0]);
            } else if (cmd === 'V') {
                absArgs.push(isRel ? cy + chunk[0] : chunk[0]);
            } else if (cmd === 'A') {
                // A: rx ry x-rotation large-arc sweep x y
                absArgs.push(chunk[0], chunk[1], chunk[2], chunk[3], chunk[4]);
                absArgs.push(isRel ? cx + chunk[5] : chunk[5]);
                absArgs.push(isRel ? cy + chunk[6] : chunk[6]);
            } else {
                for (let j = 0; j < chunk.length; j += 2) {
                    absArgs.push(isRel ? cx + chunk[j] : chunk[j]);
                    absArgs.push(isRel ? cy + chunk[j + 1] : chunk[j + 1]);
                }
            }

            // After first M, implicit repetitions become L
            const actualCmd = (cmd === 'M' && i > 0) ? 'L' : cmd;
            result.push({ command: actualCmd, args: absArgs });

            // Update current point
            if (cmd === 'H') {
                cx = absArgs[0];
            } else if (cmd === 'V') {
                cy = absArgs[0];
            } else if (cmd === 'A') {
                cx = absArgs[5]; cy = absArgs[6];
            } else {
                cx = absArgs[absArgs.length - 2];
                cy = absArgs[absArgs.length - 1];
            }

            if (actualCmd === 'M') { sx = cx; sy = cy; }
        }
    }

    return result;
}

// ── Expand shorthand (H/V → L, S → C, T → Q) ───────────────────────────────

function expand(cmds: AbsCommand[]): AbsCommand[] {
    const result: AbsCommand[] = [];
    let cx = 0, cy = 0;
    let prevCp2: Point | null = null;   // for S reflection
    let prevQCp: Point | null = null;   // for T reflection

    for (const { command, args } of cmds) {
        if (command === 'H') {
            result.push({ command: 'L', args: [args[0], cy] });
            cx = args[0];
            prevCp2 = null; prevQCp = null;
        } else if (command === 'V') {
            result.push({ command: 'L', args: [cx, args[0]] });
            cy = args[0];
            prevCp2 = null; prevQCp = null;
        } else if (command === 'S') {
            // S x2 y2 x y → C cp1x cp1y x2 y2 x y
            // cp1 = reflection of prevCp2 around current point
            const cp1x = prevCp2 ? 2 * cx - prevCp2.x : cx;
            const cp1y = prevCp2 ? 2 * cy - prevCp2.y : cy;
            result.push({ command: 'C', args: [cp1x, cp1y, args[0], args[1], args[2], args[3]] });
            prevCp2 = { x: args[0], y: args[1] };
            cx = args[2]; cy = args[3];
            prevQCp = null;
        } else if (command === 'T') {
            // T x y → Q cp1x cp1y x y
            const cp1x = prevQCp ? 2 * cx - prevQCp.x : cx;
            const cp1y = prevQCp ? 2 * cy - prevQCp.y : cy;
            result.push({ command: 'Q', args: [cp1x, cp1y, args[0], args[1]] });
            prevQCp = { x: cp1x, y: cp1y };
            cx = args[0]; cy = args[1];
            prevCp2 = null;
        } else {
            result.push({ command, args: [...args] });

            if (command === 'C') {
                prevCp2 = { x: args[2], y: args[3] };
                cx = args[4]; cy = args[5];
                prevQCp = null;
            } else if (command === 'Q') {
                prevQCp = { x: args[0], y: args[1] };
                cx = args[2]; cy = args[3];
                prevCp2 = null;
            } else if (command === 'A') {
                cx = args[5]; cy = args[6];
                prevCp2 = null; prevQCp = null;
            } else if (command === 'Z') {
                prevCp2 = null; prevQCp = null;
            } else {
                // M, L
                cx = args[args.length - 2]; cy = args[args.length - 1];
                prevCp2 = null; prevQCp = null;
            }
        }
    }

    return result;
}

// ── Determine node kind ──────────────────────────────────────────────────────

function dist(a: Point, b: Point): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function areCollinear(a: Point, center: Point, b: Point, tolerance = 0.05): boolean {
    // Check if a, center, b are approximately collinear
    const cross = (a.x - center.x) * (b.y - center.y) - (a.y - center.y) * (b.x - center.x);
    const len = dist(a, center) * dist(center, b);
    if (len < 1e-6) return true;
    return Math.abs(cross / len) < tolerance;
}

function classifyAnchor(node: ParsedNode, prevAnchor?: Point): NodeKind {
    if (!node.cp1 && !node.cp2) return 'anchor-corner';

    // Has at least one control point — determine smooth vs asymmetric
    const cp1 = node.cp1 ?? node.anchor;
    const cp2 = node.cp2 ?? node.anchor;
    const anchor = node.anchor;

    // For smooth: handles must be collinear through the anchor and roughly equidistant
    const d1 = dist(cp1, anchor);
    const d2 = dist(cp2, anchor);

    if (d1 < 1e-6 && d2 < 1e-6) return 'anchor-corner';

    const collinear = areCollinear(cp1, anchor, cp2);
    const equidist = Math.abs(d1 - d2) < Math.max(d1, d2) * 0.3;

    return (collinear && equidist) ? 'anchor-smooth' : 'anchor-asymm';
}

// ── Main parser ──────────────────────────────────────────────────────────────

export function parsePathToNodes(d: string): ParsedNode[] {
    const raw = tokenize(d);
    const abs = toAbsolute(raw);
    const expanded = expand(abs);

    const nodes: ParsedNode[] = [];
    let subpathStart: Point | null = null;
    let idx = 0;

    for (const { command, args } of expanded) {
        if (command === 'M') {
            const anchor = { x: args[0], y: args[1] };
            subpathStart = anchor;
            nodes.push({ index: idx++, command: 'M', anchor, kind: 'anchor-corner' });
        } else if (command === 'L') {
            const anchor = { x: args[0], y: args[1] };
            nodes.push({ index: idx++, command: 'L', anchor, kind: 'anchor-corner' });
        } else if (command === 'C') {
            const cp1: Point = { x: args[0], y: args[1] };
            const cp2: Point = { x: args[2], y: args[3] };
            const anchor: Point = { x: args[4], y: args[5] };
            const node: ParsedNode = { index: idx++, command: 'C', anchor, cp1, cp2, kind: 'anchor-corner' };
            node.kind = classifyAnchor(node);
            nodes.push(node);
        } else if (command === 'Q') {
            const cp: Point = { x: args[0], y: args[1] };
            const anchor: Point = { x: args[2], y: args[3] };
            const node: ParsedNode = { index: idx++, command: 'Q', anchor, cp1: cp, cp2: cp, kind: 'anchor-corner' };
            node.kind = classifyAnchor(node);
            nodes.push(node);
        } else if (command === 'A') {
            const anchor: Point = { x: args[5], y: args[6] };
            nodes.push({
                index: idx++,
                command: 'A',
                anchor,
                kind: 'anchor-corner',
                // Store arc params in cp1/cp2 as a convention:
                // cp1 = { x: rx, y: ry }, cp2 = { x: xRotation, y: largeArc * 10 + sweep }
                cp1: { x: args[0], y: args[1] },
                cp2: { x: args[2], y: args[3] * 10 + args[4] },
            });
        } else if (command === 'Z') {
            if (subpathStart) {
                nodes.push({
                    index: idx++,
                    command: 'Z',
                    anchor: { ...subpathStart },
                    kind: 'anchor-close',
                });
            }
        }
    }

    return nodes;
}

// ── Serializer ───────────────────────────────────────────────────────────────

export function serializeNodesToPath(nodes: ParsedNode[]): string {
    const parts: string[] = [];

    for (const node of nodes) {
        const { command, anchor, cp1, cp2 } = node;
        const r = (n: number) => Math.round(n * 1000) / 1000;

        if (command === 'M') {
            parts.push(`M${r(anchor.x)},${r(anchor.y)}`);
        } else if (command === 'L') {
            parts.push(`L${r(anchor.x)},${r(anchor.y)}`);
        } else if (command === 'C' && cp1 && cp2) {
            parts.push(`C${r(cp1.x)},${r(cp1.y)} ${r(cp2.x)},${r(cp2.y)} ${r(anchor.x)},${r(anchor.y)}`);
        } else if (command === 'Q' && cp1) {
            parts.push(`Q${r(cp1.x)},${r(cp1.y)} ${r(anchor.x)},${r(anchor.y)}`);
        } else if (command === 'A' && cp1 && cp2) {
            // Decode arc params from cp1/cp2 convention
            const rx = cp1.x, ry = cp1.y;
            const xRot = cp2.x;
            const largeArc = Math.floor(cp2.y / 10);
            const sweep = cp2.y % 10;
            parts.push(`A${r(rx)},${r(ry)} ${r(xRot)} ${largeArc} ${sweep} ${r(anchor.x)},${r(anchor.y)}`);
        } else if (command === 'Z') {
            parts.push('Z');
        }
    }

    return parts.join(' ');
}

// ── Insert node at segment ───────────────────────────────────────────────────

function lerp(a: Point, b: Point, t: number): Point {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function splitCubic(p0: Point, cp1: Point, cp2: Point, p3: Point, t: number) {
    const a = lerp(p0, cp1, t);
    const b = lerp(cp1, cp2, t);
    const c = lerp(cp2, p3, t);
    const d = lerp(a, b, t);
    const e = lerp(b, c, t);
    const mid = lerp(d, e, t);
    return {
        left: { cp1: a, cp2: d, anchor: mid },
        right: { cp1: e, cp2: c, anchor: p3 },
    };
}

export function insertNodeAtSegment(nodes: ParsedNode[], segmentIndex: number, t: number): ParsedNode[] {
    if (segmentIndex < 0 || segmentIndex >= nodes.length - 1) return nodes;

    const prev = nodes[segmentIndex];
    const next = nodes[segmentIndex + 1];
    const result = [...nodes];

    if (next.command === 'C' && next.cp1 && next.cp2) {
        const { left, right } = splitCubic(prev.anchor, next.cp1, next.cp2, next.anchor, t);
        const newNode: ParsedNode = {
            index: 0,
            command: 'C',
            anchor: left.anchor,
            cp1: left.cp1,
            cp2: left.cp2,
            kind: 'anchor-smooth',
        };
        const updatedNext: ParsedNode = {
            ...next,
            cp1: right.cp1,
            cp2: right.cp2,
        };
        result.splice(segmentIndex + 1, 1, newNode, updatedNext);
    } else if (next.command === 'L' || next.command === 'M') {
        const mid = lerp(prev.anchor, next.anchor, t);
        const newNode: ParsedNode = {
            index: 0,
            command: 'L',
            anchor: mid,
            kind: 'anchor-corner',
        };
        result.splice(segmentIndex + 1, 0, newNode);
    }

    // Re-index
    result.forEach((n, i) => { n.index = i; });
    return result;
}

// ── Delete node ──────────────────────────────────────────────────────────────

export function deleteNode(nodes: ParsedNode[], anchorIndex: number): ParsedNode[] {
    if (anchorIndex < 0 || anchorIndex >= nodes.length) return nodes;
    const node = nodes[anchorIndex];
    if (node.command === 'M' || node.command === 'Z') return nodes; // can't delete M or Z

    const result = nodes.filter((_, i) => i !== anchorIndex);
    result.forEach((n, i) => { n.index = i; });
    return result;
}

// ── Polygon/Polyline parser ──────────────────────────────────────────────────

export function parsePolygonToNodes(points: string): ParsedNode[] {
    const nums = points.trim().split(/[\s,]+/).map(Number);
    const nodes: ParsedNode[] = [];

    for (let i = 0; i < nums.length - 1; i += 2) {
        const anchor = { x: nums[i], y: nums[i + 1] };
        nodes.push({
            index: nodes.length,
            command: i === 0 ? 'M' : 'L',
            anchor,
            kind: 'anchor-corner',
        });
    }

    return nodes;
}

export function serializeNodesToPolygon(nodes: ParsedNode[]): string {
    return nodes
        .filter(n => n.command !== 'Z')
        .map(n => `${Math.round(n.anchor.x * 1000) / 1000},${Math.round(n.anchor.y * 1000) / 1000}`)
        .join(' ');
}

// ── Line parser ──────────────────────────────────────────────────────────────

export function parseLineToNodes(x1: number, y1: number, x2: number, y2: number): ParsedNode[] {
    return [
        { index: 0, command: 'M', anchor: { x: x1, y: y1 }, kind: 'anchor-corner' },
        { index: 1, command: 'L', anchor: { x: x2, y: y2 }, kind: 'anchor-corner' },
    ];
}

export function serializeNodesToLine(nodes: ParsedNode[]): string {
    if (nodes.length < 2) return '0 0 0 0';
    return `${nodes[0].anchor.x} ${nodes[0].anchor.y} ${nodes[1].anchor.x} ${nodes[1].anchor.y}`;
}
