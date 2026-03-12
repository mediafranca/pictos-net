/**
 * SVG Structure Service v2 — JSON Assignment + Local Assembly
 *
 * Takes a raw SVG from vtracer and structures it according to
 * the mf-svg-schema specification, adding semantic roles and
 * accessibility metadata.
 *
 * Pipeline:
 *   rawSvg → buildPathInventory (local)
 *          → Gemini 2.5 Flash (emits ONLY a JSON assignment map)
 *          → assembleSVGFromAssignment (local — paths never leave the client)
 *          → post-process: deriveChildIds, filterCSS, validateXML
 *
 * Gemini's job is reduced to deciding which group each path belongs to.
 * Input ~280 tokens, output ~150 tokens → < 2 seconds on Flash.
 *
 * @module services/svgStructureService
 */

import type { NLUData, VisualElement, GlobalConfig } from "../types";
import { SVG_STYLESHEET } from "./svgStyles";
import { generateCssString } from "../lib/style-editor/lib/utils/cssGenerator";
import { generateContent } from "./aiClient";

// ─── Public helpers ──────────────────────────────────────────────────────────

/**
 * Returns the CSS stylesheet to embed in SVGs.
 * When the user has edited styles (config.svgStyleDefs), generates CSS from those
 * structured definitions so edits propagate to Gemini's system instruction.
 * Otherwise falls back to the canonical SVG_STYLESHEET.
 */
export const generateStylesheet = (config: GlobalConfig): string => {
    if (config.svgStyleDefs && config.svgStyleDefs.length > 0) {
        return generateCssString(config.svgStyleDefs, config.svgKeyframes ?? []);
    }
    return SVG_STYLESHEET;
};

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface SVGStructureInput {
    /** Raw SVG string from vtracer */
    rawSvg: string;
    /** NLU semantic analysis */
    nlu: NLUData;
    /** Hierarchical visual elements */
    elements: VisualElement[];
    /** Original utterance */
    utterance: string;
    /** Global configuration */
    config: GlobalConfig;
    /** Callback for progress logs (string messages) */
    onProgress?: (msg: string) => void;
    /** Callback for structural status updates (short codes/messages) */
    onStatus?: (status: string) => void;
}

export interface SVGStructureResult {
    /** Fully structured SVG string (mf-svg-schema compliant) */
    svg: string;
    /** Whether the structuring was successful */
    success: boolean;
    /** Error message if failed */
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
    standalonePathIds: string[];
    viewBox: string;
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

/** Extract fill from either fill="..." attribute or style="fill: ...;" */
function extractFill(el: Element): string {
    const fillAttr = el.getAttribute('fill');
    if (fillAttr && fillAttr !== 'none') return fillAttr.trim();
    const style = el.getAttribute('style') ?? '';
    const m = style.match(/fill:\s*([^;]+)/);
    return m?.[1]?.trim() ?? '#000000';
}

export function buildPathInventory(svg: string): PathInventory {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');

    const vbMatch = svg.match(/viewBox="([^"]+)"/);
    const viewBox = vbMatch?.[1] ?? '0 0 1024 1024';

    const paths: PathInfo[] = [];
    const vtracerGroups: Record<string, string[]> = {};
    const standalonePathIds: string[] = [];

    const svgEl = doc.querySelector('svg');
    if (!svgEl) return { paths, vtracerGroups, standalonePathIds, viewBox };

    // Walk direct children of the SVG
    for (const child of Array.from(svgEl.children)) {
        const tag = child.tagName.toLowerCase();
        const id = child.getAttribute('id') ?? '';

        // Skip non-visual elements
        if (['defs', 'style', 'title', 'desc', 'metadata'].includes(tag)) continue;

        if (tag === 'g') {
            const groupPaths: string[] = [];
            for (const p of Array.from(child.querySelectorAll('path'))) {
                const pid = p.getAttribute('id') ?? '';
                if (!pid) continue;
                const fill = extractFill(p);
                const d = p.getAttribute('d') ?? '';
                const transform = p.getAttribute('transform') ?? '';
                const [tx, ty] = getTranslateOffset(transform);
                const [cx, cy] = getCentroid(d, tx, ty);

                paths.push({ id: pid, fill, fillRole: getFillRole(fill), cx, cy, vtracerGroup: id });
                groupPaths.push(pid);
            }
            if (groupPaths.length > 0) {
                vtracerGroups[id] = groupPaths;
            }
        } else if (tag === 'path') {
            const pid = id;
            if (!pid) continue;
            const fill = extractFill(child);
            const d = child.getAttribute('d') ?? '';
            const transform = child.getAttribute('transform') ?? '';
            const [tx, ty] = getTranslateOffset(transform);
            const [cx, cy] = getCentroid(d, tx, ty);

            paths.push({ id: pid, fill, fillRole: getFillRole(fill), cx, cy, vtracerGroup: null });
            standalonePathIds.push(pid);
        }
    }

