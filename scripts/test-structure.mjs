#!/usr/bin/env node
/**
 * Test the ESTRUCTURAR (Phase 5) prompt and tool-call schema.
 *
 * Two modes:
 *   default    — calls /.netlify/functions/api-claude at localhost:9001
 *                Requires `npm run dev` running and a valid site ANTHROPIC_API_KEY.
 *   --direct   — calls the Anthropic API directly using ANTHROPIC_API_KEY from .env
 *                Useful for unit-testing the prompt independently of Netlify.
 *
 * Usage:
 *   node scripts/test-structure.mjs
 *   node scripts/test-structure.mjs --direct
 *   node scripts/test-structure.mjs --direct --model claude-haiku-4-5-20251001
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE  = path.resolve(__dirname, '../.env');

// ── Parse args ─────────────────────────────────────────────────────────────
let MODEL  = 'claude-sonnet-4-6';
let DIRECT = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--direct')             { DIRECT = true; }
    else if (args[i] === '--model' && args[i + 1]) { MODEL = args[++i]; }
    else if (!args[i].startsWith('--'))     { MODEL = args[i]; }
}

// ── Read .env for direct mode ───────────────────────────────────────────────
function readEnvKey(name) {
    try {
        const text = readFileSync(ENV_FILE, 'utf8');
        const match = text.split('\n').find(l => l.startsWith(name + '='));
        return match ? match.slice(name.length + 1).trim() : null;
    } catch { return null; }
}

// ── Minimal test fixtures ───────────────────────────────────────────────────

// 10×10 white PNG (programmatically generated, verified valid)
const PLACEHOLDER_IMAGE_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAEElEQVR4nGP4jxcwjEpjAwD6Hirkl4HYkQAAAABJRU5ErkJggg==';

const TEST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle id="p0" cx="50" cy="50" r="40" fill="#4A90D9"/>
  <rect   id="p1" x="30" y="30" width="40" height="40" fill="#E74C3C"/>
</svg>`;

const SYSTEM_PROMPT = `Eres un agente de restructuración semántica de SVG para pictogramas AAC (Comunicación Aumentativa y Alternativa).

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

Reglas:
1. Trabaja desde la evidencia visual de la imagen — no asumas contenido semántico a partir de los nombres de nodos
2. Cada path debe aparecer en exactamente un keep de grupo, o en discard
3. Usa solo los valores de cssClass listados en la paleta
4. "k" = agente/actor (personaje principal), "f" = objeto o acción, "accent" = acento de color`;

const TOOL_SCHEMA = {
    name: 'restructure_svg',
    description: 'Restructure the SVG by assigning paths to semantic nodes, discarding tracing noise, and optionally proposing simple path merges.',
    input_schema: {
        type: 'object',
        properties: {
            description: { type: 'string', description: 'Brief description of what was restructured.' },
            groups: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        nodeId:   { type: 'string' },
                        cssClass: { type: 'string', enum: ['k', 'f', 'accent', 'bg'] },
                        keep:     { type: 'array', items: { type: 'string' } },
                    },
                    required: ['nodeId', 'cssClass', 'keep'],
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

const MESSAGES = [{
    role: 'user',
    content: [
        {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: PLACEHOLDER_IMAGE_B64 },
        },
        {
            type: 'text',
            text: `Analiza este SVG y restructúralo semánticamente.\n\nDOM semántico:\n- figura [objeto] "figura de prueba"\n\nPaleta CSS: k, f, accent, bg\n\nMarks:\n  mark 0: id="p0" fill-role="stroke" centroide=(50,50)\n  mark 1: id="p1" fill-role="fill"   centroide=(50,50)\n\nFuente SVG:\n${TEST_SVG}`,
        },
    ],
}];

const PAYLOAD = {
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'restructure_svg' },
    messages: MESSAGES,
};

// ── Call helpers ────────────────────────────────────────────────────────────

async function callViaNetlify() {
    const url = 'http://localhost:9001/.netlify/functions/api-claude';
    console.log(`Modo    : Netlify proxy (${url})`);
    console.log(`Modelo  : ${MODEL}\n`);

    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(PAYLOAD),
        });
    } catch (err) {
        console.error(`ERROR de red: ${err.message}`);
        console.error('¿Está corriendo "npm run dev" en localhost:9001?');
        process.exit(1);
    }

    if (!res.ok) {
        const body = await res.text().catch(() => '(sin cuerpo)');
        console.error(`ERROR ${res.status}: ${body}`);
        if (body.includes('401')) {
            console.error('\nDiagnóstico: la clave ANTHROPIC_API_KEY del sitio Netlify está');
            console.error('  desactualizada y sobreescribe la de .env en netlify dev.');
            console.error('  Solución: actualizar la clave en el panel o con:');
            console.error('    netlify env:set ANTHROPIC_API_KEY <clave> --context dev');
            console.error('  O bien corre este test con --direct para saltar el proxy.');
        }
        process.exit(1);
    }

    return res.json();
}

async function callDirect() {
    const apiKey = readEnvKey('ANTHROPIC_API_KEY');
    if (!apiKey) {
        console.error('ERROR: ANTHROPIC_API_KEY no encontrada en .env');
        process.exit(1);
    }
    const url = 'https://api.anthropic.com/v1/messages';
    console.log(`Modo    : Directo (api.anthropic.com)`);
    console.log(`Modelo  : ${MODEL}`);
    console.log(`Clave   : ${apiKey.slice(0, 14)}…\n`);

    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(PAYLOAD),
        });
    } catch (err) {
        console.error(`ERROR de red: ${err.message}`);
        process.exit(1);
    }

    if (!res.ok) {
        const body = await res.text().catch(() => '(sin cuerpo)');
        console.error(`ERROR ${res.status} de la API de Anthropic: ${body}`);
        process.exit(1);
    }

    return res.json();
}

// ── Main ────────────────────────────────────────────────────────────────────

const data = await (DIRECT ? callDirect() : callViaNetlify());

const toolBlock = data?.content?.find(b => b.type === 'tool_use' && b.name === 'restructure_svg');
if (!toolBlock) {
    console.error('FALLO — el modelo no invocó la herramienta restructure_svg');
    console.error('stop_reason:', data?.stop_reason);
    console.error('Respuesta:', JSON.stringify(data?.content, null, 2));
    process.exit(1);
}

const m = toolBlock.input;
console.log('OK — restructure_svg invocado correctamente');
console.log(`  descripción : ${m.description}`);
console.log(`  grupos      : ${m.groups?.length ?? 0}`);
console.log(`  descartados : ${m.discard?.length ?? 0}`);
if (m.groups?.length) {
    for (const g of m.groups) {
        console.log(`    ${g.nodeId} (${g.cssClass}): keep=[${g.keep?.join(', ')}]`);
    }
}
if (m.discard?.length) {
    console.log(`    descartados: ${m.discard.join(', ')}`);
}
const usage = data.usage ?? data.usageMetadata;
if (usage) {
    const inp = usage.input_tokens  ?? usage.promptTokenCount ?? '?';
    const out = usage.output_tokens ?? usage.candidatesTokenCount ?? '?';
    console.log(`\nTokens: entrada=${inp}, salida=${out}`);
}
