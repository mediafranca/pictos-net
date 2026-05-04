// Intervention recording service
// See specs/intervention-recording.allium

import {
  RowData,
  GlobalConfig,
  InterventionPhase,
  InterventionEventKind,
  ElementOpKind,
  InterventionEvent,
  InterventionSession,
  RowInterventionLog,
  SvgMetrics,
  RowClipboardContext,
} from '../types';

const isRecordingEnabled = (config: GlobalConfig): boolean =>
  config.recording?.enabled !== false;

const getLog = (row: RowData): RowInterventionLog =>
  row.interventionLog ?? { sessions: [] };

const getActiveSession = (log: RowInterventionLog): InterventionSession | null => {
  const last = log.sessions[log.sessions.length - 1];
  return last && !last.endedAt ? last : null;
};

/**
 * Generate a stable short event id (8 hex chars). Uses crypto.getRandomValues
 * when available; falls back to Math.random for tests / older environments.
 */
const newEventId = (): string => {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 4; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Build the portability header for a row that leaves its containing
 * library (e.g. "Copy Row" → clipboard). Inside a library export this
 * function is NOT called — events do not carry context.
 * See specs/intervention-recording.allium § CopyRowToClipboard.
 */
export const buildClipboardContext = (config: GlobalConfig): RowClipboardContext => ({
  lang: config.lang,
  uiLang: config.uiLang,
  geoContext: config.geoContext,
});

const cloneSnapshot = <T>(value: T): T => {
  if (value === undefined || value === null) return value;
  // structuredClone is widely supported; fall back to JSON for portability.
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const valuesEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

const updateLog = (row: RowData, log: RowInterventionLog): RowData => ({
  ...row,
  interventionLog: log,
});

const appendEvent = (row: RowData, event: InterventionEvent): RowData => {
  const log = getLog(row);
  const active = getActiveSession(log);
  if (!active) return row;
  const updatedSession: InterventionSession = {
    ...active,
    events: [...active.events, event],
  };
  const sessions = log.sessions.slice(0, -1).concat(updatedSession);
  return updateLog(row, { sessions });
};

// === Session lifecycle ===

export const startSession = (row: RowData, config: GlobalConfig): RowData => {
  if (!isRecordingEnabled(config)) return row;
  const log = getLog(row);
  if (getActiveSession(log)) return row; // SingleActiveSessionPerRow
  const session: InterventionSession = {
    startedAt: new Date().toISOString(),
    events: [],
  };
  return updateLog(row, { sessions: [...log.sessions, session] });
};

export const endSession = (row: RowData): RowData => {
  const log = getLog(row);
  const active = getActiveSession(log);
  if (!active) return row;
  // Drop empty sessions at close — they are noise (the participant
  // engaged the row, made no recordable change, and disengaged).
  // See specs/intervention-recording.allium § DropEmptySessionsAtEnd.
  if (active.events.length === 0) {
    const sessions = log.sessions.slice(0, -1);
    return updateLog(row, { sessions });
  }
  const closed: InterventionSession = { ...active, endedAt: new Date().toISOString() };
  const sessions = log.sessions.slice(0, -1).concat(closed);
  return updateLog(row, { sessions });
};

// === Event capture ===

interface RecordEditArgs {
  phase: InterventionPhase;
  before: unknown;
  after: unknown;
  op?: ElementOpKind;
  modelId?: string;
}

export const recordEdit = (
  row: RowData,
  config: GlobalConfig,
  args: RecordEditArgs
): RowData => {
  if (!isRecordingEnabled(config)) return row;
  if (!getActiveSession(getLog(row))) return row;
  if (valuesEqual(args.before, args.after)) return row;
  if (args.phase === 'elements' && !args.op) return row; // EditOnElementsHasOp
  const event: InterventionEvent = {
    id: newEventId(),
    phase: args.phase,
    kind: 'edit',
    at: new Date().toISOString(),
    before: cloneSnapshot(args.before),
    after: cloneSnapshot(args.after),
    ...(args.op ? { op: args.op } : {}),
    ...(args.modelId ? { modelId: args.modelId } : {}),
  };
  return appendEvent(row, event);
};

interface RecordDiscardArgs {
  phase: InterventionPhase;
  before: unknown;
  modelId?: string;
}

export const recordDiscard = (
  row: RowData,
  config: GlobalConfig,
  args: RecordDiscardArgs
): RowData => {
  if (!isRecordingEnabled(config)) return row;
  if (!getActiveSession(getLog(row))) return row;
  if (args.before === undefined || args.before === null || args.before === '') return row;
  const event: InterventionEvent = {
    id: newEventId(),
    phase: args.phase,
    kind: 'discard',
    at: new Date().toISOString(),
    before: cloneSnapshot(args.before),
    ...(args.modelId ? { modelId: args.modelId } : {}),
  };
  return appendEvent(row, event);
};

// === User-driven CRUD on the log (RowAuditPanel) ===

export const replaceLog = (row: RowData, log: RowInterventionLog): RowData =>
  updateLog(row, log);

export const clearLog = (row: RowData): RowData => {
  if (!row.interventionLog || row.interventionLog.sessions.length === 0) return row;
  return updateLog(row, { sessions: [] });
};

// === SVG metrics for svg_raw / svg_structured events ===

const SVG_ENTITY_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'g']);

