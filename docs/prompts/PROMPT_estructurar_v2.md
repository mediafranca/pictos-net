# PROMPT: ESTRUCTURAR v2 — Asignación JSON + Ensamblaje local

**Fecha:** 2026-03-12
**Objetivo:** Reemplazar el prompt actual de ESTRUCTURAR que pide a Gemini
reproducir todos los paths, por uno que pide sólo un mapa de asignación JSON.
El SVG final se ensambla 100% localmente.

---

## Por qué cambia todo

El problema del prompt v1:

```
Input:  ~5.000 tokens (paths completos)
Output: ~4.700 tokens (los mismos paths reordenados)
Modelo: gemini-3-pro-preview → ~40 seg
```

El trabajo real de Gemini es solo *decidir* a qué grupo va cada path.
No necesita copiar ni un carácter de ningún `d=""`.

Con el nuevo approach:

```
Input:  ~280 tokens (inventario compacto)
Output: ~150 tokens (JSON de asignación)
Modelo: gemini-2.5-flash → < 2 seg
```

---

## Realidad del raw SVG de vtracer

vtracer emite **solo paths planos con IDs hash** (`el-f5n2olz2w`, `el-1aw8hfwg8`, etc.).
No genera ningún agrupamiento semántico. Los grupos con nombres significativos
(`bus`, `hospital`, `centro`, `signo-de-interrogacion`) son trabajo **manual del usuario**
en el editor, no output de vtracer.

El SVG analizado en esta sesión tenía grupos semánticos porque el usuario ya los había
nombrado — eso es un input valioso y opcional, no una garantía estructural del pipeline.

El caso base real es:
```xml
<svg viewBox="0 0 1024 1024">
  <path id="el-f5n2olz2w" d="M..." style="fill: #030303;" transform="translate(528,706)"/>
  <path id="el-1aw8hfwg8" d="M..." style="fill: #FDFDFD;" transform="translate(450,745)"/>
  <path id="el-ybnzlcwcr" d="M..." style="fill: #FDFDFD;" transform="translate(476,721)"/>
  <!-- ... más paths sueltos ... -->
</svg>
```

Las únicas señales disponibles para Gemini son **fill** y **posición** (centroide).
Cuando el usuario ya organizó grupos en el editor, esos grupos se entregan como
contexto adicional — pero nunca como algo en lo que se pueda confiar por defecto.

---

## Insight sobre ventanas/ruedas (booleano SVG)

Dentro del grupo `bus`:
- `el-f5n2olz2w`: fill=#030303 → carrocería (oscuro)
- `el-1aw8hfwg8`: fill=#FDFDFD → ventana (blanco sobre oscuro = agujero visual)
- `el-ybnzlcwcr`: fill=#FDFDFD → ventana
- `el-6pm2dz1vi`: fill=#F9F9F9 → rueda
- `el-uaci1mmzz`: fill=#F9F9F9 → rueda

La técnica SVG para subfiguras blancas sobre fondo oscuro es combinarlas
en un `<path>` único con `fill-rule="evenodd"`:
```
d="[carrocería M...Z] [ventana1 M...Z] [ventana2 M...Z]"
fill="#030303" fill-rule="evenodd"
```
Esto hace que los paths internos sean agujeros reales, no parches blancos.

**Detección local:** si en un grupo hay paths oscuros (luminancia < 0.15)
y paths claros (luminancia > 0.85), y el centroide de los claros está
dentro del bounding box de los oscuros → candidatos a booleano evenodd.

---

## Nueva arquitectura del pipeline local

```
rawSvg
  ↓
[1] buildPathInventory()   → extrae id, fill, centroide, transform para cada path
                           → detecta grupos vtracer existentes
                           → clasifica fills: dark / light / accent
  ↓
[2] buildSystemInstruction_v2()  → instrucción compacta para Gemini
[3] buildUserMessage_v2()        → inventario + NLU + grupos existentes
  ↓
[4] Gemini 2.5 Flash             → emite SOLO JSON de asignación
  ↓
[5] parseAssignment()            → valida JSON, asegura que todos los paths estén asignados
  ↓
[6] assembleSVGFromAssignment()  → construye el SVG final con paths originales
    ↓ (opcional)
[6b] applyEvenOddBoolean()       → fusiona subfiguras claras sobre oscuras
  ↓
[7] post-process existente       → deriveChildIds, filterCSS, validateXML
```

