import React from 'react';
import { FileText, X } from 'lucide-react';
import type { PdfProgress } from '../services/pdfExportService';

interface Props {
  progress: PdfProgress | null;
  t: (key: string, params?: Record<string, string | number>) => string;
  onCancel: () => void;
}

/**
 * Blocking progress modal for the PDF export. See specs/pdf-export.allium —
 * surface PDFExportProgressModal. The modal is owned by the caller and is
 * mounted while a PdfExport is in flight; the caller unmounts it on
 * complete / cancelled / failed.
 */
export const PDFExportModal: React.FC<Props> = ({ progress, t, onCancel }) => {
  const phase = progress?.phase ?? 'preparing';
  const total = progress?.totalCells ?? 0;
  const rendered = progress?.renderedCells ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((rendered / total) * 100)) : 0;
  const pageLabel = progress && progress.totalPages > 0
    ? t('pdfExport.progress', { page: progress.currentPage, total: progress.totalPages })
    : t('pdfExport.preparing');
  const itemLabel = phase === 'rendering' && progress && progress.currentUtterance
    ? t('pdfExport.currentItem', {
        n: Math.min(rendered + 1, total),
        total,
        utterance: progress.currentUtterance,
      })
    : '';

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-export-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg w-[92vw] max-w-[480px] shadow-2xl">
        <div className="px-6 pt-5 pb-4 flex items-center gap-3 border-b border-slate-100">
          <FileText size={20} className="text-violet-700" aria-hidden="true" />
          <h2 id="pdf-export-modal-title" className="text-sm font-bold text-slate-800 flex-1">
            {t('pdfExport.title')}
          </h2>
        </div>

        <div className="px-6 py-5">
          <div className="flex justify-between text-xs text-slate-500 mb-2 tabular-nums">
            <span>{pageLabel}</span>
            <span>{rendered} / {total}</span>
          </div>

          <div
            className="w-full h-2 bg-slate-100 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={rendered}
          >
            <div
              className="h-full bg-violet-500 transition-all duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>

          {itemLabel && (
            <p className="mt-4 text-xs text-slate-600 truncate" title={itemLabel}>
              {itemLabel}
            </p>
          )}
        </div>

        <div className="px-6 pb-5 flex justify-end">
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-700 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-md transition-colors"
          >
            <X size={14} aria-hidden="true" />
            {t('pdfExport.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PDFExportModal;
