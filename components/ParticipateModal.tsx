import React from 'react';
import { X, Mail } from 'lucide-react';
import { TFunc } from '../types';

interface ParticipateModalProps {
  t: TFunc;
  onClose: () => void;
}

const ParticipateModal: React.FC<ParticipateModalProps> = ({ t, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 relative overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-900">{t('participate.title')}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 text-slate-600 space-y-4 text-sm leading-relaxed">
          <p>{t('participate.intro')}</p>
          <div className="bg-violet-50 text-violet-800 p-4 rounded-lg border border-violet-100">
            <p className="font-medium mb-1">{t('participate.shareLibrary')}</p>
            <p className="text-violet-600 mb-3">{t('participate.shareInstructions')}</p>
            <a 
              href="mailto:herbert.spencer@aut.ac.nz?subject=PICTOS.net%20Library%20Share"
              className="inline-flex items-center gap-2 bg-white text-violet-700 font-medium px-4 py-2 rounded shadow-sm hover:shadow hover:bg-violet-50 transition-all text-xs"
            >
              <Mail size={14} /> herbert.spencer@aut.ac.nz
            </a>
          </div>
          <p>{t('participate.research')}</p>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-5 py-4 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium rounded-lg transition-colors"
          >
            {t('actions.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ParticipateModal;
