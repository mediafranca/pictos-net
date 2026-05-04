
export interface NLUMetadata {
  speech_act: string;
  intent: string;
}

export interface NLUFrameRole {
  type: string;
  surface: string;
  lemma?: string;
  definiteness?: string;
  ref?: string;
  ref_frame?: string;
}

export interface NLUFrame {
  frame_name: string;
  frame_label?: string;
  lexical_unit: string;
  roles: Record<string, NLUFrameRole>;
}

export interface NLUVisualGuidelines {
  focus_actor: string;
  action_core: string;
  object_core: string;
  context: string;
  temporal: string;
}

export interface Pragmatics {
  politeness: string;
  formality: string;
  expected_response: string;
}

export interface LogicalForm {
  event: string;
  modality: string;
}

export interface NLUData {
  utterance: string;
  lang: string;
  domain?: string;
  metadata: NLUMetadata;
  frames: NLUFrame[];
  nsm_explications: Record<string, string>;
  logical_form: LogicalForm;
  pragmatics: Pragmatics;
  visual_guidelines: NLUVisualGuidelines;
}

export type StepStatus = 'idle' | 'processing' | 'completed' | 'error' | 'outdated';

export type SortCriteria = 'alphabetical' | 'completeness';

export interface VisualElement {
  id: string;
  children?: VisualElement[];
}

// === Intervention Recording (see specs/intervention-recording.allium) ===

export type InterventionPhase =
  | 'utterance'
  | 'nlu'
  | 'elements'
  | 'prompt'
  | 'svg_raw'
  | 'svg_structured';
export type InterventionEventKind = 'edit' | 'discard';
export type ElementOpKind = 'add' | 'remove' | 'rename' | 'reorder';

/**
 * Lightweight indicative summary of an SVG artifact, stored on
 * intervention events for the svg_raw / svg_structured phases instead
 * of the full SVG content (which can be hundreds of KB).
 * See specs/intervention-recording.allium § SvgMetrics.
 */
export interface SvgMetrics {
  size: number;             // byte length of the SVG string
  entities: number;         // count of geometric DOM elements
  classes: string[];        // ordered union of all class= values
  structuralHash: string;   // 8-char fingerprint of all `d=` attributes
}

/**
 * Portability header injected ONLY when a row leaves its containing
 * library (e.g. "Copy Row" → clipboard). Inside a library export the
 * library config already carries this information, so events never
 * duplicate it. See specs/intervention-recording.allium § 1.
 */
export interface RowClipboardContext {
  lang: string;
  uiLang?: string;
  geoContext?: { lat: string; lng: string; region: string };
}

export interface InterventionEvent {
  /** Stable short id (8-char hex) generated at creation. Lets per-event
   *  annotations and audit-panel curation survive reordering or partial
   *  deletion of the events array. */
  id: string;
  phase: InterventionPhase;
  kind: InterventionEventKind;
  at: string; // ISO 8601
  op?: ElementOpKind; // present iff phase = 'elements' and kind = 'edit'
  before?: unknown;
  after?: unknown; // absent when kind = 'discard'
  /** Gemini model id that produced the artifact being discarded. Only
   *  set on discard events for AI-generated phases (nlu, elements, prompt). */
  modelId?: string;
}

export interface InterventionSession {
  startedAt: string;
  endedAt?: string;
  events: InterventionEvent[];
}

export interface RowInterventionLog {
  sessions: InterventionSession[];
}

export interface RecordingSetting {
  enabled: boolean;
}

export interface RowData {
  id: string;
  UTTERANCE: string;

  // Pipeline Data
  // Phase 1: "Comprender" (Understanding) - NLU Analysis
  NLU?: NLUData | string;

  // Phase 2: "Componer" (Compose) - Visual Strategy
  elements?: VisualElement[];
  prompt?: string;

  // Phase 3: "Producir" (Produce) - Bitmap Generation
  bitmap?: string; // Base64 data URL
  rawSvg?: string; // Vectorized SVG from vtracer (raw)
  structuredSvg?: string; // mf-svg-schema compliant SVG (Gemini-processed)

  // Global Pipeline Status
  status: 'idle' | 'processing' | 'completed' | 'error';

  // Step Statuses (3 phases)
  nluStatus: StepStatus;       // Phase 1: Comprender
  visualStatus: StepStatus;    // Phase 2: Componer
  bitmapStatus: StepStatus;    // Phase 3: Producir

  // Metrics
  nluDuration?: number;
  visualDuration?: number;
  bitmapDuration?: number;

  // Intervention recording (see specs/intervention-recording.allium)
  interventionLog?: RowInterventionLog;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'error' | 'success';
  message: string;
}

export interface SVGStyleConfig {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  strokeLinecap?: 'butt' | 'round' | 'square';
  strokeLinejoin?: 'miter' | 'round' | 'bevel';
  [key: string]: any; // Allow custom properties
}

import type { StyleDefinition, KeyframeDefinition } from './lib/style-editor/lib/types';

