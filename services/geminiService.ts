
import { NLUData, GlobalConfig, RowData, VisualElement, VOCAB_NSM, VOCAB } from "../types";
import { generateContent } from "./aiClient";

const cleanJSONResponse = (text: string): string => {
  if (!text) return '{}';
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json|svg|xml)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  let start = -1; let end = -1;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace; end = lastBrace;
  } else if (firstBracket !== -1) {
    start = firstBracket; end = lastBracket;
  }
  if (start !== -1 && end !== -1 && end > start) {
    return cleaned.substring(start, end + 1);
  }
  return cleaned;
};

/**
 * Normalize element tree from Flash response:
 * - Renames "elements" key to "children" (Flash inconsistency)
 * - Strips extra keys like "label", "suggestedClass" (keep only id + children)
 */
const normalizeElements = (raw: any[]): VisualElement[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map(el => {
    const node: VisualElement = { id: el.id || 'unknown' };
    const kids = el.children || el.elements;
    if (Array.isArray(kids) && kids.length > 0) {
      node.children = normalizeElements(kids);
    }
    return node;
  });
};

/**
 * Normalize prompt: may arrive as JSON array string, object, or plain text.
 */
const normalizePrompt = (raw: any): string => {
  if (typeof raw === 'string') {
    // Check if it's a JSON array string like '["sentence 1","sentence 2"]'
    if (raw.startsWith('[')) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr.join(' ');
      } catch { /* not JSON, use as-is */ }
    }
    return raw;
  }
  if (Array.isArray(raw)) return raw.join(' ');
  if (raw && typeof raw === 'object') return JSON.stringify(raw);
  return '';
};

/**
 * Extract element IDs from prompt text as fallback when elements array is missing.
 * The prompt convention wraps element IDs in single quotes: 'persona', 'casa', etc.
 * Returns a flat hierarchy under a root 'pictograma' node.
 */