---

## Código: `buildPathInventory(svg: string): PathInventory`

```typescript
interface PathInfo {
  id: string;
  fill: string;
  fillRole: 'dark' | 'light' | 'accent' | 'unknown';
  cx: number;  // centroide con transform aplicado
  cy: number;
  vtracerGroup: string | null;  // id del <g> padre si existe
}

interface PathInventory {
  paths: PathInfo[];
  vtracerGroups: Record<string, string[]>;  // groupId → [pathIds]
  standalonePathIds: string[];
  viewBox: string;
}

function getFillRole(fill: string): 'dark' | 'light' | 'accent' | 'unknown' {
  if (!fill || fill === 'none') return 'unknown';
  // Parse hex
  const hex = fill.replace('#', '');
  if (hex.length !== 6 && hex.length !== 3) return 'unknown';
  const r = parseInt(hex.slice(0,2), 16);
  const g = parseInt(hex.slice(2,4), 16);
  const b = parseInt(hex.slice(4,6), 16);
  const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
  
  // Detect accent (saturated color)
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  
  if (saturation > 0.4 && luminance > 0.1) return 'accent';
  if (luminance < 0.2) return 'dark';
  if (luminance > 0.8) return 'light';
  return 'unknown';
}

function getTranslateOffset(transform: string): [number, number] {
  const m = transform?.match(/translate\(([^,]+),([^)]+)\)/);
  return m ? [Math.round(parseFloat(m[1])), Math.round(parseFloat(m[2]))] : [0, 0];
}

function getCentroid(d: string, tx: number, ty: number): [number, number] {
  const nums = d.match(/-?[0-9]+\.?[0-9]*/g)?.map(Number) ?? [];
  if (nums.length < 2) return [tx, ty];
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  return [
    Math.round(xs.reduce((a,b) => a+b, 0) / xs.length + tx),
    Math.round(ys.reduce((a,b) => a+b, 0) / ys.length + ty),
  ];
}

export function buildPathInventory(svg: string): PathInventory {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  
  const vbMatch = svg.match(/viewBox="([^"]+)"/);
  const viewBox = vbMatch?.[1] ?? '0 0 1024 1024';
  
  const paths: PathInfo[] = [];
  const vtracerGroups: Record<string, string[]> = {};
  const standalonePathIds: string[] = [];
  
  const svgEl = doc.querySelector('svg')!;
  
  // Walk direct children
  for (const child of Array.from(svgEl.children)) {
    const tag = child.tagName.toLowerCase();
    const id = child.getAttribute('id') ?? '';
    
    if (tag === 'g') {
      const groupPaths: string[] = [];
      for (const p of Array.from(child.querySelectorAll('path'))) {
        const pid = p.getAttribute('id') ?? '';
        const style = p.getAttribute('style') ?? '';
        const fillMatch = style.match(/fill:\s*([^;]+)/);
        const fill = fillMatch?.[1]?.trim() ?? '#000000';
        const d = p.getAttribute('d') ?? '';
        const transform = p.getAttribute('transform') ?? '';
        const [tx, ty] = getTranslateOffset(transform);
        const [cx, cy] = getCentroid(d, tx, ty);
        
        paths.push({ id: pid, fill, fillRole: getFillRole(fill), cx, cy, vtracerGroup: id });
        groupPaths.push(pid);
      }
      vtracerGroups[id] = groupPaths;
      
    } else if (tag === 'path') {
      const pid = id;
      const style = child.getAttribute('style') ?? '';
      const fillMatch = style.match(/fill:\s*([^;]+)/);
      const fill = fillMatch?.[1]?.trim() ?? '#000000';
      const d = child.getAttribute('d') ?? '';
      const [cx, cy] = getCentroid(d, 0, 0);
      
      paths.push({ id: pid, fill, fillRole: getFillRole(fill), cx, cy, vtracerGroup: null });
      standalonePathIds.push(pid);
    }
  }
  
  return { paths, vtracerGroups, standalonePathIds, viewBox };
}
```

---

## Código: `buildSystemInstruction_v2()`

```typescript
function buildSystemInstruction_v2(lang: string): string {
  return `Eres un agente de estructuración semántica SVG. Tu ÚNICO output es un objeto JSON.

