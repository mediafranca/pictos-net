/**
 * SVG Structure Service v3 — Set-of-Marks + Claude Vision + Local Assembly
 *
 * Phase 5 (ESTRUCTURAR): Takes a raw SVG from Recraft and restructures it
 * according to the semantic DOM proposed by phase 2 (VisualElement tree).
 *
 * Pipeline:
 *   rawSvg → ensurePathIds (local)
 *          → buildPathInventory (local)
 *          → rasterizeWithMarks (local, canvas → base64 PNG)
 *          → Claude Sonnet vision (map_elements tool use)
 *          → validate + focused retry (up to 3 attempts, local)
 *          → elementMappingsToAssignment (local)
 *          → assembleSVGFromAssignment (local — geometry never leaves browser)
 *          → post-process: deriveChildIds, filterCSS, validateXML
 *
 * Claude's job: look at the marked image, decide which mark belongs to
 * which semantic node. All geometry manipulation is local.
 *
 * @module services/svgStructureService
 */

import type { NLUData, VisualElement, GlobalConfig } from "../types";
import { SVG_STYLESHEET } from "./svgStyles";
import { generateCssString } from "../lib/style-editor/lib/utils/cssGenerator";
import { callClaude, extractToolUse } from "./aiClient";

const PHASE5_MAX_ATTEMPTS = 3;
const CONFIDENCE_THRESHOLD = 0.7;
const MARK_RENDER_SIZE = 1024; // canvas px (longest side)

// ─── Public helpers ──────────────────────────────────────────────────────────

export const generateStylesheet = (config: GlobalConfig): string => {
    if (config.svgStyleDefs && config.svgStyleDefs.length > 0) {
        return generateCssString(config.svgStyleDefs, config.svgKeyframes ?? []);
    }
    return SVG_STYLESHEET;
};

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface SVGStructureInput {
    rawSvg: string;
    nlu: NLUData;
    elements: VisualElement[];
    utterance: string;
    config: GlobalConfig;
    onProgress?: (msg: string) => void;
    onStatus?: (status: string) => void;
}

export interface SVGStructureResult {
    svg: string;
    success: boolean;
    error?: string;
}

// ─── Path Inventory (local pre-processing) ───────────────────────────────────

interface PathInfo {
    id: string;
    fill: string;
    fillRole: 'dark' | 'light' | 'accent' | 'unknown';
    cx: number;
    cy: number;
    vtracerGroup: string | null;
}

interface PathInventory {
    paths: PathInfo[];
    vtracerGroups: Record<string, string[]>;
    groupClasses: Record<string, string>;
    pathClasses: Record<string, string>;
    standalonePathIds: string[];
    backgroundPathIds: string[];
    viewBox: string;
    rawStyleRules: string;
    cssFillMap: Record<string, string>;
}

function getFillRole(fill: string): 'dark' | 'light' | 'accent' | 'unknown' {
    if (!fill || fill === 'none') return 'unknown';
    const hex = fill.replace('#', '');
    if (hex.length !== 6 && hex.length !== 3) return 'unknown';
    let r: number, g: number, b: number;
    if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
    } else {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
    }
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    if (saturation > 0.4 && luminance > 0.1) return 'accent';
    if (luminance < 0.2) return 'dark';
    if (luminance > 0.8) return 'light';
    return 'unknown';
}

function fillRoleToColorClass(role: 'dark' | 'light' | 'accent' | 'unknown'): string {
    switch (role) {
        case 'dark': return 'main';
        case 'light': return 'w';
        case 'accent': return 'accent';
        default: return 'main';
    }
}

function getDominantFillRole(pathIds: string[], pathInfoMap: Map<string, PathInfo>): 'dark' | 'light' | 'accent' | 'unknown' {
    const counts: Record<string, number> = { dark: 0, light: 0, accent: 0, unknown: 0 };
    for (const id of pathIds) {
        const info = pathInfoMap.get(id);
        if (info) counts[info.fillRole]++;
    }
    if (counts.dark >= counts.light && counts.dark >= counts.accent && counts.dark > 0) return 'dark';
    if (counts.light >= counts.accent && counts.light > 0) return 'light';
    if (counts.accent > 0) return 'accent';
    return 'dark';
}

function collectAllPathIds(node: AssignmentNode): string[] {
    const ids = [...(node.paths ?? [])];
    if (node.children) {
        for (const child of Object.values(node.children)) {
            ids.push(...collectAllPathIds(child));
        }
    }
    return ids;
}

function getTranslateOffset(transform: string | null): [number, number] {
    if (!transform) return [0, 0];
    const m = transform.match(/translate\(\s*([^,\s]+)[\s,]+([^)\s]+)\s*\)/);
    return m ? [Math.round(parseFloat(m[1])), Math.round(parseFloat(m[2]))] : [0, 0];
}

function getCentroid(d: string, tx: number, ty: number): [number, number] {
    const nums = d.match(/-?[0-9]+\.?[0-9]*/g)?.map(Number) ?? [];
    if (nums.length < 2) return [tx, ty];
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    return [
        Math.round(xs.reduce((a, b) => a + b, 0) / xs.length + tx),
        Math.round(ys.reduce((a, b) => a + b, 0) / ys.length + ty),
    ];
}

