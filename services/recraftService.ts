/**
 * Recraft Service — Phase 3 (PRODUCIR)
 *
 * Calls Recraft V3 SVG via the api-recraft Netlify function.
 * Returns a native SVG string — no rasterization, no VTracer.
 * This SVG (rawSvg) feeds directly into phase 5 (ESTRUCTURAR).
 */

import { GlobalConfig, VisualElement } from "../types";
import { callRecraft } from "./aiClient";

type LogFn = (type: 'info' | 'error' | 'success', msg: string) => void;

const formatElements = (els: VisualElement[], depth = 0): string => {
    if (!Array.isArray(els)) return '';
    return els.map(el => {
        const indent = '  '.repeat(depth);
        const children = el.children?.length ? '\n' + formatElements(el.children, depth + 1) : '';
        return `${indent}- ${el.id}${children}`;
    }).join('\n');
};

/**
 * Phase 3 (PRODUCIR): Generate a native SVG pictogram using Recraft V3.
 *
 * @param elements  VisualElement[] from phase 2
 * @param prompt    Spatial composition prompt from phase 2
 * @param row       RowData (for utterance and NLU context)
 * @param config    GlobalConfig
 * @param onLog     Progress callback
 * @returns         Raw SVG string from Recraft
 */
export const generateSVG = async (
    elements: VisualElement[],
    prompt: string,
    row: { UTTERANCE: string; NLU?: any },
    config: GlobalConfig,
    onLog?: LogFn,
): Promise<string> => {
    onLog?.('info', '[PRODUCIR] Iniciando generación SVG con Recraft V3…');
    onLog?.('info', `[PRODUCIR] Elementos: ${elements.length}`);

    const nluContext = row.NLU && typeof row.NLU === 'object'
        ? `\nContexto semántico: ${row.NLU.visual_guidelines?.focus_actor || ''} — ${row.NLU.visual_guidelines?.action_core || ''} — ${row.NLU.visual_guidelines?.object_core || ''}`
        : '';

    const fullPrompt = [
        `Pictograma AAC: "${row.UTTERANCE}"`,
        nluContext,
        '',
        'Elementos (jerarquía visual):',
        formatElements(elements),
        '',
        'Composición espacial:',
        prompt,
        '',
        config.visualStylePrompt || 'Estilo pictograma plano, sin texto, diseño vectorial simple, fondo blanco.',
        '',
        'Sin texto. Sin etiquetas. Sin marcas de agua. Fondo blanco. Diseño plano.',
    ].filter(s => s !== undefined).join('\n');

    onLog?.('info', '[PRODUCIR] Enviando prompt a Recraft…');
    const response = await callRecraft({
        prompt: fullPrompt,
        style: 'vector_illustration',
        substyle: 'flat_design_cutout',
    });

    if (!response.svg || !response.svg.includes('<svg')) {
        throw new Error('Recraft no devolvió un SVG válido');
    }

    onLog?.('success', `[PRODUCIR] SVG recibido (${(response.svg.length / 1024).toFixed(1)} KB)`);
    return response.svg;
};
