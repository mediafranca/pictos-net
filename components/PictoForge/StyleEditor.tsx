import React from 'react';
import { StyleEditor as NewStyleEditor } from '../../lib/style-editor/lib/StyleEditor';
import type { StyleDefinition, KeyframeDefinition } from '../../lib/style-editor/lib/types';
import { INITIAL_STYLES } from '../../lib/style-editor/lib/constants';
import { INITIAL_KEYFRAMES } from '../../lib/style-editor/lib/keyframeConstants';
import { GlobalConfig } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';
import { X, Download } from 'lucide-react';
import { generateCssString } from '../../lib/style-editor/lib/utils/cssGenerator';

interface StyleEditorProps {
    config: GlobalConfig;
    onUpdateConfig: (newConfig: GlobalConfig) => void;
    onClose: () => void;
}

export const StyleEditor: React.FC<StyleEditorProps> = ({ config, onUpdateConfig, onClose }) => {
    const { t } = useTranslation();

    const handleStylesChange = (styles: StyleDefinition[]) => {
        onUpdateConfig({ ...config, svgStyleDefs: styles });
    };

    const handleKeyframesChange = (keyframes: KeyframeDefinition[]) => {
        onUpdateConfig({ ...config, svgKeyframes: keyframes });
    };

    const handleExportCss = () => {
        const styles = config.svgStyleDefs ?? INITIAL_STYLES;
        const keyframes = config.svgKeyframes ?? INITIAL_KEYFRAMES;
        const css = generateCssString(styles, keyframes);
        const blob = new Blob([css], { type: 'text/css' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'svg-styles.css';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 z-[60] bg-white flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Modal header — no pt-10 gap, fully i18n */}
            <header className="flex-none h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-20">
                <div>
                    <h2 className="text-base font-bold text-gray-900 leading-none">{t('styleEditor.title')}</h2>
                    <span className="text-[10px] text-gray-400">{t('styleEditor.subtitle')}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExportCss}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded border border-gray-200 transition-colors"
                        title={t('styleEditor.exportCss')}
                    >
                        <Download size={13} /> {t('styleEditor.exportCss')}
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-red-500 transition-colors"
                        title={t('styleEditor.close')}
                    >
                        <X size={20} />
                    </button>
                </div>
            </header>

            {/* Style editor content — lib header hidden, we provide our own */}
            <div className="flex-1 overflow-hidden relative">
                <NewStyleEditor
                    initialStyles={config.svgStyleDefs ?? INITIAL_STYLES}
                    initialKeyframes={config.svgKeyframes ?? INITIAL_KEYFRAMES}
                    onStylesChange={handleStylesChange}
                    onKeyframesChange={handleKeyframesChange}
                    hideHeader={true}
                    hideExport={true}
                />
            </div>
        </div>
    );
};
