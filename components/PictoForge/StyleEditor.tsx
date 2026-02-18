import React from 'react';
import { StyleEditor as NewStyleEditor } from '../../lib/style-editor/lib/StyleEditor';
import { GlobalConfig } from '../../types';
import { X } from 'lucide-react';

interface StyleEditorProps {
    config: GlobalConfig;
    onUpdateConfig: (newConfig: GlobalConfig) => void;
    onClose: () => void;
}

export const StyleEditor: React.FC<StyleEditorProps> = ({ config, onUpdateConfig, onClose }) => {
    return (
        <div className="fixed inset-0 z-[60] bg-white flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <button
                onClick={onClose}
                className="absolute top-4 right-4 z-50 p-2 bg-white/80 hover:bg-white rounded-full shadow-md text-slate-500 hover:text-red-500 transition-colors border border-slate-200"
                title="Close Editor"
            >
                <X size={24} />
            </button>
            <div className="flex-1 overflow-hidden relative">
                <NewStyleEditor
                    hideHeader={false}
                />
            </div>
        </div>
    );
};
