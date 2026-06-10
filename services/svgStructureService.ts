/**
 * SVG Structure Service v4 — Single-Call Vision + Local Assembly
 *
 * Phase 5 (ESTRUCTURAR): Takes a raw SVG from Recraft and restructures it
 * into a clean, semantically grouped, CSS-styled SVG conforming to mf-svg-schema.
 *
 * Pipeline:
 *   rawSvg → ensurePathIds (local)
 *          → buildPathInventory (local)
 *          → rasterizeWithMarks (local, canvas → base64 JPEG)
 *          → callStructuringModel (single API call — Claude or Gemini)
 *              inputs: marked image + raw SVG source + VisualDOM + CSS palette
 *              tool: restructure_svg → StructuringMapping
 *          → Phase5_GeometryValidation (local — validate MergedPath.d)
 *          → if recording.enabled: return mapping for Phase5_Review
 *          → assembleFromMapping (local — geometry never leaves browser)
 *          → post-process: deriveChildIds, filterCSS, validateXML
 *
 * NLU context is NOT sent to the model — structuring is a purely visual task.
 *
 * @module services/svgStructureService
 */

import type { NLUData, VisualElement, GlobalConfig, StructuringMapping, StructuringGroup, MergedPath } from '../types';
import { SVG_STYLESHEET } from './svgStyles';
import { generateCssString } from '../lib/style-editor/lib/utils/cssGenerator';
import { callStructuringModel, extractToolUse } from './aiClient';
import type { ClaudeResponse } from './aiClient';

const MARK_RENDER_SIZE = 800;

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
    phase5Model?: string;
    onProgress?: (msg: string) => void;
    onStatus?: (status: string) => void;
}

export interface SVGStructureResult {
    svg: string;
    success: boolean;
    error?: string;
    mapping?: StructuringMapping; // populated in recording mode (pending review)
    pendingReview?: boolean;
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
        console.info(`[inventory] Excluidos ${backgroundPathIds.length} path(s) de fondo: ${backgroundPathIds.join(', ')}`);
    }

    return { paths, vtracerGroups, groupClasses, pathClasses, standalonePathIds, backgroundPathIds, viewBox, rawStyleRules, cssFillMap };
}

// ─── Set-of-Marks Rasterization (browser canvas) ─────────────────────────────

