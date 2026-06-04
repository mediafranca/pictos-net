/**
 * Row artifact accessors that respect the discard model.
 *
 * A row carries up to three artifacts — `bitmap`, `rawSvg`, `structuredSvg` —
 * each shadowed by a `*Discarded` boolean. A discarded artifact is preserved
 * on disk and in memory (telemetry, research, undo), but it is NOT considered
 * valid by anything user-facing: the UI hides it, the PDF skips it,
 * eligibility predicates treat it as absent.
 *
 * Persistence / hydration code (IndexedDB read/write, library import/export,
 * JSON serialisation) must read the raw fields directly — those paths must
 * preserve everything.
 *
 * Everywhere else (display, eligibility, export, counts), use these helpers.
 */

import type { RowData } from '../types';

export const validBitmap = (row: RowData): string | undefined =>
  row.bitmapDiscarded ? undefined : row.bitmap;

export const validRawSvg = (row: RowData): string | undefined =>
  row.rawSvgDiscarded ? undefined : row.rawSvg;

export const validStructuredSvg = (row: RowData): string | undefined =>
  row.structuredSvgDiscarded ? undefined : row.structuredSvg;

/** The most-downstream valid SVG: structured first, then raw. */
export const validDownstreamSvg = (row: RowData): string | undefined =>
  validStructuredSvg(row) || validRawSvg(row);

/**
 * The most-downstream valid artifact of any kind. Mirrors the priority
 * used by the grid view and the PDF picker:
 *   structured (svg) > raw (svg) > bitmap (png)
 */
export const validDownstreamArtifact = (
  row: RowData,
): { kind: 'estructurado' | 'trazado' | 'bitmap'; data: string } | undefined => {
  const s = validStructuredSvg(row);
  if (s) return { kind: 'estructurado', data: s };
  const r = validRawSvg(row);
  if (r) return { kind: 'trazado', data: r };
  const b = validBitmap(row);
  if (b) return { kind: 'bitmap', data: b };
  return undefined;
};

export const hasValidBitmap = (row: RowData): boolean => !!validBitmap(row);
export const hasValidRawSvg = (row: RowData): boolean => !!validRawSvg(row);
export const hasValidStructuredSvg = (row: RowData): boolean => !!validStructuredSvg(row);

export const hasAnyValidArtifact = (row: RowData): boolean =>
  hasValidBitmap(row) || hasValidRawSvg(row) || hasValidStructuredSvg(row);

export const hasAnyValidSvg = (row: RowData): boolean =>
  hasValidRawSvg(row) || hasValidStructuredSvg(row);