export interface GlobalConfig {
  lang: string; // Language for NLU processing (e.g., 'es', 'en')
  uiLang?: 'en-GB' | 'es-419'; // UI language (independent from NLU language)
  geoContext?: {
    lat: string;
    lng: string;
    region: string;
  };
  /** @deprecated Moved to COMPRENDER pipeline step. Do not use in UI. */
  annotatedContext?: string;
  aspectRatio: string; // '1:1', '3:4', '4:3', '9:16', '16:9'
  imageModel: string; // 'flash' | 'pro'
  name: string;
  credits?: string; // Autores/institución para atribución de la librería
  license: string;
  visualStylePrompt: string;
  /** Structured style definitions — single source of truth for CSS classes embedded in SVGs */
  svgStyleDefs?: StyleDefinition[];
  /** Structured keyframe definitions */
  svgKeyframes?: KeyframeDefinition[];
  /** @deprecated Use svgStyleDefs instead */
  svgStyles?: {
    [className: string]: SVGStyleConfig;
  };
  /** Intervention recording setting (see specs/intervention-recording.allium) */
  recording?: RecordingSetting;
  /** Library presentation mode (see specs/library-views.allium) */
  libraryViewMode?: 'list' | 'grid';
}

export type LibraryViewMode = 'list' | 'grid';

export const VOCAB = {
  speech_act: ['assertive', 'directive', 'commissive', 'expressive', 'declarative', 'interrogative'],
  intent: ['inform', 'request', 'desire_expression', 'command', 'offer', 'promise', 'thanking', 'greeting', 'question', 'complaint'],
  role_type: ['Agent', 'Object', 'Event', 'Attribute', 'Place', 'Time', 'Abstract', 'Quantity', 'Recipient', 'Instrument'],
  definiteness: ['none', 'definite', 'indefinite'],
  lang: ['es-419', 'en-GB'] as const,
  domain: [
    'transporte',
    'salud',
    'alimentación',
    'educación',
    'vida_cotidiana',
    'trabajo',
    'emociones',
    'tiempo_libre',
    'dinero',
    'seguridad',
    'comunicación',
    'lugar',
    'trámites',
  ] as const,
};

/** NSM 65 semantic primes (Goddard & Wierzbicka, Chart v19, 2017) — bilingual ES/EN */
export const VOCAB_NSM = {
  substantives: {
    en: ['I', 'YOU', 'SOMEONE', 'SOMETHING~THING', 'PEOPLE', 'BODY'],
    es: ['YO', 'TÚ~USTED', 'ALGUIEN', 'ALGO~COSA', 'GENTE~PERSONAS', 'CUERPO']
  },
  relational_substantives: {
    en: ['KIND', 'PART'],
    es: ['TIPO~CLASE', 'PARTE']
  },
  determiners: {
    en: ['THIS', 'THE SAME', 'OTHER~ELSE'],
    es: ['ESTE~ESTO', 'EL MISMO', 'OTRO']
  },
  quantifiers: {
    en: ['ONE', 'TWO', 'SOME', 'ALL', 'MUCH~MANY', 'LITTLE~FEW'],
    es: ['UNO', 'DOS', 'ALGUNOS', 'TODO~TODOS', 'MUCHO~MUCHOS', 'POCO~POCOS']
  },
  evaluators: {
    en: ['GOOD', 'BAD'],
    es: ['BUENO', 'MALO']
  },
  descriptors: {
    en: ['BIG', 'SMALL'],
    es: ['GRANDE', 'PEQUEÑO']
  },
  mental_predicates: {
    en: ['THINK', 'KNOW', 'WANT', "DON'T WANT", 'FEEL', 'SEE', 'HEAR'],
    es: ['PENSAR', 'SABER', 'QUERER', 'NO QUERER', 'SENTIR', 'VER', 'OÍR']
  },
  speech: {
    en: ['SAY', 'WORDS', 'TRUE'],
    es: ['DECIR', 'PALABRAS', 'VERDAD']
  },
  actions_events_movement: {
    en: ['DO', 'HAPPEN', 'MOVE'],
    es: ['HACER', 'PASAR~OCURRIR', 'MOVER~MOVERSE']
  },
  existence_possession: {
    en: ['BE (THERE IS)', 'HAVE'],
    es: ['HAY~ESTAR', 'TENER']
  },
  life_death: {
    en: ['LIVE', 'DIE'],
    es: ['VIVIR', 'MORIR']
  },
  time: {
    en: ['WHEN~TIME', 'NOW', 'BEFORE', 'AFTER', 'A LONG TIME', 'A SHORT TIME', 'FOR SOME TIME', 'MOMENT'],
    es: ['CUÁNDO~TIEMPO', 'AHORA', 'ANTES', 'DESPUÉS', 'MUCHO TIEMPO', 'POCO TIEMPO', 'POR UN TIEMPO', 'MOMENTO']
  },
  space: {
    en: ['WHERE~PLACE', 'HERE', 'ABOVE', 'BELOW~UNDER', 'FAR', 'NEAR', 'SIDE', 'INSIDE', 'TOUCH'],
    es: ['DÓNDE~LUGAR', 'AQUÍ', 'ARRIBA~ENCIMA', 'ABAJO~DEBAJO', 'LEJOS', 'CERCA', 'LADO', 'DENTRO', 'TOCAR']
  },
  logical_concepts: {
    en: ['NOT', 'MAYBE', 'CAN', 'BECAUSE', 'IF'],
    es: ['NO', 'QUIZÁS~TAL VEZ', 'PODER', 'PORQUE', 'SI']
  },
  intensifier_augmentor: {
    en: ['VERY', 'MORE'],
    es: ['MUY', 'MÁS']
  },
  similarity: {
    en: ['LIKE~AS~WAY'],
    es: ['COMO~ASÍ']
  }
};

/** Get flat list of NSM primes for a given language key */
export const getNSMPrimes = (langKey: 'en' | 'es'): string[] => {
  return Object.values(VOCAB_NSM).flatMap(cat => cat[langKey]);
};