const extractElementsFromPrompt = (prompt: string): VisualElement[] => {
  const matches = prompt.match(/'([a-záéíóúñü][a-záéíóúñü_]*?)'/gi) || [];
  const unique = [...new Set(matches.map(m => m.replace(/'/g, '')))];
  const ids = unique.filter(id => id !== 'pictograma');
  if (ids.length === 0) return [];
  return [{
    id: 'pictograma',
    children: ids.map(id => ({ id }))
  }];
};

/** Build formatted NSM primes block for the system instruction, in the active language */
const buildNSMPrimesBlock = (langTag: string): string => {
  const isEs = langTag.startsWith('es');
  const key = isEs ? 'es' : 'en';
  const entries = Object.entries(VOCAB_NSM) as [string, { en: string[]; es: string[] }][];
  return entries.map(([category, primes]) => {
    const label = category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `*   **${label}:** ${primes[key].join(', ')}`;
  }).join('\n');
};

export const generateNLU = async (utterance: string, onLog?: (type: 'info' | 'error' | 'success', msg: string) => void, config?: GlobalConfig): Promise<NLUData> => {
  onLog?.('info', `[NLU] Iniciando análisis semántico de: "${utterance.substring(0, 50)}..."`);

  const geoRegion = config?.geoContext?.region || 'No especificado';
  const lang = config?.lang || 'es-419';
  const isEs = lang.startsWith('es');
  const nsmPrimesBlock = buildNSMPrimesBlock(lang);
  const domainList = VOCAB.domain.join(', ');

  const annotatedContext = config?.annotatedContext?.trim()
    ? `\n- Contexto anotado: "${config.annotatedContext.trim()}"`
    : '';

  const explicLang = isEs
    ? 'Las explicaciones NSM (nsm_explications) deben estar escritas usando los primos en ESPAÑOL.'
    : 'The NSM explications (nsm_explications) must be written using the primes in ENGLISH.';

  const frameLabelLang = isEs
    ? 'Genera frame_label como traducción al español del frame_name (e.g., frame_name: "Expensiveness", frame_label: "Costo").'
    : 'Generate frame_label as the English label for the frame (e.g., frame_name: "Expensiveness", frame_label: "Expensiveness").';

  const systemInstruction = `**Contexto de Arquitectura:**
Operas como el nodo de procesamiento "NLU Schema Engine" dentro de la arquitectura de grafo PictoNet.
Tu tarea es instanciar el esquema JSON definido oficialmente en el repositorio **\`mediafranca/nlu-schema\`**.

**Contexto de Uso (metadata del vocabulario):**
- Región geográfica: ${geoRegion}
- Idioma del vocabulario: ${lang}${annotatedContext}
Ten en cuenta este contexto para interpretar correctamente la intención comunicativa, la pragmática y las convenciones culturales relevantes.

**Función del Nodo:**
Recibes una intención comunicativa (\`utterance\`) y debes mapearla al grafo semántico utilizando la ontología NSM (65 primos universales).

**Ontología NSM (mediafranca/nsm-core, Goddard & Wierzbicka Chart v19, 2017):**
Debes aplicar rigurosamente estos 65 primitivos para las explicaciones:
${nsmPrimesBlock}

${explicLang}

**Dominio:**
Infiere el dominio temático de la utterance. Debe ser uno de: ${domainList}

**Frames:**
${frameLabelLang}

**Esquema de Salida (mediafranca/nlu-schema v1.0):**
Tu salida debe adherirse *estrictamente* a este esquema.

\`\`\`json
{
  "utterance": "string",
  "lang": "string",
  "domain": "string (one of: ${domainList})",
  "metadata": {
    "speech_act": "string",
    "intent": "string"
  },
  "frames": [
    {
      "frame_name": "string (FrameNet compatible, always English)",
      "frame_label": "string (translated label in utterance language)",
      "lexical_unit": "string",
      "roles": {
        "RoleName": {
          "type": "string",
          "ref": "string",
          "surface": "string"
        }
      }
    }
  ],
  "nsm_explications": {
    "KEY_CONCEPT": "string (usando SOLO primos NSM en el idioma activo)"
  },
  "logical_form": {
    "event": "string",
    "modality": "string"
  },
  "pragmatics": {
    "politeness": "string",
    "formality": "string",
    "expected_response": "string"
  },
  "visual_guidelines": {
    "focus_actor": "string",
    "action_core": "string",
    "object_core": "string",
    "context": "string",
    "temporal": "string"
  }
}
\`\`\`

**Reglas de Ejecución:**
1.  Retorna SOLO el JSON.
2.  Analiza la pragmática y semántica profunda, no solo la superficie.
3.  Asegura JSON válido.`;

  onLog?.('info', `[NLU] Enviando solicitud a Gemini 2.5 Flash...`);
  const response = await generateContent({
    model: "gemini-2.5-flash",
    contents: `UTTERANCE: "${utterance}"`,
    config: {
      systemInstruction,
    }
  });

  onLog?.('info', `[NLU] Respuesta recibida, parseando JSON...`);
  const result = JSON.parse(cleanJSONResponse(response.text)) as NLUData;
  onLog?.('success', `[NLU] Análisis semántico completado. Detectado: ${result.metadata?.intent || 'N/A'}`);
  return result;
};

export const generateVisualBlueprint = async (nlu: NLUData, config: GlobalConfig, onLog?: (type: 'info' | 'error' | 'success', msg: string) => void): Promise<Partial<RowData>> => {
  if (!nlu) throw new Error('NLU data is required — run the COMPRENDER step first');
  const targetLang = nlu.lang || config?.lang || 'en';

  onLog?.('info', `[VISUAL] Iniciando generación de blueprint visual (idioma: ${targetLang})...`);
  onLog?.('info', `[VISUAL] Contexto semántico: ${nlu.metadata?.intent || 'N/A'}`);

  // Build list of available CSS class names from config so Gemini can reference them
  const availableClasses = config.svgStyleDefs
    ? config.svgStyleDefs.flatMap(s => s.selectors).join(', ')
    : '.main, .secondary, .tertiary, .accent, .red, .green, .st-dark, .st-light, .dashed, .glow, .anim-blink, .anim-beat, .anim-swing, .slide-r, .slide-u';

  const systemInstruction = `You are the "Visual Topology Node" in the PictoNet graph.
Your function is to translate the semantic graph (NLU) into a hierarchical visual graph (Elements & Spatial Logic).

**Language Context:**
The "utterance" language is: **${targetLang}**.
You MUST generate Element IDs and the prompt logic in **${targetLang}**.

**Available CSS style classes (for reference in element descriptions):**
${availableClasses}
These classes will be applied to SVG elements later. You may suggest a \`suggestedClass\` field on elements when semantically relevant (e.g., an action element could suggest \`.anim-beat\`, a warning element \`.red\`). This field is optional and informational only.

**Output Graph Schema:**

1.  **"elements" (Visual Hierarchy):**
    *   A recursive list of visual nodes.
    *   The root element must always be \`pictograma\`, representing the entire scene.
    *   IDs must be **simple nouns** in **${targetLang}**.
    *   For compound names, use \`snake_case\` (e.g., \`persona_corriendo\`, \`casa_grande\`).
    *   Optional: add \`"suggestedClass": ".accent"\` when a specific style class is semantically meaningful.

2.  **"prompt" (Spatial Edges):**
    *   Describes the edges/relationships between visual nodes in space incorporating visual metaphors.
    *   Write in **${targetLang}**.
    *   **IMPORTANT:** When referencing elements in the prompt, always wrap their IDs in single quotes (e.g., 'pictograma', 'persona', 'casa').
    *   **Focus exclusively on TOPOLOGY and COMPOSITION** (relative position, size relations, connections).
    *   Do NOT define style (handled by the Global Style Node).

**Final Output:** A single valid JSON object containing \`elements\` and \`prompt\`.`;

  onLog?.('info', `[VISUAL] Enviando contexto NLU a Gemini 2.5 Flash...`);
  const response = await generateContent({
    model: "gemini-2.5-flash",
    contents: `NLU Semantics: ${JSON.stringify(nlu)}`,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
    }
  });

  onLog?.('info', `[VISUAL] Respuesta recibida, parseando blueprint...`);
  const result = JSON.parse(cleanJSONResponse(response.text));

  // Normalize prompt (may be JSON array string, array, or object)
  result.prompt = normalizePrompt(result.prompt);

  // Normalize elements tree ("elements" → "children", strip extras)
  if (Array.isArray(result.elements) && result.elements.length > 0) {
    result.elements = normalizeElements(result.elements);
  } else {
    onLog?.('info', `[VISUAL] Elements no recibidos, extrayendo del prompt...`);
    result.elements = extractElementsFromPrompt(result.prompt);
  }

  const promptPreview = typeof result.prompt === 'string' ? result.prompt.substring(0, 50) : 'N/A';
  onLog?.('success', `[VISUAL] Blueprint completado. Elementos: ${result.elements.length}, Prompt: ${promptPreview}...`);
  return result;
};

export const generateSpatialPrompt = async (nlu: NLUData, elements: VisualElement[], config: GlobalConfig, onLog?: (type: 'info' | 'error' | 'success', msg: string) => void): Promise<string> => {
  if (!nlu) throw new Error('NLU data is required — run the COMPRENDER step first');
  const targetLang = nlu.lang || config?.lang || 'en';

  onLog?.('info', `[PROMPT] Generando prompt de articulación espacial (idioma: ${targetLang})...`);

  // Helper function to format elements hierarchy as readable text
  const formatElements = (els: VisualElement[], depth = 0): string => {
    if (!Array.isArray(els)) {
      return '  (error: not an array)';
    }
    return els.map(el => {
      const indent = '  '.repeat(depth);
      const children = el.children && Array.isArray(el.children) ? '\n' + formatElements(el.children, depth + 1) : '';
      return `${indent}- ${el.id}${children}`;
    }).join('\n');
  };

  const systemInstruction = `You are the "Spatial Articulation Node" in the PictoNet graph.
Your function is to generate a descriptive prompt that explains how visual elements should be spatially arranged and composed.

**Language Context:**
The "utterance" language is: **${targetLang}**.
You MUST generate the prompt in **${targetLang}**.

**Input:**
- Semantic context (NLU analysis)
- Hierarchical visual elements structure

**Task:**
Generate a detailed spatial composition description that explains:
1. How elements are positioned relative to each other
2. Size relationships between elements
3. Visual metaphors and symbolic representations
4. Compositional guidelines for the pictogram

**IMPORTANT:** When referencing elements in the prompt, always wrap their IDs in single quotes (e.g., 'pictograma', 'persona', 'casa').

**Output:**
A single descriptive text (NOT JSON) in **${targetLang}** that describes the spatial articulation.
Focus exclusively on TOPOLOGY and COMPOSITION (relative position, size relations, connections).
Do NOT define style (that's handled elsewhere).`;

  const elementsText = formatElements(elements);
  const nluText = JSON.stringify(nlu, null, 2);

  onLog?.('info', `[PROMPT] Enviando contexto (NLU + ${elements.length} elementos) a Gemini 2.5 Flash...`);
  const response = await generateContent({
    model: "gemini-2.5-flash",
    contents: `
NLU SEMANTIC CONTEXT:
${nluText}

VISUAL ELEMENTS HIERARCHY:
${elementsText}

Generate a spatial composition prompt that describes how these elements should be arranged to represent the communicative intent.`,
    config: {
      systemInstruction,
    }
  });

  onLog?.('info', `[PROMPT] Respuesta recibida, extrayendo prompt...`);
  const prompt = (response.text || '').trim();

  onLog?.('success', `[PROMPT] Prompt espacial generado: ${prompt.substring(0, 80)}...`);
  return prompt;
};

export const generateImage = async (elements: VisualElement[], prompt: string, row: any, config: GlobalConfig, onLog?: (type: 'info' | 'error' | 'success', msg: string) => void): Promise<string> => {

  // Validate that elements is actually an array
  if (!Array.isArray(elements)) {
    const errorMsg = `[BITMAP] Error: 'elements' debe ser un array, recibido: ${typeof elements}`;
    onLog?.('error', errorMsg);
    throw new Error(errorMsg);
  }

  onLog?.('info', `[BITMAP] Iniciando generación de imagen...`);
  onLog?.('info', `[BITMAP] Elementos a renderizar: ${elements.length}`);

  // Helper function to format elements hierarchy as readable text
  const formatElements = (els: VisualElement[], depth = 0): string => {
    if (!Array.isArray(els)) {
      return '  (error: not an array)';
    }
    return els.map(el => {
      const indent = '  '.repeat(depth);
      const children = el.children && Array.isArray(el.children) ? '\n' + formatElements(el.children, depth + 1) : '';
      return `${indent}- ${el.id}${children}`;
    }).join('\n');
  };

  // Format NLU context if available
  const nluContext = row.NLU && typeof row.NLU === 'object' ? `
    SEMANTIC CONTEXT (from Step 1 - UNDERSTAND):
    Utterance: "${row.NLU.utterance || row.UTTERANCE}"
    Intent: ${row.NLU.metadata?.intent || 'N/A'}
    Speech Act: ${row.NLU.metadata?.speech_act || 'N/A'}
    Focus: ${row.NLU.visual_guidelines?.focus_actor || 'N/A'}
    Core Action: ${row.NLU.visual_guidelines?.action_core || 'N/A'}
    Core Object: ${row.NLU.visual_guidelines?.object_core || 'N/A'}
  ` : '';

  // Combine the specific spatial articulation prompt with the global style prompt and author
  const fullPrompt = `
    Create a pictogram image based on these instructions:

    CONTEXT FROM PIPELINE:
    Original communicative intent: "${row.UTTERANCE}"
    ${nluContext}

    HIERARCHICAL ELEMENTS (from Step 2 - COMPOSE):
    ${formatElements(elements)}

    SPATIAL COMPOSITION (from Step 2 - COMPOSE):
    ${prompt}

    GRAPHIC STYLE (from Global Config):
    ${config.visualStylePrompt}

    CRITICAL CONSTRAINTS:
    1. Follow the HIERARCHICAL ELEMENTS structure exactly - each element must be visually present
    2. Apply the SPATIAL COMPOSITION description for layout and relationships
    3. Use the GRAPHIC STYLE for visual treatment
    4. NO TEXT of any kind (no labels, no signatures, no watermarks)
    5. PURE VISUAL REPRESENTATION only
    6. FLAT DESIGN ideal for vectorization (solid colors, clear distinct shapes, consistent stroke widths)
    7. Plain white background
  `;

  // Select model based on config.
  // 'pro' maps to gemini-3-pro-image-preview (NanoBanana Pro / High Quality)
  // 'flash' maps to gemini-2.5-flash-image (NanoBanana / Fast)
  const modelName = config.imageModel === 'pro'
    ? 'gemini-3-pro-image-preview'
    : 'gemini-2.5-flash-image';

  onLog?.('info', `[BITMAP] Modelo seleccionado: ${modelName} (${config.aspectRatio})`);
  onLog?.('info', `[BITMAP] Enviando prompt completo a Gemini...`);

  const response = await generateContent({
    model: modelName,
    contents: {
      parts: [
        { text: fullPrompt }
      ]
    },
    config: {
      imageConfig: {
        aspectRatio: config.aspectRatio
      }
    }
  });

  onLog?.('info', `[BITMAP] Respuesta recibida, extrayendo imagen...`);

  // Extract image from response
  let base64Image = "";

  if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        base64Image = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        onLog?.('success', `[BITMAP] Imagen generada exitosamente (${part.inlineData.mimeType})`);
        break;
      }
    }
  }

  if (!base64Image) {
    onLog?.('error', `[BITMAP] No se pudo generar la imagen`);
    throw new Error("No image generated.");
  }

  // Resize to max 1024px PNG — lossless quality for vectorization.
  // Compression to JPEG happens only at the persistence layer (IndexedDB).
  onLog?.('info', `[BITMAP] Redimensionando a max 1024px PNG...`);
  const resizedImage = await resizeImage(base64Image, 1024);
  onLog?.('success', `[BITMAP] Imagen lista (PNG lossless)`);

  return resizedImage;
};

// Resize bitmap so its longest side equals targetSize, preserving aspect ratio.
// Output is lossless PNG.
const resizeImage = (dataUrl: string, targetSize: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      if (w <= targetSize && h <= targetSize) {
        resolve(dataUrl); // already small enough
        return;
      }
      const scale = targetSize / Math.max(w, h);
      const newW = Math.round(w * scale);
      const newH = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Could not get canvas context')); return; }
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, newW, newH);
      ctx.drawImage(img, 0, 0, newW, newH);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
};