**TU TAREA:**
Se te entrega un inventario de paths SVG (cada uno con id, fill, centroide en el viewBox)
y grupos semánticos que vtracer ya detectó. Debes asignar cada path a la jerarquía semántica
que te proporciona el NLU, respetando las señales de color y posición.

**OUTPUT — EXACTAMENTE ESTE ESQUEMA JSON:**

\`\`\`json
{
  "desc": "descripción visual breve en ${lang} (máx 2 oraciones)",
  "groups": {
    "<group-id>": {
      "concept": "Agent|Object|Action|Context|Attribute",
      "label": "aria-label en ${lang}",
      "class": "k|f|st-dark|...",
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
\`\`\`

**REGLAS:**
1. TODOS los path-ids del inventario deben aparecer exactamente UNA VEZ en el JSON
2. "paths" en un nodo hoja son los paths asignados a ese grupo directamente
3. "paths" en un nodo padre que tiene "children" puede estar vacío []
4. "evenodd": true → los paths claros (light) dentro de un grupo oscuro son agujeros visuales.
   Úsalo cuando haya paths light cuyo centroide está dentro del bbox del path dark del mismo grupo.
   El ensamblador los fusionará con fill-rule="evenodd".
5. "class": usa "k" para Agent, "f" para Object/Context, "accent" para elementos de color
6. Preservar los group-ids de vtracer cuando coincidan con la jerarquía del NLU
7. Si un path no encaja en ningún grupo semántico → asígnalo a un grupo "contexto" con concept="Context"
8. NO incluir paths con id vacío o nulo
9. Emitir SOLO el JSON. Sin markdown, sin explicaciones.`;
}
```

---

## Código: `buildUserMessage_v2(inventory, nlu, elements)`

```typescript
function formatInventory(inv: PathInventory): string {
  const lines = inv.paths.map(p =>
    `  ${p.id}: fill=${p.fill}(${p.fillRole}), pos=(${p.cx},${p.cy})` +
    (p.vtracerGroup ? ` [vtracer:${p.vtracerGroup}]` : ' [standalone]')
  );
  
  // Grupos pre-existentes solo si el usuario los creó en el editor
  const hasUserGroups = Object.keys(inv.vtracerGroups).length > 0;
  const groupLines = hasUserGroups
    ? [
        '',
        'GRUPOS YA ORGANIZADOS POR EL USUARIO EN EL EDITOR (respetar si coinciden con NLU):',
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

  return [
    `INVENTARIO DE PATHS (${inv.paths.length} paths, viewBox ${inv.viewBox}):`,
    ...lines,
    ...groupLines,
    inv.standalonePathIds.length && hasUserGroups
      ? `\nSTANDALONE (fuera de grupos): ${inv.standalonePathIds.join(', ')}`
      : '',
  ].filter(Boolean).join('\n');
}

// En structureSVG_v2():
const userMessage = `**CONTEXTO SEMÁNTICO (NLU):**
Utterance: "${nlu.utterance}"
Actor: ${vg.focus_actor ?? '?'} | Acción: ${vg.action_core ?? '?'} | Objeto: ${vg.object_core ?? '?'}
Dominio: ${nlu.domain} | Frames: ${frames}

**JERARQUÍA REQUERIDA (ids exactos para los <g>):**
${formatElements(elements)}

**${formatInventory(inventory)}**

Emite SOLO el JSON de asignación.`;
```

---

## Código: `assembleSVGFromAssignment()`

Esta función reconstruye el SVG leyendo los paths originales del rawSvg
y ubicándolos en la jerarquía del JSON de Gemini.

```typescript
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

function extractOriginalPaths(rawSvg: string): Map<string, { d: string; transform: string; fill: string }> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawSvg, 'image/svg+xml');
  const map = new Map();
  
  doc.querySelectorAll('path').forEach(p => {
    const id = p.getAttribute('id');
    if (!id) return;
    const style = p.getAttribute('style') ?? '';
    const fillMatch = style.match(/fill:\s*([^;]+)/);
    map.set(id, {
      d: p.getAttribute('d') ?? '',
      transform: p.getAttribute('transform') ?? '',
      fill: fillMatch?.[1]?.trim() ?? '#000000',
    });
  });
  
  return map;
}

