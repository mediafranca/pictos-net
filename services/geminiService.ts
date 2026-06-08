/**
 * Gemini Service — Phase 3 (PRODUCIR) for Gemini image models.
 *
 * Calls Gemini image generation via the api-gemini Netlify function.
 * Returns a Phase3Result with bitmap (base64 PNG data URL).
 */

import { GlobalConfig, VisualElement, Phase3Result, GenerationModel } from "../types";
import { callGemini } from "./aiClient";

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
 * Phase 3 (PRODUCIR): Generate a pictogram image using a Gemini model.
 *
 * @param elements  VisualElement[] from phase 2
 * @param prompt    Spatial composition prompt from phase 2
 * @param row       RowData (for utterance and NLU context)
 * @param config    GlobalConfig (reads generationModel)
 * @param onLog     Progress callback
 * @returns         Phase3Result with bitmap and generationModel provenance
 */
export const generateImage = async (
    elements: VisualElement[],
    prompt: string,
    row: { UTTERANCE: string; NLU?: any },
    config: GlobalConfig,
    onLog?: LogFn,
): Promise<Phase3Result> => {
    const model = config.generationModel as GenerationModel;
    onLog?.('info', `[PRODUCIR] Iniciando generación con Gemini (${model})…`);
    onLog?.('info', `[PRODUCIR] Elementos: ${elements.length}`);

    const nluContext = row.NLU && typeof row.NLU === 'object'
        ? `\nSemantic context: ${row.NLU.visual_guidelines?.focus_actor || ''} — ${row.NLU.visual_guidelines?.action_core || ''} — ${row.NLU.visual_guidelines?.object_core || ''}`
        : '';

    let fullPrompt = [
        `AAC pictogram: "${row.UTTERANCE}"`,
        nluContext,
        '',
        'Visual elements (hierarchy):',
        formatElements(elements),
        '',
        'Spatial composition:',
        prompt,
        '',
        config.visualStylePrompt || 'Flat pictogram style, no text, simple vector design, white background.',
        '',
        'No text. No labels. No watermarks. White background. Flat design. Square format.',
    ].filter(s => s !== undefined).join('\n');

    if (fullPrompt.length > 2000) {
        const style = config.visualStylePrompt || 'Flat pictogram style, no text, simple vector design, white background.';
        const suffix = `\n\n${style}\nNo text. No labels. White background. Flat design.`;
        const prefix = `AAC pictogram: "${row.UTTERANCE}"\n${nluContext}\n\nElements:\n${formatElements(elements)}\n\nComposition:\n${prompt}`;
        const maxPrefixLen = 1995 - suffix.length;
        fullPrompt = prefix.slice(0, maxPrefixLen) + suffix;
    }

    onLog?.('info', `[PRODUCIR] Enviando prompt a Gemini (${fullPrompt.length} chars)…`);
    const response = await callGemini({ prompt: fullPrompt, model });

    if (!response.bitmap) {
        throw new Error('Gemini no devolvió imagen');
    }
    onLog?.('success', '[PRODUCIR] Imagen bitmap recibida de Gemini');
    return { bitmap: response.bitmap, generationModel: model };
};