    return { paths, vtracerGroups, standalonePathIds, viewBox };
}

// ─── Gemini Prompt (v2: JSON assignment) ─────────────────────────────────────

function buildSystemInstruction_v2(lang: string): string {
    return `Eres un agente de estructuración semántica SVG. Tu ÚNICO output es un objeto JSON.

**TU TAREA:**
Se te entrega un inventario de paths SVG (cada uno con id, fill, centroide en el viewBox)
y la jerarquía de elementos visuales. Debes asignar cada path al grupo semántico
correspondiente, usando las señales de color y posición.

**OUTPUT — EXACTAMENTE ESTE ESQUEMA JSON:**

{
  "desc": "descripción visual breve en ${lang} (máx 2 oraciones)",
  "groups": {
    "<group-id>": {
      "concept": "Agent|Object|Action|Context|Attribute",
      "label": "aria-label en ${lang}",
      "class": "k|f",
      "paths": ["path-id-1", "path-id-2"],
      "children": {
        "<child-id>": {
          "concept": "...",
          "label": "...",
          "class": "...",
          "paths": ["path-id-3"],
          "evenodd": true
        }
      }
    }
  }
}

**REGLAS:**
1. TODOS los path-ids del inventario deben aparecer exactamente UNA VEZ en el JSON
2. "paths" en un nodo hoja son los paths asignados a ese grupo directamente
3. "paths" en un nodo padre que tiene "children" puede estar vacío []
4. "evenodd": true cuando haya paths light cuyo centroide está dentro del bbox del path dark del mismo grupo. El ensamblador los fusionará con fill-rule="evenodd".
5. "class": "k" para Agent, "f" para Object/Context/Action/Attribute
6. Preservar los group-ids de vtracer cuando coincidan con la jerarquía del NLU
7. Si un path no encaja en ningún grupo semántico, asígnalo a un grupo "contexto" con concept="Context"
8. NO incluir paths con id vacío o nulo
9. Emitir SOLO el JSON. Sin markdown, sin explicaciones, sin backticks.`;
}

function formatElements(els: VisualElement[], depth = 0): string {
    return els.map(el => {
        const indent = '  '.repeat(depth);
        const children = el.children ? '\n' + formatElements(el.children, depth + 1) : '';
        return `${indent}- ${el.id}${children}`;
    }).join('\n');
}

function formatInventory(inv: PathInventory): string {
    const lines = inv.paths.map(p =>
        `  ${p.id}: fill=${p.fill}(${p.fillRole}), pos=(${p.cx},${p.cy})` +
        (p.vtracerGroup ? ` [grupo:${p.vtracerGroup}]` : ' [suelto]')
    );

    const hasUserGroups = Object.keys(inv.vtracerGroups).length > 0;
    const groupLines = hasUserGroups
        ? [
            '',
            'GRUPOS ORGANIZADOS POR EL USUARIO EN EL EDITOR (respetar si coinciden con NLU):',
            ...Object.entries(inv.vtracerGroups).map(([gid, pids]) => {
                const fillRoles = pids.map(pid => {
                    const p = inv.paths.find(x => x.id === pid);
                    return `${pid}(${p?.fillRole ?? '?'})`;
                });
                return `  ${gid}: [${fillRoles.join(', ')}]`;
            }),
        ]
        : [
            '',
            '(paths sin agrupar — asignar según fill y posición)',
        ];

    const parts = [
        `INVENTARIO DE PATHS (${inv.paths.length} paths, viewBox ${inv.viewBox}):`,
        ...lines,
        ...groupLines,
    ];

    if (inv.standalonePathIds.length > 0 && hasUserGroups) {
        parts.push(`\nSTANDALONE (fuera de grupos): ${inv.standalonePathIds.join(', ')}`);
    }

    return parts.filter(Boolean).join('\n');
}

