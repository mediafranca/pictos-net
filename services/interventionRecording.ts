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
  InterventionContext,
  RowInterventionLog,
} from '../types';

const isRecordingEnabled = (config: GlobalConfig): boolean =>
  config.recording?.enabled !== false;

const getLog = (row: RowData): RowInterventionLog =>
  row.interventionLog ?? { sessions: [] };

const getActiveSession = (log: RowInterventionLog): InterventionSession | null => {
  const last = log.sessions[log.sessions.length - 1];
  return last && !last.endedAt ? last : null;
};

const buildContext = (config: GlobalConfig, modelId?: string): InterventionContext => ({
  lang: config.lang,
  geoContext: config.geoContext,
  uiLang: config.uiLang,
  ...(modelId ? { modelId } : {}),
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
    phase: args.phase,
    kind: 'edit',
    at: new Date().toISOString(),
    before: cloneSnapshot(args.before),
    after: cloneSnapshot(args.after),
    context: buildContext(config, args.modelId),
    ...(args.op ? { op: args.op } : {}),
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
    phase: args.phase,
    kind: 'discard',
    at: new Date().toISOString(),
    before: cloneSnapshot(args.before),
    context: buildContext(config, args.modelId),
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

// === Inspection helpers ===

export const hasActiveSession = (row: RowData): boolean =>
  getActiveSession(getLog(row)) !== null;

export const sessionCount = (row: RowData): number =>
  row.interventionLog?.sessions.length ?? 0;

export const eventCount = (row: RowData): number =>
  row.interventionLog?.sessions.reduce((sum, s) => sum + s.events.length, 0) ?? 0;