function offsetPathD(d: string, tx: number, ty: number): string {
    const tokens = d.match(/[A-Za-z]|[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g);
    if (!tokens) return d;
    const result: string[] = [];
    let cmd = '';
    let argIndex = 0;
    for (const tok of tokens) {
        if (/^[A-Za-z]$/.test(tok)) { cmd = tok; argIndex = 0; result.push(tok); continue; }
        const val = parseFloat(tok);
        const isRelative = cmd === cmd.toLowerCase();
        if (isRelative) { result.push(tok); argIndex++; continue; }
        const upper = cmd.toUpperCase();
        let offsetVal = val;
        if (upper === 'H') { offsetVal = val + tx; }
        else if (upper === 'V') { offsetVal = val + ty; }
        else if (upper === 'A') { const ai = argIndex % 7; if (ai === 5) offsetVal = val + tx; else if (ai === 6) offsetVal = val + ty; }
        else { if (argIndex % 2 === 0) offsetVal = val + tx; else offsetVal = val + ty; }
        const str = Number.isInteger(offsetVal) ? String(offsetVal) : offsetVal.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
        result.push(str);
        argIndex++;
    }
    let out = '';
    for (let i = 0; i < result.length; i++) {
        const tok = result[i];
        out += (/^[A-Za-z]$/.test(tok) ? (i > 0 ? ' ' : '') : ' ') + tok;
    }
    return out.trim();
}

function extractFill(el: Element): string {
    const fillAttr = el.getAttribute('fill');
    if (fillAttr && fillAttr !== 'none') return fillAttr.trim();
    const style = el.getAttribute('style') ?? '';
    const m = style.match(/fill:\s*([^;]+)/);
    return m?.[1]?.trim() ?? '#000000';
}

function isBackgroundRect(d: string, tx: number, ty: number, viewBox: string): boolean {
    if (tx !== 0 || ty !== 0) return false;
    const vbParts = viewBox.split(/\s+/).map(Number);
    if (vbParts.length !== 4) return false;
    const [, , vbW, vbH] = vbParts;
    const nums = d.match(/-?[0-9]+\.?[0-9]*/g)?.map(Number) ?? [];
    if (nums.length < 4) return false;
    const hasWidth = nums.some(n => Math.abs(n - vbW) < 2);
    const hasHeight = nums.some(n => Math.abs(n - vbH) < 2);
    const startsAtOrigin = nums[0] === 0 && nums[1] === 0;
    return startsAtOrigin && hasWidth && hasHeight;
}

export function ensurePathIds(svg: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return svg;
    const existingIds = new Set<string>();
    svgEl.querySelectorAll('[id]').forEach(el => existingIds.add(el.getAttribute('id')!));
    let counter = 0;
    svgEl.querySelectorAll('path').forEach(p => {
        if (!p.getAttribute('id')) {
            let newId: string;
            do { newId = `p${counter++}`; } while (existingIds.has(newId));
            p.setAttribute('id', newId);
            existingIds.add(newId);
        }
    });
    svgEl.querySelectorAll('g').forEach(g => {
        if (!g.getAttribute('id')) {
            let newId: string;
            do { newId = `g${counter++}`; } while (existingIds.has(newId));
            g.setAttribute('id', newId);
            existingIds.add(newId);
        }
    });
    return new XMLSerializer().serializeToString(svgEl);
}

export function buildPathInventory(svg: string): PathInventory {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    const vbMatch = svg.match(/viewBox="([^"]+)"/);
    const viewBox = vbMatch?.[1] ?? '0 0 1024 1024';
    const paths: PathInfo[] = [];
    const backgroundPathIds: string[] = [];
    const vtracerGroups: Record<string, string[]> = {};
    const groupClasses: Record<string, string> = {};
    const pathClasses: Record<string, string> = {};
    const standalonePathIds: string[] = [];
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return { paths, vtracerGroups, groupClasses, pathClasses, standalonePathIds, backgroundPathIds: [], viewBox, rawStyleRules: '', cssFillMap: {} };

    let rawStyleRules = '';
    svgEl.querySelectorAll('style').forEach(styleEl => {
        const text = styleEl.textContent?.trim();
        if (text) rawStyleRules += (rawStyleRules ? '\n' : '') + text;
    });

    const cssFillMap: Record<string, string> = {};
    if (rawStyleRules) {
        const ruleRe = /([^{]+)\{([^}]+)\}/g;
        let m: RegExpExecArray | null;
        while ((m = ruleRe.exec(rawStyleRules)) !== null) {
            const selector = m[1].trim();
            const decls = m[2];
            const fillMatch = decls.match(/fill\s*:\s*([^;}\s]+)/);
            if (!fillMatch) continue;
            const classMatches = [...selector.matchAll(/\.([a-zA-Z][\w-]*)/g)];
            for (const cm of classMatches) { cssFillMap[cm[1]] = fillMatch[1].trim(); }
        }
    }

    function resolveFill(el: Element): string {
        const inline = extractFill(el);
        if (inline !== '#000000') return inline;
        const cls = el.getAttribute('class')?.trim();
        if (cls) { for (const c of cls.split(/\s+/)) { if (cssFillMap[c]) return cssFillMap[c]; } }
        return inline;
    }

    for (const child of Array.from(svgEl.children)) {
        const tag = child.tagName.toLowerCase();
        const id = child.getAttribute('id') ?? '';
        if (['defs', 'style', 'title', 'desc', 'metadata'].includes(tag)) continue;
        if (tag === 'g') {
            const groupPaths: string[] = [];
            const cls = child.getAttribute('class')?.trim();
            if (cls && id) groupClasses[id] = cls;
            for (const p of Array.from(child.querySelectorAll('path'))) {
                const pid = p.getAttribute('id') ?? '';
                if (!pid) continue;
                const fill = resolveFill(p);
                const d = p.getAttribute('d') ?? '';
                const transform = p.getAttribute('transform') ?? '';
                const [tx, ty] = getTranslateOffset(transform);
                const [cx, cy] = getCentroid(d, tx, ty);
                const pCls = p.getAttribute('class')?.trim();
                if (pCls) pathClasses[pid] = pCls;
                paths.push({ id: pid, fill, fillRole: getFillRole(fill), cx, cy, vtracerGroup: id });
                groupPaths.push(pid);
            }
            if (groupPaths.length > 0) vtracerGroups[id] = groupPaths;
        } else if (tag === 'path') {
            const pid = id;
            if (!pid) continue;
            const fill = resolveFill(child);
            const d = child.getAttribute('d') ?? '';
            const transform = child.getAttribute('transform') ?? '';
            const [tx, ty] = getTranslateOffset(transform);
            if (isBackgroundRect(d, tx, ty, viewBox)) { backgroundPathIds.push(pid); continue; }
            const [cx, cy] = getCentroid(d, tx, ty);
            const pCls = child.getAttribute('class')?.trim();
            if (pCls) pathClasses[pid] = pCls;
            paths.push({ id: pid, fill, fillRole: getFillRole(fill), cx, cy, vtracerGroup: null });
            standalonePathIds.push(pid);
        }
    }

    if (backgroundPathIds.length > 0) {
        console.info(`[inventory] Excluded ${backgroundPathIds.length} background path(s): ${backgroundPathIds.join(', ')}`);
    }

    return { paths, vtracerGroups, groupClasses, pathClasses, standalonePathIds, backgroundPathIds, viewBox, rawStyleRules, cssFillMap };
}