function renderNode(
  groupId: string,
  node: AssignmentNode,
  originalPaths: Map<string, { d: string; transform: string; fill: string }>,
  indent = '  '
): string {
  const cls = node.class ?? 'f';
  const label = node.label.replace(/"/g, '&quot;');
  const openTag = `${indent}<g id="${groupId}" role="group" tabindex="0" data-concept="${node.concept}" aria-label="${label}" class="${cls}">`;
  
  const lines = [openTag];
  
  // Render own paths
  if (node.paths?.length) {
    if (node.evenodd && node.paths.length > 1) {
      // Combine into single evenodd path
      // Find the dark path to use its fill
      const darkPath = node.paths
        .map(id => originalPaths.get(id))
        .find(p => p && getFillRole(p.fill) === 'dark');
      const fill = darkPath?.fill ?? '#000000';
      
      const subpaths = node.paths.map(id => {
        const p = originalPaths.get(id);
        if (!p) return '';
        // Apply transform if present
        // (simplified: for now emit as subpath — bake transforms beforehand)
        return p.d;
      }).filter(Boolean).join(' ');
      
      lines.push(`${indent}  <path d="${subpaths}" fill="${fill}" fill-rule="evenodd"/>`);
    } else {
      for (const pathId of node.paths) {
        const p = originalPaths.get(pathId);
        if (!p) { console.warn(`[assemble] path not found: ${pathId}`); continue; }
        const transformAttr = p.transform ? ` transform="${p.transform}"` : '';
        // Note: fill is kept from original (inline) — CSS classes on parent <g> will override
        // unless user explicitly cleans them later via "Limpiar estilos inline"
        lines.push(`${indent}  <path id="${pathId}" d="${p.d}"${transformAttr}/>`);
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

export function assembleSVGFromAssignment(
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
    assignment.groups['contexto-fallback'] = {
      concept: 'Context',
      label: 'elementos de contexto',
      class: 'f',
      paths: missing,
    };
  }
  
  const bodyLines = Object.entries(assignment.groups).map(([gid, node]) =>
    renderNode(gid, node, originalPaths)
  );
  
  const body = bodyLines.join('\n');
  
  // Use assembleStructuredSVG with the new body
  return assembleStructuredSVG(body, input, metadata, filteredCSS, viewBox);
}
```

---

## Cambios en `structureSVG()` (resumen)

```typescript
// Modelo
model: "gemini-2.5-flash",  // era gemini-3-pro-preview

// Nuevo pre-proceso: construir inventario
const inventory = buildPathInventory(processedSvg);

// Nuevo prompt
const systemInstruction = buildSystemInstruction_v2(lang);
const userMessage = buildUserMessage_v2(inventory, input.nlu, input.elements, lang);

// maxOutputTokens: 2048 (era 65536 — el JSON de asignación es tiny)
maxOutputTokens: 2048,

// Post-proceso: parsear JSON y ensamblar
const jsonText = cleanGeminiJSON(text);  // strip markdown fences si los hay
const assignment: Assignment = JSON.parse(jsonText);
let svgContent = assembleSVGFromAssignment(
  input.rawSvg,  // paths originales sin tocar
  assignment,
  input, metadata, filteredCSS, viewBox
);
```

---

## Función auxiliar: `cleanGeminiJSON(text)`

```typescript
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
```

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `services/svgStructureService.ts` | Agregar `buildPathInventory`, `buildSystemInstruction_v2`, `buildUserMessage_v2`, `assembleSVGFromAssignment`, `cleanGeminiJSON`. Modificar `structureSVG()`. |
| — | No se tocan otros archivos. El contrato de `structureSVG()` es idéntico externamente. |

---

## Decisiones de diseño abiertas

1. **¿Cuándo aplicar evenodd?** Por ahora: cuando `evenodd: true` en el JSON de Gemini.
   Alternativa: detectarlo siempre localmente (sin preguntarle a Gemini).
   → Recomendación: dejar que Gemini lo señale, pero con detección local de fallback.

2. **¿Preservar fills inline del rawSvg en el structured?**
   Con el nuevo ensamblador sí se preservan (no se strip en los paths).
   El usuario puede limpiarlos con "Limpiar estilos inline" en el editor.
   → Consistente con el principio "fills de vtracer son datos valiosos".

3. **¿Qué hacer si Gemini devuelve JSON inválido?**
   Fallback: usar los grupos de vtracer directamente (ya los tenemos en `inventory.vtracerGroups`).
   Esto significa que en el peor caso el resultado es idéntico al rawSvg pero con wrapper semántico.
