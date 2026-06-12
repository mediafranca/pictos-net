/**
 * Sequence PDF export — Letter landscape, 2×2 grid.
 * Each cell: step number + utterance above, pictogram below.
 * Only steps with state === 'complete' and a resolved RowData are rendered.
 */

import { jsPDF } from 'jspdf';
import type { Sequence, Step, RowData } from '../types';

// ---------- Layout constants (millimetres) ----------

const PAGE_W_MM = 279.4;   // Letter landscape
const PAGE_H_MM = 215.9;

const MARGIN_MM = 12;
const GUTTER_MM = 8;
const COLS = 2;
const ROWS_PER_PAGE = 2;

// Derived cell dimensions
const PRINTABLE_W_MM = PAGE_W_MM - 2 * MARGIN_MM;
const PRINTABLE_H_MM = PAGE_H_MM - 2 * MARGIN_MM;
const CELL_W_MM = (PRINTABLE_W_MM - (COLS - 1) * GUTTER_MM) / COLS;       // ~123.7mm
const CELL_H_MM = (PRINTABLE_H_MM - (ROWS_PER_PAGE - 1) * GUTTER_MM) / ROWS_PER_PAGE; // ~95.95mm

const CELL_PAD_MM = 4;
const LABEL_FONT_SIZE_PT = 10;
const LABEL_LINE_HEIGHT_FACTOR = 1.3;
const CUT_GUIDE_GREY = 180;
const CUT_GUIDE_STROKE_MM = 0.2;

// Pictogram area height: cell minus top-padding, label text area, bottom padding
const LABEL_AREA_MM = 14; // reserve for position number + utterance
const PICTO_H_MM = CELL_H_MM - 2 * CELL_PAD_MM - LABEL_AREA_MM;
const PICTO_W_MM = CELL_W_MM - 2 * CELL_PAD_MM;

const PDF_FONT_NAME = 'Lexend';
const PDF_FONT_FILE = 'Lexend.ttf';
const PDF_FONT_URL = '/fonts/Lexend.ttf';
const MM_PER_INCH = 25.4;
const TARGET_DPI = 200;

// ---------- Helpers ----------

const mmToPt = (mm: number) => (mm * 72) / MM_PER_INCH;
const ptToMm = (pt: number) => (pt * MM_PER_INCH) / 72;
const upper = (s: string): string => (s || '').toLocaleUpperCase();

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

let cachedFontBase64: string | null = null;
async function loadLexendBase64(): Promise<string> {
  if (cachedFontBase64) return cachedFontBase64;
  const res = await fetch(PDF_FONT_URL);
  if (!res.ok) throw new Error(`Failed to load Lexend font (${res.status})`);
  const buf = await res.arrayBuffer();
  cachedFontBase64 = arrayBufferToBase64(buf);
  return cachedFontBase64;
}

async function registerLexend(doc: jsPDF): Promise<void> {
  const b64 = await loadLexendBase64();
  doc.addFileToVFS(PDF_FONT_FILE, b64);
  doc.addFont(PDF_FONT_FILE, PDF_FONT_NAME, 'normal');
  doc.setFont(PDF_FONT_NAME, 'normal');
}

async function rasterizeSvg(svgString: string, widthPx: number, heightPx: number): Promise<string> {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG rasterisation failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.drawImage(img, 0, 0, widthPx, heightPx);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- Types ----------

export interface SequenceCell {
  step: Step;
  row: RowData;
}

// ---------- Main export ----------

export async function exportSequenceToPdf(
  sequence: Sequence,
  libraryRows: RowData[],
): Promise<Blob> {
  // Only complete steps with a matched row
  const cells: SequenceCell[] = sequence.steps
    .filter(s => s.state === 'complete' && s.rowId)
    .map(s => {
      const row = libraryRows.find(r => r.id === s.rowId);
      return row ? { step: s, row } : null;
    })
    .filter((c): c is SequenceCell => c !== null);

  if (cells.length === 0) throw new Error('No complete steps to export');

  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'landscape' });
  await registerLexend(doc);

  const pictoWidthPx = Math.round((PICTO_W_MM / MM_PER_INCH) * TARGET_DPI);
  const pictoHeightPx = Math.round((PICTO_H_MM / MM_PER_INCH) * TARGET_DPI);

  const labelLineHeightMm = ptToMm(LABEL_FONT_SIZE_PT) * LABEL_LINE_HEIGHT_FACTOR;

  const CELLS_PER_PAGE = COLS * ROWS_PER_PAGE;
  const totalPages = Math.ceil(cells.length / CELLS_PER_PAGE);

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) doc.addPage();

    const pageCells = cells.slice(pageIdx * CELLS_PER_PAGE, (pageIdx + 1) * CELLS_PER_PAGE);

    for (let cellIdx = 0; cellIdx < pageCells.length; cellIdx++) {
      const { step, row } = pageCells[cellIdx];
      const col = cellIdx % COLS;
      const rowInPage = Math.floor(cellIdx / COLS);

      const cellX = MARGIN_MM + col * (CELL_W_MM + GUTTER_MM);
      const cellY = MARGIN_MM + rowInPage * (CELL_H_MM + GUTTER_MM);

      // Cut guide
      doc.setDrawColor(CUT_GUIDE_GREY, CUT_GUIDE_GREY, CUT_GUIDE_GREY);
      doc.setLineWidth(CUT_GUIDE_STROKE_MM);
      doc.rect(cellX, cellY, CELL_W_MM, CELL_H_MM);

      // Label (position number + utterance) — at top of cell
      doc.setFont(PDF_FONT_NAME, 'normal');
      doc.setFontSize(LABEL_FONT_SIZE_PT);
      doc.setTextColor(40, 40, 40);

      const labelText = upper(`${step.position}. ${step.utterance ?? ''}`);
      const labelLines = doc.splitTextToSize(labelText, PICTO_W_MM) as string[];
      const labelBaselineY = cellY + CELL_PAD_MM + ptToMm(LABEL_FONT_SIZE_PT) * 0.9;
      labelLines.slice(0, 2).forEach((line, i) => {
        doc.text(line, cellX + CELL_W_MM / 2, labelBaselineY + i * labelLineHeightMm, { align: 'center' });
      });

      // Pictogram — below the label
      const pictoY = cellY + CELL_PAD_MM + LABEL_AREA_MM;

      const svgString = row.structuredSvg || row.rawSvg;
      let pngDataUrl: string;
      if (svgString) {
        pngDataUrl = await rasterizeSvg(svgString, pictoWidthPx, pictoHeightPx);
      } else if (row.bitmap) {
        pngDataUrl = row.bitmap;
      } else {
        continue;
      }

      const pictoX = cellX + CELL_PAD_MM;
      doc.addImage(pngDataUrl, 'PNG', pictoX, pictoY, PICTO_W_MM, PICTO_H_MM, undefined, 'FAST');
    }
  }

  return doc.output('blob');
}

export function sequencePdfFilename(sequence: Sequence): string {
  const safe = (sequence.name || 'secuencia')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 40)
    .toLowerCase();
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${safe}_${yyyy}-${mm}-${dd}.pdf`;
}