// ─── Set-of-Marks Rasterization (browser canvas) ─────────────────────────────

/**
 * Rasterize the SVG and overlay numbered labels at each path's centroid.
 * Returns base64-encoded PNG (without data: prefix).
 */
async function rasterizeWithMarks(svgString: string, inventory: PathInventory): Promise<string> {
    return new Promise((resolve, reject) => {
        const parts = inventory.viewBox.split(/\s+/).map(Number);
        const vbW = parts[2] || 1024;
        const vbH = parts[3] || 1024;
        const scale = MARK_RENDER_SIZE / Math.max(vbW, vbH);
        const w = Math.round(vbW * scale);
        const h = Math.round(vbH * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Could not get canvas context')); return; }

        const img = new Image();
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        img.onload = () => {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(url);

            // Draw a numbered label at each path centroid
            inventory.paths.forEach((path, index) => {
                const cx = Math.round(path.cx * scale);
                const cy = Math.round(path.cy * scale);
                const radius = 13;

                // Red circle
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(220, 38, 38, 0.90)';
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Index number
                ctx.fillStyle = 'white';
                ctx.font = `bold ${radius}px Arial, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(index), cx, cy);
            });

            const dataUrl = canvas.toDataURL('image/png');
            resolve(dataUrl.split(',')[1]); // base64 only, no prefix
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to rasterize SVG for set-of-marks'));
        };
        img.src = url;
    });
}

/**
 * Rasterize a single element in isolation (tightly cropped).
 * Used for focused retries on low-confidence assignments.
 */
async function rasterizeIsolated(svgString: string, pathId: string, viewBox: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const parts = viewBox.split(/\s+/).map(Number);
        const vbW = parts[2] || 1024;
        const vbH = parts[3] || 1024;
        const scale = MARK_RENDER_SIZE / Math.max(vbW, vbH);
        const w = Math.round(vbW * scale);
        const h = Math.round(vbH * scale);

        // Build SVG that shows only the target path
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        doc.querySelectorAll('path').forEach(p => {
            if (p.getAttribute('id') !== pathId) {
                p.setAttribute('opacity', '0.08');
            }
        });
        const isolatedSvg = new XMLSerializer().serializeToString(doc);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Could not get canvas context')); return; }

        const img = new Image();
        const blob = new Blob([isolatedSvg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        img.onload = () => {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/png').split(',')[1]);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to rasterize isolated path')); };
        img.src = url;
    });
}

// ─── Claude Vision Tool Use (Phase 5) ────────────────────────────────────────

interface ElementMapping {
    elementIndex: number;
    nodeId: string;
    confidence: number;
    justification: string;
}

interface MappingResult {
    description: string;
    mappings: ElementMapping[];
}

/** Collect all node IDs from a VisualElement tree (depth-first). */
function collectNodeIds(elements: VisualElement[]): string[] {
    const ids: string[] = [];
    function walk(els: VisualElement[]) {
        for (const el of els) {
            ids.push(el.id);
            if (el.children) walk(el.children);
        }
    }
    walk(elements);
    return ids;
}

/** Build Claude tool schema for map_elements, with nodeId enum from VisualDOM. */
function buildMappingToolSchema(nodeIds: string[], pathCount: number) {
    return {
        name: 'map_elements',
        description: `Map each numbered SVG element (0 to ${pathCount - 1}) to a semantic DOM node. Use "none" for background/irrelevant elements.`,
        input_schema: {
            type: 'object' as const,
            properties: {
                description: {
                    type: 'string',
                    description: 'Brief visual description of the pictogram (1-2 sentences).',
                },
                mappings: {
                    type: 'array',
                    description: `Array of exactly ${pathCount} mappings, one per numbered element.`,
                    items: {
                        type: 'object',
                        properties: {
                            elementIndex: { type: 'integer', minimum: 0, maximum: pathCount - 1 },
                            nodeId: { type: 'string', enum: ['none', ...nodeIds] },
                            confidence: { type: 'number', minimum: 0, maximum: 1 },
                            justification: { type: 'string' },
                        },
                        required: ['elementIndex', 'nodeId', 'confidence', 'justification'],
                    },
                },
            },
            required: ['description', 'mappings'],
        },
    };
}

async function callVisionMapping(
    markedImageBase64: string,
    elements: VisualElement[],
    nlu: NLUData,
    inventory: PathInventory,
    onProgress?: (msg: string) => void,
): Promise<MappingResult> {
    const nodeIds = collectNodeIds(elements);
    const tool = buildMappingToolSchema(nodeIds, inventory.paths.length);

    const lang = nlu.lang || 'es-419';
    const vg = nlu.visual_guidelines;

    const systemPrompt = `You are a visual semantic mapping agent for AAC pictogram analysis.
You receive an SVG image where each visual element has been numbered with a red circle.
Your task: assign each numbered element to the correct semantic node from the visual DOM.

Semantic context:
- Utterance: "${nlu.utterance}"
- Actor: ${vg?.focus_actor || '?'}
- Action: ${vg?.action_core || '?'}
- Object: ${vg?.object_core || '?'}
- Domain: ${nlu.domain || 'general'}

Visual DOM (target structure):
${elements.map(e => formatElementTree(e)).join('\n')}

Rules:
1. Every numbered element (0 to ${inventory.paths.length - 1}) must appear in mappings exactly once.
2. Use only the nodeIds from the enum: ${['none', ...nodeIds].join(', ')}.
3. Use "none" only for clear background shapes or irrelevant decorative elements.
4. Confidence 1.0 = certain, 0.0 = pure guess. Flag anything below ${CONFIDENCE_THRESHOLD}.
5. Multiple elements can share the same nodeId (one semantic node may span many paths).
6. Respond in ${lang}.`;

    const userContent = `Analyze this numbered SVG pictogram. Map each numbered element to its semantic node.`;

    const response = await callClaude({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: systemPrompt,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'map_elements' },
        messages: [{
            role: 'user',
            content: [
                {
                    type: 'image',
                    source: { type: 'base64', media_type: 'image/png', data: markedImageBase64 },
                },
                { type: 'text', text: userContent },
            ],
        }],
    });

    return extractToolUse(response, 'map_elements') as MappingResult;
}

function formatElementTree(el: VisualElement, depth = 0): string {
    const indent = '  '.repeat(depth);
    const line = `${indent}- ${el.id}`;
    const children = el.children?.map(c => formatElementTree(c, depth + 1)).join('\n') || '';
    return children ? `${line}\n${children}` : line;
}

// ─── Conversion: ElementMapping[] → AssignmentNode tree ──────────────────────

interface AssignmentNode {
    concept: string;
    label: string;
    class?: string;
    paths?: string[];
    evenodd?: boolean;
    children?: Record<string, AssignmentNode>;
}

interface Assignment {
    desc: string;
    groups: Record<string, AssignmentNode>;
}

function guessConceptFromNLU(elementId: string, nlu: NLUData): string {
    const id = elementId.toLowerCase().replace(/_/g, ' ');
    const vg = nlu.visual_guidelines;
    if (vg?.focus_actor && id.includes(vg.focus_actor.toLowerCase())) return 'Agent';
    if (vg?.action_core && id.includes(vg.action_core.toLowerCase())) return 'Action';
    if (vg?.object_core && id.includes(vg.object_core.toLowerCase())) return 'Object';
    if (id === 'pictograma' || id === 'pictogram') return 'Agent';
    return 'Object';
}

function buildAssignmentNode(
    el: VisualElement,
    nodePathMap: Map<string, string[]>,
    nlu: NLUData,
): AssignmentNode {
    const pathIds = nodePathMap.get(el.id) || [];
    const concept = guessConceptFromNLU(el.id, nlu);
    const cls = concept === 'Agent' ? 'k' : 'f';

    const children: Record<string, AssignmentNode> = {};
    for (const child of el.children ?? []) {
        children[child.id] = buildAssignmentNode(child, nodePathMap, nlu);
    }

    return {
        concept,
        label: el.id.replace(/_/g, ' '),
        class: cls,
        paths: pathIds,
        ...(Object.keys(children).length > 0 ? { children } : {}),
    };
}

function elementMappingsToAssignment(
    result: MappingResult,
    inventory: PathInventory,
    elements: VisualElement[],
    nlu: NLUData,
): Assignment {
    // Build index → pathId lookup
    const indexToPathId = new Map<number, string>(
        inventory.paths.map((p, i) => [i, p.id])
    );

    // Group pathIds by nodeId
    const nodePathMap = new Map<string, string[]>();
    const nonePaths: string[] = [];

    for (const m of result.mappings) {
        const pathId = indexToPathId.get(m.elementIndex);
        if (!pathId) continue;
        if (m.nodeId === 'none') {
            nonePaths.push(pathId);
        } else {
            const list = nodePathMap.get(m.nodeId) ?? [];
            list.push(pathId);
            nodePathMap.set(m.nodeId, list);
        }
    }

    // Build groups from the VisualElement tree
    const groups: Record<string, AssignmentNode> = {};

    // Skip the root 'pictograma' node — use its children as top-level groups
    const rootEl = elements.find(e => e.id === 'pictograma');
    const topLevel = rootEl?.children ?? elements;

    for (const el of topLevel) {
        groups[el.id] = buildAssignmentNode(el, nodePathMap, nlu);
    }

    // Paths assigned to root pictograma go to the first group or fallback
    const rootPaths = nodePathMap.get('pictograma') ?? [];
    if (rootPaths.length > 0) {
        if (topLevel.length > 0) {
            const firstGroup = groups[topLevel[0].id];
            firstGroup.paths = [...(firstGroup.paths ?? []), ...rootPaths];
        } else {
            groups['contexto'] = { concept: 'Context', label: 'elementos de contexto', class: 'f', paths: rootPaths };
        }
    }

    // Fallback: unassigned ("none") paths
    if (nonePaths.length > 0) {
        groups['contexto'] = {
            ...(groups['contexto'] ?? { concept: 'Context', label: 'elementos de contexto', class: 'f', paths: [] }),
            paths: [...(groups['contexto']?.paths ?? []), ...nonePaths],
        };
    }

    return { desc: result.description ?? '', groups };
}

// ─── Local SVG Assembly (unchanged from v2) ──────────────────────────────────

interface OriginalPathData {
    d: string;
    transform: string;
    fill: string;
    className: string;
    otherAttrs: string;
}

function extractOriginalPaths(rawSvg: string): Map<string, OriginalPathData> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawSvg, 'image/svg+xml');
    const map = new Map<string, OriginalPathData>();
    doc.querySelectorAll('path').forEach(p => {
        const id = p.getAttribute('id');
        if (!id) return;
        const fill = extractFill(p);
        const d = p.getAttribute('d') ?? '';
        const transform = p.getAttribute('transform') ?? '';
        const className = p.getAttribute('class')?.trim() ?? '';
        const skipAttrs = new Set(['id', 'd', 'transform', 'fill', 'style', 'class']);
        const otherParts: string[] = [];
        for (const attr of Array.from(p.attributes)) {
            if (!skipAttrs.has(attr.name)) otherParts.push(`${attr.name}="${attr.value}"`);
        }
        map.set(id, { d, transform, fill, className, otherAttrs: otherParts.join(' ') });
    });
    return map;
}

function escapeXmlAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderNode(
    groupId: string,
    node: AssignmentNode,
    originalPaths: Map<string, OriginalPathData>,
    groupClasses: Record<string, string>,
    pathClasses: Record<string, string>,
    pathInfoMap: Map<string, PathInfo>,
    cssFillMap: Record<string, string> = {},
    indent = '  ',
): string {
    const allIds = collectAllPathIds(node);
    const dominantRole = getDominantFillRole(allIds, pathInfoMap);
    const colorCls = fillRoleToColorClass(dominantRole);
    const semanticCls = node.class ?? 'f';
    const groupUserCls = groupClasses[groupId] ?? '';
    const pathUserClasses = (node.paths ?? [])
        .map(pid => pathClasses[pid]).filter(Boolean)
        .flatMap(c => c.split(/\s+/)).filter(c => c);
    const allUserCls = [groupUserCls, ...new Set(pathUserClasses)].filter(Boolean).join(' ');
    const userHasFill = allUserCls.split(/\s+/).some(c => cssFillMap[c]);
    const clsParts = [semanticCls];
    if (!userHasFill) clsParts.push(colorCls);
    if (allUserCls) clsParts.push(allUserCls);
    const cls = clsParts.join(' ');
    const label = escapeXmlAttr(node.label);
    const concept = escapeXmlAttr(node.concept);
    const openTag = `${indent}<g id="${groupId}" role="group" tabindex="0" data-concept="${concept}" aria-label="${label}" class="${cls}">`;
    const lines = [openTag];

    if (node.paths?.length) {
        if (node.evenodd && node.paths.length > 1) {
            const darkPath = node.paths.map(id => originalPaths.get(id)).find(p => p && getFillRole(p.fill) === 'dark');
            const fill = darkPath?.fill ?? '#000000';
            const subpaths = node.paths.map(id => {
                const p = originalPaths.get(id);
                if (!p) return '';
                if (p.transform) {
                    const tm = p.transform.match(/translate\(\s*([^,\s]+)[\s,]+([^)\s]+)\s*\)/);
                    if (tm) {
                        const tx = parseFloat(tm[1]); const ty = parseFloat(tm[2]);
                        if (tx !== 0 || ty !== 0) return offsetPathD(p.d, tx, ty);
                    }
                }
                return p.d;
            }).filter(Boolean).join(' ');
            lines.push(`${indent}  <path d="${subpaths}" fill="${fill}" fill-rule="evenodd"/>`);
        } else {
            for (const pathId of node.paths) {
                const p = originalPaths.get(pathId);
                if (!p) { console.warn(`[assemble] path not found: ${pathId}`); continue; }
                const transformAttr = p.transform ? ` transform="${p.transform}"` : '';
                const classAttr = p.className ? ` class="${p.className}"` : '';
                const otherAttrs = p.otherAttrs ? ` ${p.otherAttrs}` : '';
                lines.push(`${indent}  <path id="${pathId}" d="${p.d}"${classAttr}${transformAttr}${otherAttrs}/>`);
            }
        }
    }

    if (node.children) {
        for (const [childId, childNode] of Object.entries(node.children)) {
            lines.push(renderNode(childId, childNode, originalPaths, groupClasses, pathClasses, pathInfoMap, cssFillMap, indent + '  '));
        }
    }

    lines.push(`${indent}</g>`);
    return lines.join('\n');
}

function assembleSVGFromAssignment(
    rawSvg: string,
    assignment: Assignment,
    input: SVGStructureInput,
    metadata: object,
    filteredCSS: string,
    viewBox: string,
    groupClasses: Record<string, string>,
    pathClasses: Record<string, string>,
    pathInfoMap: Map<string, PathInfo>,
    cssFillMap: Record<string, string> = {},
    excludePathIds: Set<string> = new Set(),
): string {
    const originalPaths = extractOriginalPaths(rawSvg);
    const assignedIds = new Set<string>();
    function collectIds(node: AssignmentNode) {
        node.paths?.forEach(id => assignedIds.add(id));
        if (node.children) Object.values(node.children).forEach(collectIds);
    }
    Object.values(assignment.groups).forEach(collectIds);

    const allOriginalIds = Array.from(originalPaths.keys()).filter(id => !excludePathIds.has(id));
    const missing = allOriginalIds.filter(id => !assignedIds.has(id));
    if (missing.length > 0) {
        console.warn(`[assemble] paths sin asignar: ${missing.join(', ')}`);
        assignment.groups['contexto'] = assignment.groups['contexto'] ?? { concept: 'Context', label: 'elementos de contexto', class: 'f', paths: [] };
        assignment.groups['contexto'].paths = [...(assignment.groups['contexto'].paths ?? []), ...missing];
    }

    const body = Object.entries(assignment.groups)
        .map(([gid, node]) => renderNode(gid, node, originalPaths, groupClasses, pathClasses, pathInfoMap, cssFillMap))
        .join('\n');

    return assembleStructuredSVG(body, input, metadata, filteredCSS, viewBox);
}

// ─── Post-processing ─────────────────────────────────────────────────────────

function buildFilteredCSS(fullCSS: string, usedClasses: Set<string>): string {
    const keyframeRe = /@keyframes\s+([\w-]+)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;
    const keyframes = new Map<string, string>();
    let strippedCSS = fullCSS;
    let kfM: RegExpExecArray | null;
    while ((kfM = keyframeRe.exec(fullCSS)) !== null) { keyframes.set(kfM[1], kfM[0]); strippedCSS = strippedCSS.replace(kfM[0], ''); }
    const ruleRe = /([^{]+)\{([^}]+)\}/g;
    const keptRules: string[] = [];
    const usedAnimations = new Set<string>();
    let rM: RegExpExecArray | null;
    while ((rM = ruleRe.exec(strippedCSS)) !== null) {
        const selector = rM[1].trim();
        const declarations = rM[2].trim();
        if (!declarations) continue;
        if (selector.includes('[role="group"]')) { keptRules.push(`${selector} {\n  ${declarations}\n}`); continue; }
        const classesInSelector = [...selector.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(c => c[1]);
        if (!classesInSelector.some(cls => usedClasses.has(cls))) continue;
        keptRules.push(`${selector} {\n  ${declarations}\n}`);
        const animMatch = declarations.match(/animation(?:-name)?\s*:\s*([\w-]+)/);
        if (animMatch) usedAnimations.add(animMatch[1]);
    }
    for (const [name, block] of keyframes) { if (usedAnimations.has(name)) keptRules.push(block); }
    return keptRules.join('\n\n');
}

function deriveChildIds(svgContent: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    if (doc.querySelector('parsererror')) { console.warn('[deriveChildIds] SVG parse failed'); return svgContent; }
    const renames = new Map<string, string>();
    const vtracerHashRe = /^el-[0-9a-z]+$/i;
    doc.querySelectorAll('g[id]').forEach(group => {
        const gId = group.getAttribute('id')!;
        if (vtracerHashRe.test(gId)) return;
        let counter = 1;
        group.childNodes.forEach(child => {
            if (!(child instanceof Element) || child.tagName === 'g') return;
            const oldId = child.getAttribute('id');
            if (!oldId) { child.setAttribute('id', `${gId}-${counter++}`); return; }
            if (vtracerHashRe.test(oldId) || /^(p|g|path|rect|circle)\d+$/.test(oldId)) {
                const newId = `${gId}-${counter++}`;
                child.setAttribute('id', newId);
                renames.set(oldId, newId);
            }
        });
    });
    let result = new XMLSerializer().serializeToString(doc);
    result = result.replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');
    result = result.replace(/<svg /, '<svg xmlns="http://www.w3.org/2000/svg" ');
    for (const [oldId, newId] of renames) {
        result = result.replace(new RegExp(`#${oldId}(?=[.\\s{,])`, 'g'), `#${newId}`);
    }
    return result;
}

function removeEmptyGroupsFromFragment(fragment: string): string {
    let prev = '';
    let current = fragment;
    while (prev !== current) { prev = current; current = current.replace(/<g(\s[^>]*)?\s*>\s*<\/g>/g, ''); }
    return current;
}

function validateXML(svg: string): string | null {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const err = doc.querySelector('parsererror');
    return err ? err.textContent || 'XML parse error' : null;
}

// ─── Metadata ────────────────────────────────────────────────────────────────

function buildMetadataJSON(input: SVGStructureInput): object {
    const nlu = input.nlu;
    const vg = nlu.visual_guidelines;
    const config = input.config;
    const naturalDesc = [
        vg?.focus_actor,
        vg?.action_core && `realizando: ${vg.action_core}`,
        vg?.object_core && `con: ${vg.object_core}`,
        vg?.context && `contexto: ${vg.context}`,
    ].filter(Boolean).join(', ') || input.utterance;
    return {
        version: "1.0.0",
        schema: "mediafranca/mf-svg-schema",
        pipeline: "claude+recraft",
        utterance: input.utterance,
        lang: nlu.lang || config.lang || 'es-419',
        domain: nlu.domain ?? 'general',
        region: config.geoContext?.region ?? null,
        nsm: { explications: nlu.nsm_explications ?? {} },
        frames: (nlu.frames ?? []).map(f => ({
            frame: f.frame_name, label: f.frame_label ?? f.frame_name, lexicalUnit: f.lexical_unit,
            roles: Object.fromEntries(Object.entries(f.roles ?? {}).map(([role, data]) => [role, { type: data.type, surface: data.surface, ref: data.ref }])),
        })),
        pragmatics: {
            speechAct: nlu.metadata?.speech_act ?? 'assertive', intent: nlu.metadata?.intent ?? 'inform',
            politeness: nlu.pragmatics?.politeness ?? null, formality: nlu.pragmatics?.formality ?? null,
            expectedResponse: nlu.pragmatics?.expected_response ?? null,
        },
        visualGuidelines: { focusActor: vg?.focus_actor ?? null, actionCore: vg?.action_core ?? null, objectCore: vg?.object_core ?? null, context: vg?.context ?? null, temporal: vg?.temporal ?? null },
        accessibility: { cognitiveDescription: input.utterance, visualDescription: naturalDesc, lang: nlu.lang || config.lang || 'es-419' },
        provenance: { generator: "PictoNet", generatedAt: new Date().toISOString(), sourceDataset: "MediaFranca-PictoNet", licence: config.license || "CC BY 4.0" },
    };
}

function assembleStructuredSVG(body: string, input: SVGStructureInput, metadata: object, filteredCSS: string, viewBox: string): string {
    const lang = input.nlu.lang || input.config.lang || 'es-419';
    const domain = input.nlu.domain ?? 'general';
    const utteranceEscaped = escapeXmlAttr(input.utterance);
    const descMatch = body.match(/<desc[^>]*>([\s\S]*?)<\/desc>/i);
    const descContent = descMatch ? descMatch[1].trim() : input.utterance;
    const bodyWithoutDesc = body.replace(/<desc[^>]*>[\s\S]*?<\/desc>/i, '').trim();
    const descEscaped = descContent.replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const metadataJSON = JSON.stringify(metadata, null, 2);
    return `<svg id="pictogram" xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="title desc" lang="${lang}" tabindex="0" focusable="true" data-domain="${domain}" data-utterance="${utteranceEscaped}">
  <title id="title">${utteranceEscaped}</title>
  <desc id="desc">${descEscaped}</desc>
  <metadata id="mf-data"><![CDATA[
${metadataJSON}
  ]]></metadata>
  <defs>
    <style>
${filteredCSS}
    </style>
  </defs>
  ${bodyWithoutDesc}
</svg>`;
}

// ─── Main structuring function (v3: set-of-marks + Claude vision) ─────────────

export async function structureSVG(input: SVGStructureInput): Promise<SVGStructureResult> {
    try {
        if (!input.rawSvg || typeof input.rawSvg !== 'string') {
            return { svg: '', success: false, error: 'rawSvg no es un string válido' };
        }

        if (input.onProgress) input.onProgress('[ESTRUCTURAR] Pre-procesando SVG local…');

        // Step 0: Ensure all paths have ids
        const rawSvgWithIds = ensurePathIds(input.rawSvg);

        // Step 1: Build path inventory
        const inventory = buildPathInventory(rawSvgWithIds);
        if (inventory.paths.length === 0) {
            return { svg: '', success: false, error: 'No se encontraron paths en el SVG' };
        }

        if (input.onProgress) {
            input.onProgress(`[ESTRUCTURAR] Inventario: ${inventory.paths.length} paths, ${Object.keys(inventory.vtracerGroups).length} grupos`);
        }

        // Step 2: Rasterize with set-of-marks labels
        if (input.onProgress) input.onProgress('[ESTRUCTURAR] Renderizando marcas numeradas…');
        const markedImageBase64 = await rasterizeWithMarks(rawSvgWithIds, inventory);

        // Step 3: Claude vision call (with retry loop)
        let mappingResult: MappingResult | null = null;
        let attempt = 0;

        // Initial full-image pass
        if (input.onProgress) input.onProgress('[ESTRUCTURAR] Enviando imagen marcada a Claude Sonnet…');
        if (input.onStatus) input.onStatus('sending');

        mappingResult = await callVisionMapping(markedImageBase64, input.elements, input.nlu, inventory, input.onProgress);

        if (input.onStatus) input.onStatus('receiving');
        if (input.onProgress) input.onProgress(`[ESTRUCTURAR] Mapeo recibido (${mappingResult.mappings.length} asignaciones)`);

        // Step 4: Focused retry for low-confidence assignments
        attempt = 1;
        while (attempt < PHASE5_MAX_ATTEMPTS) {
            const lowConfidence = mappingResult.mappings.filter(m => m.confidence < CONFIDENCE_THRESHOLD);
            if (lowConfidence.length === 0) break;

            if (input.onProgress) {
                input.onProgress(`[ESTRUCTURAR] Intento ${attempt + 1}/${PHASE5_MAX_ATTEMPTS} — ${lowConfidence.length} asignaciones con baja confianza`);
            }

            // For each low-confidence element, do a focused retry
            for (const m of lowConfidence) {
                const pathId = inventory.paths[m.elementIndex]?.id;
                if (!pathId) continue;

                try {
                    const isolatedBase64 = await rasterizeIsolated(rawSvgWithIds, pathId, inventory.viewBox);
                    const focusedResult = await callVisionMapping(isolatedBase64, input.elements, input.nlu, inventory, input.onProgress);
                    const refined = focusedResult.mappings.find(x => x.elementIndex === m.elementIndex);
                    if (refined && refined.confidence > m.confidence) {
                        const idx = mappingResult!.mappings.findIndex(x => x.elementIndex === m.elementIndex);
                        if (idx !== -1) mappingResult!.mappings[idx] = refined;
                    }
                } catch (retryErr) {
                    console.warn(`[ESTRUCTURAR] Focused retry failed for element ${m.elementIndex}:`, retryErr);
                }
            }

            attempt++;
        }

        if (input.onProgress) input.onProgress('[ESTRUCTURAR] Convirtiendo mapeo a árbol semántico…');

        // Step 5: Convert ElementMapping[] → AssignmentNode tree
        const assignment = elementMappingsToAssignment(mappingResult, inventory, input.elements, input.nlu);

        if (!assignment.groups || Object.keys(assignment.groups).length === 0) {
            return { svg: '', success: false, error: 'No se pudo generar estructura semántica' };
        }

        // Step 6: Prepare CSS
        const viewBox = inventory.viewBox;
        const metadata = buildMetadataJSON(input);
        const pathInfoMap = new Map<string, PathInfo>(inventory.paths.map(p => [p.id, p]));

        const usedClasses = new Set<string>();
        function collectClasses(node: AssignmentNode) {
            if (node.class) node.class.split(/\s+/).forEach(c => usedClasses.add(c));
            const allIds = collectAllPathIds(node);
            usedClasses.add(fillRoleToColorClass(getDominantFillRole(allIds, pathInfoMap)));
            if (node.children) Object.values(node.children).forEach(collectClasses);
        }
        Object.values(assignment.groups).forEach(collectClasses);
        for (const cls of Object.values(inventory.groupClasses)) cls.split(/\s+/).forEach(c => c && usedClasses.add(c));
        for (const cls of Object.values(inventory.pathClasses)) cls.split(/\s+/).forEach(c => c && usedClasses.add(c));

        const fullCSS = generateStylesheet(input.config);
        let filteredCSS = buildFilteredCSS(fullCSS, usedClasses);

        if (inventory.rawStyleRules) {
            filteredCSS = filteredCSS
                ? `${filteredCSS}\n\n/* User-defined styles */\n${inventory.rawStyleRules}`
                : inventory.rawStyleRules;
        }

        const pathFillRules = inventory.paths
            .filter(p => {
                const pCls = inventory.pathClasses[p.id];
                if (pCls && pCls.split(/\s+/).some(c => inventory.cssFillMap[c])) return false;
                return p.fill && p.fill !== '#000000';
            })
            .map(p => `#${p.id} { fill: ${p.fill}; }`)
            .join('\n');
        if (pathFillRules) {
            filteredCSS = filteredCSS ? `${filteredCSS}\n\n/* Original path fills */\n${pathFillRules}` : pathFillRules;
        }

        // Step 7: Assemble SVG locally
        if (input.onProgress) input.onProgress('[ESTRUCTURAR] Ensamblando SVG final…');
        let svgContent = assembleSVGFromAssignment(
            rawSvgWithIds, assignment, input, metadata, filteredCSS, viewBox,
            inventory.groupClasses, inventory.pathClasses, pathInfoMap, inventory.cssFillMap,
            new Set(inventory.backgroundPathIds),
        );

        // Step 8: Post-process
        svgContent = removeEmptyGroupsFromFragment(svgContent);
        const validation = validateXML(svgContent);
        if (validation) {
            if (input.onProgress) input.onProgress(`[ESTRUCTURAR] XML issue: ${validation.slice(0, 120)}`);
        } else {
            svgContent = deriveChildIds(svgContent);
        }

        const groupCount = (svgContent.match(/<g /g) ?? []).length;
        if (input.onProgress) {
            input.onProgress(`[ESTRUCTURAR] Completado — ${(svgContent.length / 1024).toFixed(1)} KB, ${groupCount} grupos semánticos`);
        }

        return { svg: svgContent, success: true };

    } catch (error) {
        return {
            svg: '',
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido en ESTRUCTURAR',
        };
    }
}

// ─── Eligibility checks ──────────────────────────────────────────────────────

export function canVectorize(_row: object): { eligible: boolean; reason?: string } {
    // Phase 4 (VTracer) is eliminated in the Claude+Recraft pipeline.
    return { eligible: false, reason: 'VTracer eliminado — Recraft entrega SVG nativo' };
}

export function canStructureSVG(row: {
    rawSvg?: string;
    NLU?: NLUData | string;
    elements?: VisualElement[];
}): { eligible: boolean; reason?: string } {
    if (!row.rawSvg) return { eligible: false, reason: 'Se requiere SVG de Recraft (ejecutar PRODUCIR primero)' };
    if (!row.NLU || typeof row.NLU === 'string') return { eligible: false, reason: 'Se requiere análisis NLU' };
    if (!row.elements || row.elements.length === 0) return { eligible: false, reason: 'Se requieren elementos visuales' };
    return { eligible: true };
}

/** @deprecated Use canStructureSVG() instead */
export function canGenerateSVG(row: { rawSvg?: string; NLU?: NLUData | string; elements?: VisualElement[] }): { eligible: boolean; reason?: string } {
    return canStructureSVG(row);
}