function buildUserMessage_v2(
    inventory: PathInventory,
    nlu: NLUData,
    elements: VisualElement[],
): string {
    const vg = nlu.visual_guidelines;
    const frames = (nlu.frames ?? [])
        .map(f => `${f.frame_label ?? f.frame_name} ("${f.lexical_unit}")`)
        .join(', ') || '(sin frames)';

    return `**CONTEXTO SEMÁNTICO (NLU):**
Utterance: "${nlu.utterance}"
Actor: ${vg?.focus_actor ?? '?'} | Acción: ${vg?.action_core ?? '?'} | Objeto: ${vg?.object_core ?? '?'}
Dominio: ${nlu.domain ?? 'general'} | Frames: ${frames}

**JERARQUÍA REQUERIDA (ids exactos para los <g>):**
${formatElements(elements)}

**${formatInventory(inventory)}**

Emite SOLO el JSON de asignación.`;
}

// ─── Gemini JSON parsing ─────────────────────────────────────────────────────

function cleanGeminiJSON(text: string): string {
    let clean = text.trim();
    // Strip markdown fences
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    // Find first { and last }
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1) return clean.slice(start, end + 1);
    return clean;
}

// ─── Assignment types ────────────────────────────────────────────────────────

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

// ─── Local SVG Assembly from Assignment ──────────────────────────────────────

interface OriginalPathData {
    d: string;
    transform: string;
    fill: string;
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

        // Collect other attributes we might want to preserve
        const skipAttrs = new Set(['id', 'd', 'transform', 'fill', 'style', 'class']);
        const otherParts: string[] = [];
        for (const attr of Array.from(p.attributes)) {
            if (!skipAttrs.has(attr.name)) {
                otherParts.push(`${attr.name}="${attr.value}"`);
            }
        }