// FNV-1a 32-bit. Non-cryptographic; we only need a short fingerprint
// that changes when the underlying string changes.
const fnv1a = (str: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

/**
 * Compute the lightweight SvgMetrics summary of an SVG string. No copy
 * of the SVG content is retained — only the metrics object is returned.
 * See specs/intervention-recording.allium § SvgMetrics.
 */
export const computeSvgMetrics = (svg: string | undefined | null): SvgMetrics | null => {
  if (!svg || !svg.trim()) return null;
  const size = svg.length;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return null;
  } catch {
    return null;
  }
  const root = doc.documentElement;
  let entities = 0;
  const classSet = new Set<string>();
  const dStrings: string[] = [];
  const walk = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    if (SVG_ENTITY_TAGS.has(tag)) entities++;
    const cls = el.getAttribute('class');
    if (cls) cls.split(/\s+/).filter(Boolean).forEach(c => classSet.add(c));
    if (tag === 'path') {
      const d = el.getAttribute('d');
      if (d) dStrings.push(d);
    }
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(root);
  return {
    size,
    entities,
    classes: Array.from(classSet).sort(),
    structuralHash: fnv1a(dStrings.join('|')),
  };
};

const metricsEqual = (a: SvgMetrics, b: SvgMetrics): boolean =>
  a.size === b.size &&
  a.entities === b.entities &&
  a.structuralHash === b.structuralHash &&
  a.classes.length === b.classes.length &&
  a.classes.every((c, i) => c === b.classes[i]);

interface RecordSvgEditArgs {
  phase: 'svg_raw' | 'svg_structured';
  before: SvgMetrics;
  after: SvgMetrics;
}

/**
 * Append a svg_raw / svg_structured edit event with metrics before/after.
 * Returns the row unchanged if the metrics are equal (no-op session) or
 * if no active session exists.
 */
export const recordSvgEdit = (
  row: RowData,
  config: GlobalConfig,
  args: RecordSvgEditArgs
): RowData => {
  if (!isRecordingEnabled(config)) return row;
  if (!getActiveSession(getLog(row))) return row;
  if (metricsEqual(args.before, args.after)) return row;
  const event: InterventionEvent = {
    id: newEventId(),
    phase: args.phase,
    kind: 'edit',
    at: new Date().toISOString(),
    before: args.before,
    after: args.after,
  };
  return appendEvent(row, event);
};

interface RecordSvgDiscardArgs {
  phase: 'svg_raw' | 'svg_structured';
  before: SvgMetrics;
  modelId?: string;
}

/**
 * Append a svg_raw / svg_structured discard event with the metrics of
 * the artifact being thrown away (e.g. by VTracer re-trace or Re-Estructurar).
 */
export const recordSvgDiscard = (
  row: RowData,
  config: GlobalConfig,
  args: RecordSvgDiscardArgs
): RowData => {
  if (!isRecordingEnabled(config)) return row;
  if (!getActiveSession(getLog(row))) return row;
  const event: InterventionEvent = {
    id: newEventId(),
    phase: args.phase,
    kind: 'discard',
    at: new Date().toISOString(),
    before: args.before,
    ...(args.modelId ? { modelId: args.modelId } : {}),
  };
  return appendEvent(row, event);
};

// === Inspection helpers ===

export const hasActiveSession = (row: RowData): boolean =>
  getActiveSession(getLog(row)) !== null;

export const sessionCount = (row: RowData): number =>
  row.interventionLog?.sessions.length ?? 0;

export const eventCount = (row: RowData): number =>
  row.interventionLog?.sessions.reduce((sum, s) => sum + s.events.length, 0) ?? 0;