async function rasterizeWithMarks(svgString: string, inventory: PathInventory): Promise<{ base64: string; widthPx: number; heightPx: number; sizeKB: number }> {
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

            inventory.paths.forEach((path, index) => {
                const cx = Math.round(path.cx * scale);
                const cy = Math.round(path.cy * scale);
                const radius = 13;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(220, 38, 38, 0.90)';
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.fillStyle = 'white';
                ctx.font = `bold ${radius}px Arial, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(index), cx, cy);
            });

            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            const base64 = dataUrl.split(',')[1];
            const sizeKB = Math.round(base64.length * 3 / 4 / 1024);
            resolve({ base64, widthPx: w, heightPx: h, sizeKB });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to rasterize SVG for set-of-marks'));
        };
        img.src = url;
    });
}

// ─── Node list from VisualElement tree ──────────────────────────────────────

interface NodeInfo {
    id: string;
    label: string;
    concept: string;
    parentId: string | null;
}

function guessConceptFromId(id: string): string {
    const lower = id.toLowerCase();
    if (lower === 'pictograma' || lower === 'pictogram') return 'Root';
    if (lower.startsWith('actor') || lower.startsWith('persona') || lower.startsWith('sujeto') || lower.startsWith('agent')) return 'Agent';
    if (lower.startsWith('accion') || lower.startsWith('action') || lower.startsWith('verbo')) return 'Action';
    if (lower.startsWith('objeto') || lower.startsWith('object') || lower.startsWith('cosa')) return 'Object';
    if (lower.startsWith('contexto') || lower.startsWith('context') || lower.startsWith('escenario') || lower.startsWith('fondo')) return 'Context';
    return 'Element';
}

function flattenElements(elements: VisualElement[], parentId: string | null = null): NodeInfo[] {
    const result: NodeInfo[] = [];
    for (const el of elements) {
        const label = el.id.replace(/_/g, ' ');
        const concept = guessConceptFromId(el.id);
        result.push({ id: el.id, label, concept, parentId });
        if (el.children) {
            result.push(...flattenElements(el.children, el.id));
        }
    }
    return result;
}

// ─── CSS Palette extraction ──────────────────────────────────────────────────

function extractPaletteClasses(cssString: string): string {
    const lines: string[] = [];
    const ruleRe = /\.([a-zA-Z][\w-]*)\s*\{([^}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = ruleRe.exec(cssString)) !== null) {
        const cls = m[1];
        const decls = m[2].trim().replace(/\s+/g, ' ').slice(0, 120);
        lines.push(`.${cls} { ${decls} }`);
        if (lines.length >= 30) break;
    }
    return lines.length > 0
        ? lines.join('\n')
        : '(sin paleta definida — usa "k" para agentes/actores, "f" para objetos/acciones)';
}

// ─── Tool Schema ─────────────────────────────────────────────────────────────

function buildRestructureToolSchema(nodeList: NodeInfo[]) {
    const nodeIds = nodeList.map(n => n.id);
    return {
        name: 'restructure_svg',
        description: 'Restructure the SVG by assigning paths to semantic nodes, discarding tracing noise, and optionally proposing simple path merges.',
        input_schema: {
            type: 'object' as const,
            properties: {
                description: {
                    type: 'string',
                    description: 'Brief visual description of the pictogram (1–2 sentences).',
                },
                groups: {
                    type: 'array',
                    description: 'One entry per VisualDOM node. Flat list — use parentId for hierarchy.',
                    items: {
                        type: 'object',
                        properties: {
                            nodeId: { type: 'string', enum: nodeIds, description: 'VisualDOM node id.' },
                            label: { type: 'string', description: 'Human-readable label for this node.' },
                            cssClass: { type: 'string', description: 'CSS class from the palette (e.g. "k", "f", "accent").' },
                            parentId: { type: 'string', description: 'Parent nodeId for nesting; omit or null for top-level.', nullable: true },
                            keep: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Path IDs (by mark number or id) to include verbatim from the SVG.',
                            },
                            merge: {
                                description: 'Optional: propose a union merge of overlapping paths. Combine their d attributes with a space separator.',
                                oneOf: [
                                    { type: 'null' },
                                    {
                                        type: 'object',
                                        properties: {
                                            d: { type: 'string', description: 'Combined SVG path data.' },
                                            sources: { type: 'array', items: { type: 'string' }, description: 'Source path ids merged.' },
                                        },
                                        required: ['d', 'sources'],
                                    },
                                ],
                            },
                        },
                        required: ['nodeId', 'label', 'cssClass', 'keep'],
                    },
                },
                discard: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Path IDs to exclude. Only use for: (a) micro-blobs with no visible area, (b) geometrically identical duplicates, (c) background fill rects. When uncertain, assign to a group instead.',
                },
            },
            required: ['description', 'groups', 'discard'],
        },
    };
}

// ─── System Prompt ───────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
    return `Eres un agente de restructuración semántica de SVG para pictogramas AAC (Comunicación Aumentativa y Alternativa).

Recibes:
1. Una imagen del SVG con un círculo numerado en rojo sobre el centroide de cada path
2. El código fuente SVG en bruto (paths con sus IDs)
3. El DOM semántico objetivo — nodos con id, concepto y etiqueta
4. La paleta CSS de la librería — clases disponibles para estilizar

Tu tarea:
- Identifica qué paths numerados corresponden visualmente a cada nodo semántico
- Descarta SOLO estos casos:
  · Micro-blobs: paths con área visualmente insignificante (punto sin significado funcional)
  · Duplicados exactos: paths con geometría d= idéntica a otro path ya asignado
  · Fondos: rectángulos de relleno que cubren todo el viewBox (ya pre-excluidos en su mayoría)
- En caso de duda, CONSERVA el path. Eliminar un elemento visualmente presente es un error grave; incluir un artefacto menor es tolerable.
- Asigna clases CSS de la paleta (nunca uses colores inline)
- Opcionalmente propón una fusión de paths: si múltiples paths claramente forman la misma región visual, puedes combinar sus atributos d con un separador de espacio (unión SVG de sub-paths). Sé conservador con las fusiones.

Reglas:
1. Trabaja desde la evidencia visual de la imagen — no asumas contenido semántico a partir de los nombres de nodos
2. Cada path que no sea fondo debe aparecer en exactamente un keep de grupo, o en discard
3. Usa solo los valores de cssClass listados en la paleta
4. "k" = agente/actor (personaje principal), "f" = objeto o acción, "accent" = acento de color
5. parentId debe ser null para nodos de nivel superior, o un nodeId válido para nodos hijo`;
}

// ─── User Prompt ─────────────────────────────────────────────────────────────

function buildUserText(rawSvg: string, nodeList: NodeInfo[], cssStyles: string, inventory: PathInventory): string {
    const domSection = nodeList
        .map(n => `- ${n.id} [${n.concept}] "${n.label}"${n.parentId ? ` (hijo de ${n.parentId})` : ''}`)
        .join('\n');

    const paletteSection = extractPaletteClasses(cssStyles);

    const marksSection = inventory.paths
        .map((p, i) => `  mark ${i}: id="${p.id}" fill-role="${p.fillRole}" centroide=(${p.cx},${p.cy})`)
        .join('\n');

    const svgSource = rawSvg.length > 10000
        ? rawSvg.slice(0, 10000) + '\n<!-- … SVG truncado —>'
        : rawSvg;

    return `Analiza esta imagen SVG numerada y restructúrala semánticamente.

DOM semántico objetivo:
${domSection}

Paleta CSS disponible:
${paletteSection}

Marcas en la imagen (mark# → path-id → fill-role → centroide):
${marksSection}

SVG fuente:
${svgSource}`;
}

// ─── Single Vision Call ───────────────────────────────────────────────────────

async function callVisionStructuring(
    image: { base64: string; widthPx: number; heightPx: number; sizeKB: number },
    rawSvg: string,
    elements: VisualElement[],
    cssStyles: string,
    inventory: PathInventory,
    model: string,
    onProgress?: (msg: string) => void,
): Promise<StructuringMapping> {
    const nodeList = flattenElements(elements);
    const tool = buildRestructureToolSchema(nodeList);
    const systemPrompt = buildSystemPrompt();
    const userText = buildUserText(rawSvg, nodeList, cssStyles, inventory);

    // ── Console: Phase5_Console event 1 — full prompt
    if (onProgress) {
        onProgress(`[ESTRUCTURAR] Prompt del sistema:\n${systemPrompt}`);
        onProgress(`[ESTRUCTURAR] Prompt de usuario (${userText.length} chars):\n${userText.slice(0, 800)}${userText.length > 800 ? '…' : ''}`);
    }

    // ── Console: Phase5_Console event 2 — image attached
    if (onProgress) {
        onProgress(`[ESTRUCTURAR] imagen adjunta: ${image.widthPx}×${image.heightPx}px JPEG, ${image.sizeKB} KB`);
    }

    // ── Console: Phase5_Console event 3 — calling model
    if (onProgress) {
        onProgress(`[ESTRUCTURAR] llamando ${model}…`);
    }

    const startMs = Date.now();

    const response: ClaudeResponse = await callStructuringModel({
        model,
        max_tokens: 8192,
        system: systemPrompt,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'restructure_svg' },
        messages: [{
            role: 'user',
            content: [
                {
                    type: 'image',
                    source: { type: 'base64', media_type: 'image/jpeg', data: image.base64 },
                },
                { type: 'text', text: userText },
            ],
        }],
    });

    const elapsedMs = Date.now() - startMs;

    // ── Console: Phase5_Console events 4 & 5 — timing + tokens
    if (onProgress) {
        onProgress(`[ESTRUCTURAR] respuesta recibida en ${(elapsedMs / 1000).toFixed(1)}s`);
        if (response.usage) {
            onProgress(`[ESTRUCTURAR] tokens: entrada=${response.usage.input_tokens}, salida=${response.usage.output_tokens}`);
        }
    }

    const mapping = extractToolUse(response, 'restructure_svg') as StructuringMapping;

    // ── Console: Phase5_Console event 6 — group assignments
    if (onProgress) {
        onProgress(`[ESTRUCTURAR] grupos: ${mapping.groups?.length ?? 0}, descartados: ${mapping.discard?.length ?? 0}`);
        for (const g of (mapping.groups ?? [])) {
            const mergeHint = g.merge ? ` [MERGE de ${g.merge.sources?.join(',')}]` : '';
            onProgress(`  ${g.nodeId} (${g.cssClass}): keep=[${g.keep?.join(', ')}]${mergeHint}`);
        }
    }

    // ── Console: Phase5_Console event 7 — discards
    if (onProgress && mapping.discard?.length > 0) {
        onProgress(`[ESTRUCTURAR] descartados: ${mapping.discard.join(', ')}`);
    }

    // Normalize: ensure required fields exist with defaults
    return {
        description: mapping.description ?? '',
        groups: (mapping.groups ?? []).map(g => ({
            ...g,
            keep: g.keep ?? [],
            selected: true,
            merge: g.merge ?? null,
            parentId: g.parentId ?? null,
        })),
        discard: mapping.discard ?? [],
    };
}

// ─── Geometry Validation (Phase5_GeometryValidation) ─────────────────────────

function validateMergedPath(d: string): boolean {
    try {
        const hasValidStart = /^\s*[MmZzLlHhVvCcSsQqTtAa]/.test(d);
        if (!hasValidStart) return false;
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d.replace(/"/g, '&quot;')}"/></svg>`, 'image/svg+xml');
        return !doc.querySelector('parsererror');
    } catch {
        return false;
    }
}

function applyGeometryValidation(
    mapping: StructuringMapping,
    onProgress?: (msg: string) => void,
): StructuringMapping {
    const groups = mapping.groups.map(g => {
        if (!g.merge) return g;
        const { d, sources } = g.merge;
        const valid = validateMergedPath(d);
        // ── Console: Phase5_Console event 8
        if (onProgress) {
            onProgress(`[ESTRUCTURAR] merge ${g.nodeId}: ${sources.join('+')} → "${d.slice(0, 80)}${d.length > 80 ? '…' : ''}" [${valid ? 'OK' : 'INVÁLIDO'}]`);
        }
        if (!valid) {
            // ── Console: Phase5_Console event 9 — Fallback B
            onProgress?.(`[ESTRUCTURAR] fallback B — ${g.nodeId}: merge inválido, usando paths originales (${sources.join(', ')})`);
            return { ...g, keep: [...(g.keep ?? []), ...sources], merge: null };
        }
        return g;
    });
    return { ...mapping, groups };
}

// ─── Assembly ─────────────────────────────────────────────────────────────────

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

function renderGroup(
    group: StructuringGroup,
    childGroups: StructuringGroup[],
    originalPaths: Map<string, OriginalPathData>,
    pathInfoMap: Map<string, PathInfo>,
    indent = '  ',
): string {
    const dominantRole = getDominantFillRole(group.keep, pathInfoMap);
    const colorCls = fillRoleToColorClass(dominantRole);
    const semanticCls = group.cssClass || 'f';
    const userHasColorClass = ['k', 'f', 'w', 'main', 'accent'].includes(semanticCls);
    const clsParts = [semanticCls];
    if (!userHasColorClass) clsParts.push(colorCls);
    const cls = clsParts.join(' ');
    const label = escapeXmlAttr(group.label || group.nodeId);
    const concept = escapeXmlAttr(guessConceptFromId(group.nodeId));
    const lines: string[] = [];
    lines.push(`${indent}<g id="${group.nodeId}" role="group" tabindex="0" data-concept="${concept}" aria-label="${label}" class="${cls}">`);

    // Merged path (validated before reaching here)
    if (group.merge) {
        lines.push(`${indent}  <path d="${escapeXmlAttr(group.merge.d)}" />`);
    } else {
        for (const pathId of (group.keep ?? [])) {
            const p = originalPaths.get(pathId);
            if (!p) { console.warn(`[assemble] path no encontrado: ${pathId}`); continue; }
            const transformAttr = p.transform ? ` transform="${p.transform}"` : '';
            const classAttr = p.className ? ` class="${p.className}"` : '';
            const otherAttrs = p.otherAttrs ? ` ${p.otherAttrs}` : '';
            lines.push(`${indent}  <path id="${pathId}" d="${p.d}"${classAttr}${transformAttr}${otherAttrs}/>`);
        }
    }

    // Nested children
    for (const child of childGroups) {
        const grandChildren = [];
        lines.push(renderGroup(child, grandChildren, originalPaths, pathInfoMap, indent + '  '));
    }

    lines.push(`${indent}</g>`);
    return lines.join('\n');
}

export function assembleFromMapping(
    mapping: StructuringMapping,
    input: SVGStructureInput,
    selectionOverrides?: Map<string, boolean>,
    labelOverrides?: Map<string, string>,
): SVGStructureResult {
    try {
        const rawSvgWithIds = ensurePathIds(input.rawSvg);
        const inventory = buildPathInventory(rawSvgWithIds);
        const originalPaths = extractOriginalPaths(rawSvgWithIds);
        const pathInfoMap = new Map<string, PathInfo>(inventory.paths.map(p => [p.id, p]));

        // Apply selection and label overrides (from Phase5_Review)
        const effectiveGroups = mapping.groups.map(g => ({
            ...g,
            selected: selectionOverrides?.has(g.nodeId) ? selectionOverrides.get(g.nodeId)! : g.selected,
            label: labelOverrides?.get(g.nodeId) ?? g.label,
        })).filter(g => g.selected !== false);

        // Build parent → children map
        const childMap = new Map<string | null, StructuringGroup[]>();
        for (const g of effectiveGroups) {
            const parentId = g.parentId ?? null;
            if (!childMap.has(parentId)) childMap.set(parentId, []);
            childMap.get(parentId)!.push(g);
        }

        // Track all assigned path ids
        const assignedIds = new Set<string>();
        for (const g of effectiveGroups) {
            (g.keep ?? []).forEach(id => assignedIds.add(id));
            g.merge?.sources?.forEach(id => assignedIds.add(id));
        }
        for (const id of (mapping.discard ?? [])) assignedIds.add(id);

        // Unaccounted paths → fallback contexto group
        const allOriginalIds = Array.from(originalPaths.keys()).filter(id => !inventory.backgroundPathIds.includes(id));
        const orphans = allOriginalIds.filter(id => !assignedIds.has(id));
        if (orphans.length > 0) {
            console.warn(`[assemble] paths sin asignar (→ contexto): ${orphans.join(', ')}`);
            const existing = effectiveGroups.find(g => g.nodeId === 'contexto');
            if (existing) {
                existing.keep = [...(existing.keep ?? []), ...orphans];
            } else {
                effectiveGroups.push({ nodeId: 'contexto', label: 'elementos de contexto', cssClass: 'f', parentId: null, keep: orphans, selected: true });
                if (!childMap.has(null)) childMap.set(null, []);
                childMap.get(null)!.push(effectiveGroups[effectiveGroups.length - 1]);
            }
        }

        // Render top-level groups (parentId = null)
        const topLevel = childMap.get(null) ?? [];
        const body = topLevel
            .map(g => renderGroup(g, childMap.get(g.nodeId) ?? [], originalPaths, pathInfoMap))
            .join('\n');

        // CSS
        const fullCSS = generateStylesheet(input.config);
        const usedClasses = new Set<string>();
        effectiveGroups.forEach(g => g.cssClass?.split(/\s+/).forEach(c => usedClasses.add(c)));
        for (const cls of Object.values(inventory.pathClasses)) cls.split(/\s+/).filter(Boolean).forEach(c => usedClasses.add(c));

        let filteredCSS = buildFilteredCSS(fullCSS, usedClasses);

        // Preserve original fill rules from raw SVG
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
        if (inventory.rawStyleRules) {
            filteredCSS = filteredCSS ? `${filteredCSS}\n\n/* User-defined styles */\n${inventory.rawStyleRules}` : inventory.rawStyleRules;
        }

        const metadata = buildMetadataJSON(input);
        let svgContent = assembleStructuredSVG(body, input, metadata, filteredCSS, inventory.viewBox);
        svgContent = removeEmptyGroupsFromFragment(svgContent);

        const validation = validateXML(svgContent);
        if (validation) {
            input.onProgress?.(`[ESTRUCTURAR] advertencia XML: ${validation.slice(0, 120)}`);
        } else {
            svgContent = deriveChildIds(svgContent);
        }

        const groupCount = (svgContent.match(/<g /g) ?? []).length;
        input.onProgress?.(`[ESTRUCTURAR] completado — ${(svgContent.length / 1024).toFixed(1)} KB, ${groupCount} grupos semánticos`);

        return { svg: svgContent, success: true };
    } catch (error) {
        return {
            svg: '',
            success: false,
            error: error instanceof Error ? error.message : 'Error desconocido en ensamblado',
        };
    }
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
        version: '1.0.0',
        schema: 'mediafranca/mf-svg-schema',
        pipeline: 'claude+recraft',
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
        provenance: { generator: 'PictoNet', generatedAt: new Date().toISOString(), sourceDataset: 'MediaFranca-PictoNet', licence: config.license || 'CC BY 4.0' },
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

// ─── Main structuring function ────────────────────────────────────────────────

export async function structureSVG(input: SVGStructureInput): Promise<SVGStructureResult> {
    try {
        if (!input.rawSvg || typeof input.rawSvg !== 'string') {
            return { svg: '', success: false, error: 'rawSvg no es un string válido' };
        }

        const model = input.phase5Model ?? 'claude-sonnet-4-6';

        input.onProgress?.('[ESTRUCTURAR] Pre-procesando SVG local…');
        const rawSvgWithIds = ensurePathIds(input.rawSvg);
        const inventory = buildPathInventory(rawSvgWithIds);

        if (inventory.paths.length === 0) {
            return { svg: '', success: false, error: 'No se encontraron paths en el SVG' };
        }

        input.onProgress?.(`[ESTRUCTURAR] Inventario: ${inventory.paths.length} paths, ${Object.keys(inventory.vtracerGroups).length} grupos, ${inventory.backgroundPathIds.length} fondo excluido`);

        input.onProgress?.('[ESTRUCTURAR] Renderizando marcas numeradas…');
        const image = await rasterizeWithMarks(rawSvgWithIds, inventory);

        const cssStyles = generateStylesheet(input.config);

        let mapping = await callVisionStructuring(
            image,
            rawSvgWithIds,
            input.elements,
            cssStyles,
            inventory,
            model,
            input.onProgress,
        );

        // Phase5_GeometryValidation
        mapping = applyGeometryValidation(mapping, input.onProgress);

        // Recording mode → return mapping for review timer
        if (input.config.recording?.enabled) {
            input.onProgress?.('[ESTRUCTURAR] Modo grabación activo — esperando revisión del usuario');
            return { svg: '', success: true, mapping, pendingReview: true };
        }

        // Immediate assembly
        return assembleFromMapping(mapping, input);

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