        map.set(id, { d, transform, fill, otherAttrs: otherParts.join(' ') });
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
    indent = '  ',
): string {
    const cls = node.class ?? 'f';
    const label = escapeXmlAttr(node.label);
    const concept = escapeXmlAttr(node.concept);
    const openTag = `${indent}<g id="${groupId}" role="group" tabindex="0" data-concept="${concept}" aria-label="${label}" class="${cls}">`;

    const lines = [openTag];

    // Render own paths
    if (node.paths?.length) {
        if (node.evenodd && node.paths.length > 1) {
            // Combine into single evenodd path
            const darkPath = node.paths
                .map(id => originalPaths.get(id))
                .find(p => p && getFillRole(p.fill) === 'dark');
            const fill = darkPath?.fill ?? '#000000';

            const subpaths = node.paths.map(id => {
                const p = originalPaths.get(id);
                if (!p) return '';
                // Include transform offset in the path data for correct positioning
                if (p.transform) {
                    // For evenodd, transforms need to be baked — for now just concatenate d values
                    return p.d;
                }
                return p.d;
            }).filter(Boolean).join(' ');

            lines.push(`${indent}  <path d="${subpaths}" fill="${fill}" fill-rule="evenodd"/>`);
        } else {
            for (const pathId of node.paths) {
                const p = originalPaths.get(pathId);
                if (!p) { console.warn(`[assemble] path not found: ${pathId}`); continue; }
                const transformAttr = p.transform ? ` transform="${p.transform}"` : '';
                const otherAttrs = p.otherAttrs ? ` ${p.otherAttrs}` : '';
                lines.push(`${indent}  <path id="${pathId}" d="${p.d}"${transformAttr}${otherAttrs}/>`);
            }
        }
    }

    // Render children
    if (node.children) {
        for (const [childId, childNode] of Object.entries(node.children)) {
            lines.push(renderNode(childId, childNode, originalPaths, indent + '  '));
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
): string {
    const originalPaths = extractOriginalPaths(rawSvg);

    // Validate all path ids are covered
    const assignedIds = new Set<string>();
    function collectIds(node: AssignmentNode) {
        node.paths?.forEach(id => assignedIds.add(id));
        if (node.children) Object.values(node.children).forEach(collectIds);
    }
    Object.values(assignment.groups).forEach(collectIds);

    const allOriginalIds = Array.from(originalPaths.keys());
    const missing = allOriginalIds.filter(id => !assignedIds.has(id));
    if (missing.length > 0) {
        console.warn(`[assemble] paths sin asignar: ${missing.join(', ')}`);
        // Auto-assign to a fallback group
        assignment.groups['contexto'] = assignment.groups['contexto'] ?? {
            concept: 'Context',
            label: 'elementos de contexto',
            class: 'f',
            paths: [],
        };
        assignment.groups['contexto'].paths = [
            ...(assignment.groups['contexto'].paths ?? []),
            ...missing,
        ];
    }

    const bodyLines = Object.entries(assignment.groups).map(([gid, node]) =>
        renderNode(gid, node, originalPaths)
    );

    const body = bodyLines.join('\n');

    return assembleStructuredSVG(body, input, metadata, filteredCSS, viewBox);
}

// ─── Post-processing: CSS filtering (local) ─────────────────────────────────

function extractUsedClasses(svgContent: string): Set<string> {
    const used = new Set<string>();
    const re = /class="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(svgContent)) !== null) {
        m[1].split(/\s+/).forEach(cls => cls && used.add(cls));
    }
    return used;
}

function buildFilteredCSS(fullCSS: string, usedClasses: Set<string>): string {
    const keyframeRe = /@keyframes\s+([\w-]+)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;
    const keyframes = new Map<string, string>();
    let strippedCSS = fullCSS;
    let kfM: RegExpExecArray | null;
    while ((kfM = keyframeRe.exec(fullCSS)) !== null) {
        keyframes.set(kfM[1], kfM[0]);
        strippedCSS = strippedCSS.replace(kfM[0], '');
    }

    const ruleRe = /([^{]+)\{([^}]+)\}/g;
    const keptRules: string[] = [];
    const usedAnimations = new Set<string>();
    let rM: RegExpExecArray | null;
    while ((rM = ruleRe.exec(strippedCSS)) !== null) {
        const selector = rM[1].trim();
        const declarations = rM[2].trim();
        if (!declarations) continue;

        if (selector.includes('[role="group"]')) {
            keptRules.push(`${selector} {\n  ${declarations}\n}`);
            continue;
        }

        const classesInSelector = [...selector.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(c => c[1]);
        const isUsed = classesInSelector.some(cls => usedClasses.has(cls));
        if (!isUsed) continue;

        keptRules.push(`${selector} {\n  ${declarations}\n}`);
        const animMatch = declarations.match(/animation(?:-name)?\s*:\s*([\w-]+)/);
        if (animMatch) usedAnimations.add(animMatch[1]);
    }

    for (const [name, block] of keyframes) {
        if (usedAnimations.has(name)) keptRules.push(block);
    }

    return keptRules.join('\n\n');
}

// ─── Post-processing: Semantic IDs (local) ───────────────────────────────────

function deriveChildIds(svgContent: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');

    if (doc.querySelector('parsererror')) {
        console.warn('[deriveChildIds] SVG parse failed, skipping ID derivation');
        return svgContent;
    }

    const renames = new Map<string, string>();
    const vtracerHashRe = /^el-[0-9a-z]+$/i;

    doc.querySelectorAll('g[id]').forEach(group => {
        const gId = group.getAttribute('id')!;
        if (vtracerHashRe.test(gId)) return;

        let counter = 1;
        group.childNodes.forEach(child => {
            if (!(child instanceof Element)) return;
            if (child.tagName === 'g') return;

            const oldId = child.getAttribute('id');
            if (!oldId) {
                child.setAttribute('id', `${gId}-${counter++}`);
                return;
            }
            if (vtracerHashRe.test(oldId) || /^(path|rect|circle)\d+$/.test(oldId)) {
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

// ─── Validation ──────────────────────────────────────────────────────────────

function validateXML(svg: string): string | null {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const err = doc.querySelector('parsererror');
    if (err) return err.textContent || 'XML parse error';
    return null;
}

/**
 * Remove empty <g> elements from an SVG fragment.
 * Iterates until stable (handles nested empty groups).
 */
function removeEmptyGroupsFromFragment(fragment: string): string {
    let prev = '';
    let current = fragment;
    while (prev !== current) {
        prev = current;
        current = current.replace(/<g(\s[^>]*)?\s*>\s*<\/g>/g, '');
    }
    return current;
}

// ─── Metadata (built locally, never by Gemini) ──────────────────────────────

function buildMetadataJSON(input: SVGStructureInput): object {
    const nlu = input.nlu;
    const vg = nlu.visual_guidelines;
    const config = input.config;

    const naturalDesc = [
        vg?.focus_actor && `${vg.focus_actor}`,
        vg?.action_core && `realizando: ${vg.action_core}`,
        vg?.object_core && `con: ${vg.object_core}`,
        vg?.context && `contexto: ${vg.context}`,
    ].filter(Boolean).join(', ') || input.utterance;

    return {
        version: "1.0.0",
        schema: "mediafranca/mf-svg-schema",
        utterance: input.utterance,
        lang: nlu.lang || config.lang || 'es-419',
        domain: nlu.domain ?? 'general',
        region: config.geoContext?.region ?? null,
        nsm: { explications: nlu.nsm_explications ?? {} },
        frames: (nlu.frames ?? []).map(f => ({
            frame: f.frame_name,
            label: f.frame_label ?? f.frame_name,
            lexicalUnit: f.lexical_unit,
            roles: Object.fromEntries(
                Object.entries(f.roles ?? {}).map(([role, data]) => [
                    role, { type: data.type, surface: data.surface, ref: data.ref }
                ])
            ),
        })),
        pragmatics: {
            speechAct: nlu.metadata?.speech_act ?? 'assertive',
            intent: nlu.metadata?.intent ?? 'inform',
            politeness: nlu.pragmatics?.politeness ?? null,
            formality: nlu.pragmatics?.formality ?? null,
            expectedResponse: nlu.pragmatics?.expected_response ?? null,
        },
        visualGuidelines: {
            focusActor: vg?.focus_actor ?? null,
            actionCore: vg?.action_core ?? null,
            objectCore: vg?.object_core ?? null,
            context: vg?.context ?? null,
            temporal: vg?.temporal ?? null,
        },
        accessibility: {
            cognitiveDescription: input.utterance,
            visualDescription: naturalDesc,
            lang: nlu.lang || config.lang || 'es-419',
        },
        provenance: {
            generator: "PictoNet",
            generatedAt: new Date().toISOString(),
            sourceDataset: "MediaFranca-PictoNet",
            licence: config.license || "CC BY 4.0",
        },
    };
}

// ─── SVG Assembly (local post-process) ──────────────────────────────────────

/**
 * Assemble the complete mf-svg-schema SVG from a body (groups)
 * and locally-built metadata, CSS, title, etc.
 */
function assembleStructuredSVG(
    body: string,
    input: SVGStructureInput,
    metadata: object,
    filteredCSS: string,
    viewBox: string,
): string {
    const lang = input.nlu.lang || input.config.lang || 'es-419';
    const domain = input.nlu.domain ?? 'general';
    const utteranceEscaped = escapeXmlAttr(input.utterance);

    // Extract <desc> from body if present
    const descMatch = body.match(/<desc[^>]*>([\s\S]*?)<\/desc>/i);
    const descContent = descMatch ? descMatch[1].trim() : input.utterance;
    const bodyWithoutDesc = body.replace(/<desc[^>]*>[\s\S]*?<\/desc>/i, '').trim();

    const descEscaped = descContent
        .replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

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

// ─── Main structuring function (v2: JSON assignment) ─────────────────────────

export async function structureSVG(input: SVGStructureInput): Promise<SVGStructureResult> {
    try {
        if (input.onProgress) input.onProgress('[ESTRUCTURAR] Iniciando pre-procesamiento local...');

        // ── Step 1: Build path inventory (local) ────────────────────────
        const inventory = buildPathInventory(input.rawSvg);

        if (inventory.paths.length === 0) {
            return { svg: '', success: false, error: 'No se encontraron paths en el SVG' };
        }

        if (input.onProgress) {
            input.onProgress(
                `[ESTRUCTURAR] Inventario: ${inventory.paths.length} paths, ` +
                `${Object.keys(inventory.vtracerGroups).length} grupos existentes, ` +
                `${inventory.standalonePathIds.length} sueltos`
            );
        }

        // ── Step 2: Prepare prompts ─────────────────────────────────────
        const lang = input.nlu.lang || input.config.lang || 'es-419';
        const systemInstruction = buildSystemInstruction_v2(lang);
        const userMessage = buildUserMessage_v2(inventory, input.nlu, input.elements);

        // ── Step 3: Gemini call (JSON assignment only) ───────────────────
        if (input.onProgress) input.onProgress('[ESTRUCTURAR] Enviando inventario a Gemini Flash...');
        if (input.onStatus) input.onStatus('sending');

        const response = await generateContent({
            model: "gemini-2.5-flash",
            contents: {
                parts: [{ text: userMessage }],
            },
            config: {
                systemInstruction,
                temperature: 0.1,
                maxOutputTokens: 2048,
            },
        });

        if (input.onStatus) input.onStatus('receiving');

        const rawJSON = response.text;
        if (!rawJSON) {
            return { svg: '', success: false, error: 'Gemini no retornó respuesta' };
        }

        if (input.onProgress) {
            input.onProgress(`[ESTRUCTURAR] JSON recibido (${rawJSON.length} chars), ensamblando SVG...`);
        }
        if (input.onStatus) input.onStatus('sanitizing');

        // ── Step 4: Parse JSON assignment ────────────────────────────────
        let assignment: Assignment;
        try {
            const jsonText = cleanGeminiJSON(rawJSON);
            assignment = JSON.parse(jsonText);
        } catch (parseErr) {
            console.error('[ESTRUCTURAR] JSON parse failed:', rawJSON);
            return {
                svg: '',
                success: false,
                error: `JSON inválido de Gemini: ${parseErr instanceof Error ? parseErr.message : 'parse error'}`,
            };
        }

        if (!assignment.groups || Object.keys(assignment.groups).length === 0) {
            return { svg: '', success: false, error: 'Gemini retornó JSON sin grupos' };
        }

        // ── Step 5: Prepare metadata and CSS ─────────────────────────────
        const viewBox = inventory.viewBox;
        const metadata = buildMetadataJSON(input);

        // Build filtered CSS based on classes used in the assignment
        const usedClassesFromAssignment = new Set<string>();
        function collectClasses(node: AssignmentNode) {
            if (node.class) node.class.split(/\s+/).forEach(c => usedClassesFromAssignment.add(c));
            if (node.children) Object.values(node.children).forEach(collectClasses);
        }
        Object.values(assignment.groups).forEach(collectClasses);

        const fullCSS = generateStylesheet(input.config);
        const filteredCSS = buildFilteredCSS(fullCSS, usedClassesFromAssignment);

        // ── Step 6: Assemble SVG locally ─────────────────────────────────
        let svgContent = assembleSVGFromAssignment(
            input.rawSvg,
            assignment,
            input,
            metadata,
            filteredCSS,
            viewBox,
        );

        // ── Step 7: Post-process ─────────────────────────────────────────

        // Remove empty groups
        svgContent = removeEmptyGroupsFromFragment(svgContent);

        // Validate XML
        const validation = validateXML(svgContent);
        if (validation) {
            if (input.onProgress) {
                input.onProgress(`[ESTRUCTURAR] XML issue: ${validation.slice(0, 120)}`);
            }
        } else {
            // Derive semantic child IDs (only if XML is valid)
            svgContent = deriveChildIds(svgContent);
        }

        if (input.onProgress) {
            const groupCount = (svgContent.match(/<g /g) ?? []).length;
            input.onProgress(
                `[ESTRUCTURAR] Completado — ${(svgContent.length / 1024).toFixed(1)} KB, ` +
                `${groupCount} grupos semánticos`
            );
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

// ─── Eligibility checks ─────────────────────────────────────────────────────

export function canVectorize(row: {
    bitmap?: string;
}): { eligible: boolean; reason?: string } {
    if (!row.bitmap) {
        return { eligible: false, reason: 'No bitmap available' };
    }
    return { eligible: true };
}

export function canStructureSVG(row: {
    rawSvg?: string;
    NLU?: NLUData | string;
    elements?: VisualElement[];
}): { eligible: boolean; reason?: string } {
    if (!row.rawSvg) {
        return { eligible: false, reason: 'No raw SVG available (run VTracer first)' };
    }
    if (!row.NLU || typeof row.NLU === 'string') {
        return { eligible: false, reason: 'NLU analysis required' };
    }
    if (!row.elements || row.elements.length === 0) {
        return { eligible: false, reason: 'Visual elements required' };
    }
    return { eligible: true };
}

/** @deprecated Use canVectorize() or canStructureSVG() instead */
export function canGenerateSVG(row: {
    bitmap?: string;
    NLU?: NLUData | string;
    elements?: VisualElement[];
}): { eligible: boolean; reason?: string } {
    return canStructureSVG(row);
}
