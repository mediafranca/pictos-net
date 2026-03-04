
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import JSZip from 'jszip';
import {
  Upload, Download, Trash2, Terminal, RefreshCw, ChevronDown,
  Play, BookOpen, Search, FileDown, Square, Settings,
  X, Code, Plus, FileText, Maximize, Copy, BrainCircuit, PlusCircle, CornerDownRight, Image as ImageIcon,
  Library, ScreenShare, Globe, HelpCircle, CheckCircle, ExternalLink, Palette, GripVertical, ImageUp, Edit,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { RowData, LogEntry, StepStatus, NLUData, GlobalConfig, VOCAB, VisualElement, NLUFrameRole } from './types';
import * as Gemini from './services/geminiService';
import { useTranslation } from './hooks/useTranslation';
import { useDialogA11y } from './hooks/useDialogA11y';
import type { Locale } from './locales';
import { SVGGenerator } from './components/SVGGenerator';
import useSVGLibrary from './hooks/useSVGLibrary';
import { StyleEditor } from './components/PictoForge/StyleEditor';
import { GeoAutocomplete } from './components/GeoAutocomplete';
import * as IndexedDBService from './services/indexedDBService';
import { INITIAL_STYLES } from './lib/style-editor/lib/constants';
import { INITIAL_KEYFRAMES } from './lib/style-editor/lib/keyframeConstants';
import packageJson from './package.json';
import { SVGEditorModal } from './components/SVGEditor/SVGEditorModal';
import { VectorizerModal } from './components/VectorizerModal';
import type { VectorizerResult } from './services/vtracerService';
import { injectSvgA11y } from './utils/svgAccessibility';


const STORAGE_KEY = 'pictonet_v19_storage';
const CONFIG_KEY = 'pictonet_v19_config';
const APP_VERSION = packageJson.version;

interface LibraryMetadata {
  filename: string;
  name: string;
  location: string;
  language: string;
  items: number;
  description?: string;
}

// Helper function to ensure elements is always a valid array
const ensureElementsArray = (elements: any): VisualElement[] => {
  if (Array.isArray(elements)) {
    return elements;
  }
  console.warn('[VALIDATION] Invalid elements type, returning empty array:', typeof elements, elements);
  return [];
};

// Helper function to sanitize filename for downloads
const sanitizeFilename = (text: string, maxLength: number = 30): string => {
  return text
    .normalize('NFD') // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]/gi, '_') // Replace non-alphanumeric with underscore
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, '') // Remove leading/trailing underscores
    .substring(0, maxLength)
    .toLowerCase();
};

const LogoIcon = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 45.9 45.9" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style>{`.st0 { fill: #40069e; }`}</style>
    </defs>
    <circle className="st0" cx="23.9" cy="17.8" r="3.1" />
    <path className="st0" d="M23.6,4c-9.4,0-17.1,6.3-17.1,14.1s0,0,0,0c0,0,0,0,0,0v19.7c0,2.1,1.7,3.9,3.9,3.9h1.6c2.1,0,3.9-1.7,3.9-3.9v-7.3c2.3,1,4.9,1.5,7.7,1.5,9.4,0,17.1-6.3,17.1-14.1S33,4,23.6,4ZM23.9,24.5c-6.4,0-9.2-6.4-9.2-6.4,0,0,2.8-6.4,9.2-6.4s9.2,6.4,9.2,6.4c0,0-2.8,6.4-9.2,6.4Z" />
  </svg>
);


const SearchComponent: React.FC<{
  rows: RowData[];
  searchValue: string;
  onSearchChange: (value: string) => void;
  onAddNewRow: (utterance: string) => void;
  isFocused: boolean;
  setIsFocused: (isFocused: boolean) => void;
}> = ({ rows, searchValue, onSearchChange, onAddNewRow, isFocused, setIsFocused }) => {
  const { t } = useTranslation();
  const suggestions = useMemo(() => {
    if (!searchValue) return [];
    return rows.filter(r => r.UTTERANCE.toLowerCase().includes(searchValue.toLowerCase()));
  }, [rows, searchValue]);

  const showSuggestions = isFocused && searchValue.length > 0;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchValue.trim().length > 0 && suggestions.length === 0) {
      e.preventDefault();
      onAddNewRow(searchValue);
    }
  };

  return (
    <div className="relative">
      <div className={`flex items-center bg-slate-100 px-4 py-2 border-2 transition-all ${isFocused ? 'border-violet-950 bg-white shadow-lg' : 'border-transparent'}`}>
        <Search size={18} className="text-slate-500" />
        <input
          value={searchValue}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('search.placeholder')}
          className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-sm font-bold ml-2"
        />
      </div>
      {showSuggestions && (
        <div className="absolute top-full mt-2 w-full bg-white border border-slate-200 shadow-xl z-50 max-h-80 overflow-y-auto animate-in fade-in duration-100">
          {suggestions.length > 0 ? (
            suggestions.map(row => (
              <div
                key={row.id}
                className="p-3 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer"
                onMouseDown={() => onSearchChange(row.UTTERANCE)}
              >
                {row.UTTERANCE}
              </div>
            ))
          ) : (
            <div
              className="p-4 text-sm text-violet-700 bg-violet-50 hover:bg-violet-100 cursor-pointer flex items-center gap-3 font-medium"
              onMouseDown={() => onAddNewRow(searchValue)}
            >
              <PlusCircle size={18} />
              {t('search.createNew', { query: searchValue })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};


const FieldLabel: React.FC<{ label: string; tooltip: string }> = ({ label, tooltip }) => (
  <label className="text-xs font-medium uppercase text-slate-500 mb-2 flex items-center gap-1">
    {label}
    <div className="group/tooltip relative">
      <HelpCircle size={10} className="text-slate-500 hover:text-violet-600 cursor-help" />
      <div className="invisible group-hover/tooltip:visible absolute left-0 bottom-full mb-2 w-64 bg-slate-900 text-white text-xs p-2 rounded shadow-lg z-[56] leading-relaxed">
        {tooltip}
      </div>
    </div>
  </label>
);

const App: React.FC = () => {
  const { t, lang, setLang } = useTranslation();
  const { svgs, exportSVGs, importSVGs, clearLibrary, addSVG } = useSVGLibrary();
  const [rows, setRows] = useState<RowData[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showLibraryMenu, setShowLibraryMenu] = useState(false);
  const [libraryMenuPos, setLibraryMenuPos] = useState({ top: 0, left: 0 });
  const libraryBtnRef = useRef<HTMLDivElement>(null);
  const [searchValue, setSearchValue] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const scrollToRowRef = useRef<string | null>(null);
  const [viewMode, setViewMode] = useState<'home' | 'list'>('home');
  const [sortBy, setSortBy] = useState<'alphabetical' | 'completeness'>('alphabetical');
  const [config, setConfig] = useState<GlobalConfig>({
    lang: 'es-419',
    aspectRatio: '1:1',
    imageModel: 'flash',
    author: 'PICTOS.NET',
    credits: '',
    license: 'CC BY 4.0',
    visualStylePrompt: "Siluetas sobre un fondo blanco plano. Sin degradados, sin sombras, sin texturas y sin contornos. Geometría: Usa trazos gruesos y consistentes y simplificación geométrica. Todas las extremidades y terminales deben tener puntas redondeadas y vértices suavizados. Composición: Representación plana 2D centrada. Usa el espacio negativo (blanco) para definir la separación interna entre formas negras superpuestas (por ejemplo, el espacio entre una cabeza y un torso). Claridad: Maximiza la legibilidad y el reconocimiento semántico a escalas pequeñas. Evita cualquier rasgo facial o detalles intrincados. Usa color solo en el elemento distintivo, si es necesario.",
    geoContext: { lat: '40.4168', lng: '-3.7038', region: 'Madrid, ES' },
    annotatedContext: '',
    svgStyleDefs: INITIAL_STYLES,
    svgKeyframes: INITIAL_KEYFRAMES,
  });
  const [focusMode, setFocusMode] = useState<{ step: 'nlu' | 'visual' | 'bitmap' | 'eval', rowId: string } | null>(null);
  const [showStyleEditor, setShowStyleEditor] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(() => {
    const stored = localStorage.getItem('pictonet_reduce_motion');
    return stored === null ? true : stored === 'true';
  });
  const [highContrast, setHighContrast] = useState(() => {
    return localStorage.getItem('pictonet_high_contrast') === 'true';
  });
  const [statusAnnouncement, setStatusAnnouncement] = useState('');

  const announce = useCallback((msg: string) => {
    setStatusAnnouncement(msg);
    setTimeout(() => setStatusAnnouncement(''), 5000);
  }, []);

  useEffect(() => {
    localStorage.setItem('pictonet_reduce_motion', String(reduceMotion));
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);
  useEffect(() => {
    localStorage.setItem('pictonet_high_contrast', String(highContrast));
    document.documentElement.classList.toggle('high-contrast', highContrast);
  }, [highContrast]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [availableLibraries, setAvailableLibraries] = useState<LibraryMetadata[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { }
  });
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [loadingLibraryName, setLoadingLibraryName] = useState('');
  const [svgEditorState, setSvgEditorState] = useState<{
    isOpen: boolean;
    rowId: string | null;
    svg: string | null;
    svgSource: 'raw' | 'structured' | null;
  }>({
    isOpen: false,
    rowId: null,
    svg: null,
    svgSource: null,
  });

  const [vectorizerState, setVectorizerState] = useState<{
    isOpen: boolean;
    rowId: string | null;
  }>({ isOpen: false, rowId: null });

  const closeConfirmDialog = useCallback(() => setConfirmDialog(prev => ({ ...prev, isOpen: false })), []);
  const { dialogProps: confirmDialogProps } = useDialogA11y({ isOpen: confirmDialog.isOpen, onClose: closeConfirmDialog, label: confirmDialog.title || 'Confirm' });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const appendPhrasesInputRef = useRef<HTMLInputElement>(null);
  const stopFlags = useRef<Record<string, boolean>>({});
  const autoCascadeRef = useRef<string | null>(null);

  // Sanitize row data to prevent corrupted JSON from breaking the app
  const sanitizeRow = (row: any): RowData => {
    return {
      id: row.id || `R_${Date.now()}`,
      UTTERANCE: typeof row.UTTERANCE === 'string' ? row.UTTERANCE : '',
      NLU: row.NLU,
      elements: Array.isArray(row.elements) ? row.elements : undefined,
      prompt: typeof row.prompt === 'string' ? row.prompt : undefined,
      bitmap: typeof row.bitmap === 'string' ? row.bitmap : undefined,
      rawSvg: typeof row.rawSvg === 'string' ? row.rawSvg : undefined,
      structuredSvg: typeof row.structuredSvg === 'string' ? row.structuredSvg : undefined,
      status: ['idle', 'processing', 'completed', 'error'].includes(row.status) ? row.status : 'idle',
      nluStatus: ['idle', 'processing', 'completed', 'error', 'outdated'].includes(row.nluStatus) ? row.nluStatus : 'idle',
      visualStatus: ['idle', 'processing', 'completed', 'error', 'outdated'].includes(row.visualStatus) ? row.visualStatus : 'idle',
      bitmapStatus: ['idle', 'processing', 'completed', 'error', 'outdated'].includes(row.bitmapStatus) ? row.bitmapStatus : 'idle',
      nluDuration: typeof row.nluDuration === 'number' ? row.nluDuration : undefined,
      visualDuration: typeof row.visualDuration === 'number' ? row.visualDuration : undefined,
      bitmapDuration: typeof row.bitmapDuration === 'number' ? row.bitmapDuration : undefined,
    };
  };

  useEffect(() => {
    const loadData = async () => {
      // ── Step 1: config (localStorage, synchronous) ──────────────────────────
      const savedConfig = localStorage.getItem(CONFIG_KEY);
      if (savedConfig) {
        try { setConfig(JSON.parse(savedConfig)); } catch (e) { console.error('Failed to load config', e); }
      }

      // ── Step 2: row metadata (localStorage, synchronous → instant render) ───
      // localStorage holds row metadata WITHOUT binary fields.
      // This is always fast and reliable regardless of IDB state.
      const saved = localStorage.getItem(STORAGE_KEY);
      let loadedRows: RowData[] = [];
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) loadedRows = parsed.map(sanitizeRow);
        } catch (e) { console.error('Failed to load rows from localStorage', e); }
      }

      if (loadedRows.length > 0) {
        setRows(loadedRows);
        setViewMode('list');
      }
      setIsInitialized(true);

      // ── Step 3: binary data (IndexedDB, async → merge when ready) ────────────
      // Bitmaps and SVGs are stored separately in IDB; merge them in after load.
      if (loadedRows.length > 0) {
        try {
          const [bitmapsMap, svgsMap] = await Promise.all([
            IndexedDBService.getAllBitmaps(),
            IndexedDBService.getAllSvgs(),
          ]);
          const hasBinaryData = bitmapsMap.size > 0 || svgsMap.size > 0;
          if (hasBinaryData) {
            setRows((prev: RowData[]) => prev.map((row: RowData) => ({
              ...row,
              bitmap: bitmapsMap.get(row.id) || row.bitmap,
              rawSvg: svgsMap.get(row.id)?.rawSvg || row.rawSvg,
              structuredSvg: svgsMap.get(row.id)?.structuredSvg || row.structuredSvg,
            })));
          }
        } catch (err) {
          console.error('Failed to load binary data from IndexedDB:', err);
        }
      }
    };

    loadData();
  }, []);

  // Auto-save strategy:
  //   1. FIRST: metadata → localStorage synchronously (never blocked by IDB)
  //      Always strip binary fields to stay well under the 5MB quota.
  //   2. THEN: bitmaps + SVGs → IDB fire-and-forget (non-blocking)
  //      Race condition with refresh is acceptable — IDB is a best-effort cache.
  useEffect(() => {
    if (!isInitialized) return;

    // 1. Metadata → localStorage immediately (synchronous, always runs first)
    const rowsMeta = rows.map((row: RowData) => {
      const { bitmap, rawSvg, structuredSvg, ...meta } = row;
      return meta;
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rowsMeta));
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (error) {
      console.error('[save] localStorage quota exceeded:', error);
      try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch (_) { /* */ }
    }

    // 2. Bitmaps → IDB (fire-and-forget, non-blocking)
    const bitmapEntries = rows
      .filter((row: RowData) => row.bitmap)
      .map((row: RowData) => ({ id: row.id, bitmap: row.bitmap! }));
    if (bitmapEntries.length > 0) {
      IndexedDBService.saveBitmapsBatch(bitmapEntries)
        .catch(err => console.error('[save] IDB bitmap write failed:', err));
    }

    // 3. SVGs → IDB (fire-and-forget, non-blocking)
    rows
      .filter((row: RowData) => row.rawSvg || row.structuredSvg)
      .forEach((row: RowData) => {
        IndexedDBService.saveSvgs(row.id, {
          rawSvg: row.rawSvg,
          structuredSvg: row.structuredSvg,
        }).catch(err => console.error('[save] SVG write failed:', err));
      });
  }, [rows, isInitialized, config]);

  // Load available libraries from index.json
  useEffect(() => {
    const loadLibraries = async () => {
      try {
        console.log('[LIBRARIES] Fetching index from /libraries/index.json...');
        const response = await fetch('/libraries/index.json');
        if (!response.ok) {
          console.warn('[LIBRARIES] Index not found, status:', response.status);
          setAvailableLibraries([]);
          return;
        }

        const index = await response.json();
        console.log('[LIBRARIES] Index loaded:', index);
        setAvailableLibraries(index.libraries || []);
        console.log(`[LIBRARIES] ✅ ${index.libraries.length} libraries ready to display`);
      } catch (error) {
        console.error('[LIBRARIES] Failed to load index:', error);
        setAvailableLibraries([]);
      }
    };

    loadLibraries();
  }, []);

  useEffect(() => {
    if (!openRowId || scrollToRowRef.current !== openRowId) return;
    scrollToRowRef.current = null;
    // Delay to let the row DOM render (including expanded content)
    requestAnimationFrame(() => {
      const el = document.getElementById(`picto-row-${openRowId}`);
      if (el) {
        const headerHeight = document.getElementById('toolbar')?.offsetHeight ?? 80;
        const top = el.getBoundingClientRect().top + window.scrollY - headerHeight - 16;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  }, [openRowId]);

  // Auto-cascade: when a new row with real text is added, start the pipeline
  useEffect(() => {
    const targetId = autoCascadeRef.current;
    if (!targetId) return;
    const idx = rows.findIndex(r => r.id === targetId);
    if (idx === -1) return;
    autoCascadeRef.current = null;
    processCascade(idx);
  }, [rows]);

  const addLog = (type: 'info' | 'error' | 'success', message: string) => {
    setLogs(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), timestamp: new Date().toLocaleTimeString(), type, message }]);
    if (type === 'success' || type === 'error') announce(message);
  };

  const processPhrases = (text: string) => {
    try {
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const newRows: RowData[] = lines.map((phrase, i) => ({
        id: `R_PHRASE_${Date.now()}_${i}`,
        UTTERANCE: phrase,
        status: 'idle',
        nluStatus: 'idle',
        visualStatus: 'idle',
        bitmapStatus: 'idle'
      }));
      setRows(prev => [...prev, ...newRows]);
      setViewMode('list');
      addLog('success', `Importadas ${newRows.length} frases desde el archivo.`);
    } catch (e) {
      addLog('error', 'Error al procesar el listado de frases.');
    }
  };

  const exportProject = () => {
    // Transform rows: convert "processing" status to "idle" or "completed"
    const sanitizedRows = rows.map((row: RowData) => {
      if (row.status !== 'processing') {
        return row; // Keep other statuses as-is
      }

      // Check if row has meaningful data to determine if it should be 'completed' or 'idle'
      const hasNLU = row.NLU && (typeof row.NLU === 'string' ? row.NLU.trim() !== '' : Object.keys(row.NLU).length > 0);
      const hasVisual = (row.elements && row.elements.length > 0) || (row.prompt && row.prompt.trim() !== '');
      const hasBitmap = row.bitmap && row.bitmap.trim() !== '';

      const hasAnyData = hasNLU || hasVisual || hasBitmap;

      return {
        ...row,
        status: hasAnyData ? 'completed' as const : 'idle' as const
      };
    });

    const dataToExport = {
      version: APP_VERSION,
      type: 'pictonet_graph_dump',
      timestamp: new Date().toISOString(),
      config,
      rows: sanitizedRows,
      svgs: exportSVGs()
    };
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeFilename = config.author.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'pictonet';
    a.download = `${safeFilename}_graph_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('success', 'Proyecto exportado correctamente (imágenes incluidas).');
  };

  const handleImportProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Warn user about replacement
    if (!window.confirm("Advertencia: Al cargar una librería, se REEMPLAZARÁN todos los pictogramas actuales y la configuración (nombre, prompt, geolocalización, etc.). ¿Deseas continuar?")) {
      e.target.value = ''; // Reset input
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          const sanitized = parsed.map(sanitizeRow);
          setRows(sanitized);
          addLog('success', `Importados ${sanitized.length} nodos (Formato Legacy).`);
        }
        else if (parsed.rows && Array.isArray(parsed.rows)) {
          const sanitized = parsed.rows.map(sanitizeRow);
          setRows(sanitized);
          if (parsed.config) {
            const newConfig = { ...parsed.config };
            if (!newConfig.aspectRatio) newConfig.aspectRatio = '1:1';
            if (!newConfig.imageModel) newConfig.imageModel = 'flash';
            if (!newConfig.credits) newConfig.credits = '';
            if (!newConfig.license) newConfig.license = 'cc-by';
            setConfig(newConfig);
            addLog('info', 'Configuración global restaurada.');
          }
          if (parsed.svgs && Array.isArray(parsed.svgs)) {
            const count = importSVGs(parsed.svgs);
            if (count > 0) addLog('success', `Biblioteca SVG restaurada: ${count} pictogramas.`);
          }
          addLog('success', `Grafo restaurado: ${sanitized.length} nodos.`);
        } else {
          throw new Error("Formato de archivo no reconocido");
        }
        setViewMode('list');
      } catch (err) {
        addLog('error', 'Fallo al importar grafo. Verifique el formato.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const addNewRow = (textValue: string = "") => {
    const newId = `R_MANUAL_${Date.now()}`;
    const realText = textValue.trim();
    const newEntry: RowData = {
      id: newId,
      UTTERANCE: realText || 'Nueva Unidad Semántica',
      status: 'idle', nluStatus: 'idle', visualStatus: 'idle', bitmapStatus: 'idle'
    };
    scrollToRowRef.current = newId;
    if (realText) autoCascadeRef.current = newId;
    setRows(prev => [newEntry, ...prev]);
    setViewMode('list');
    setOpenRowId(newId);
    setShowConfig(false);
    setSearchValue('');
    setIsSearching(false);
  };

  const handleLibraryMenuToggle = () => {
    if (!showLibraryMenu && libraryBtnRef.current) {
      const rect = libraryBtnRef.current.getBoundingClientRect();
      const DROPDOWN_WIDTH = 224; // w-56 = 14rem = 224px
      setLibraryMenuPos({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - DROPDOWN_WIDTH),
      });
    }
    setShowLibraryMenu(!showLibraryMenu);
  };

  const clearAll = () => {
    setConfirmDialog({
      isOpen: true,
      title: t('actions.deleteAll'),
      message: t('actions.deleteAllConfirm'),
      onConfirm: async () => {
        setRows([]);
        setLogs([]);
        clearLibrary();
        localStorage.removeItem(STORAGE_KEY);

        // Clear all IndexedDB data (rows, bitmaps, svgs)
        try {
          await IndexedDBService.clearAllData();
        } catch (err) {
          console.error('Failed to clear IndexedDB:', err);
        }

        setViewMode('home');
        setShowLibraryMenu(false);
        addLog('info', t('messages.allCleared'));
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Load library from libraries folder
  const loadLibrary = async (filename: string) => {
    // Get library metadata for better display name
    const libraryMeta = availableLibraries.find(lib => lib.filename === filename);
    const displayName = libraryMeta?.name || filename;

    const executeLoad = async () => {
      setIsLoadingLibrary(true);
      setLoadingLibraryName(displayName);
      try {
        addLog('info', `Cargando biblioteca: ${displayName}...`);
        const response = await fetch(`/libraries/${filename}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        addLog('success', `Biblioteca cargada: ${data.rows?.length || 0} pictogramas`);

        // Load config if available
        if (data.config) {
          setConfig(prev => ({ ...prev, ...data.config }));
        }

        setRows(data.rows as RowData[]);
        setViewMode('list');
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        addLog('error', `Error al cargar biblioteca: ${msg}`);
        console.error('Library load error:', error);
      } finally {
        setIsLoadingLibrary(false);
        setLoadingLibraryName('');
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    };

    if (rows.length > 0) {
      setConfirmDialog({
        isOpen: true,
        title: t('home.loadLibrary'),
        message: t('home.loadLibraryWarning', { count: rows.length }),
        onConfirm: executeLoad
      });
    } else {
      await executeLoad();
    }
  };

  const updateRow = (index: number, updates: Partial<RowData>) => {
    setRows(prev => {
      const updated = [...prev];
      if (!updated[index]) return prev;
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  };

  // ID-based update: immune to array index shifts and stale closures.
  // Use this for callbacks passed to components with async operations.
  const updateRowById = (id: string, updates: Partial<RowData>) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const regeneratePrompt = async (index: number): Promise<boolean> => {
    const row = rows[index];
    if (!row || !row.NLU || !row.elements) {
      addLog('error', 'Se requiere NLU y elementos para regenerar el prompt');
      return false;
    }

    stopFlags.current[row.id] = false;
    updateRow(index, { visualStatus: 'processing' });
    const startTime = Date.now();

    try {
      let nluObj;
      try {
        nluObj = typeof row.NLU === 'string' ? JSON.parse(row.NLU) : row.NLU;
      } catch (parseError) {
        throw new Error(`Failed to parse NLU data: ${parseError}`);
      }

      addLog('info', `[PROMPT] Regenerando prompt espacial a partir de elementos modificados...`);
      const newPrompt = await Gemini.generateSpatialPrompt(nluObj as NLUData, ensureElementsArray(row.elements), config, addLog);

      if (stopFlags.current[row.id]) {
        addLog('info', `🛑 Regeneración de prompt detenida por usuario`);
        updateRow(index, { visualStatus: 'completed' });
        return false;
      }

      const duration = (Date.now() - startTime) / 1000;
      updateRow(index, {
        prompt: newPrompt,
        visualStatus: 'completed',
        visualDuration: duration,
        bitmapStatus: 'outdated',
        shared: false
      });
      addLog('success', `Prompt regenerado en ${duration.toFixed(1)}s: "${newPrompt.substring(0, 50)}..."`);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      addLog('error', `Error al regenerar prompt: ${msg}`);
      updateRow(index, { visualStatus: 'completed' });
      return false;
    }
  };

  const processStep = async (index: number, step: 'nlu' | 'visual' | 'bitmap'): Promise<boolean> => {
    const row = rows[index];
    if (!row) return false;

    stopFlags.current[row.id] = false;
    const statusKey = `${step}Status` as keyof RowData;
    const durationKey = `${step}Duration` as keyof RowData;

    updateRow(index, { [statusKey]: 'processing' });
    const startTime = Date.now();

    try {
      let result: any;
      if (step === 'nlu') {
        result = await Gemini.generateNLU(row.UTTERANCE, addLog, config);
      } else if (step === 'visual') {
        let nluObj;
        try {
          nluObj = typeof row.NLU === 'string' ? JSON.parse(row.NLU) : row.NLU;
        } catch (parseError) {
          throw new Error(`Failed to parse NLU data: ${parseError}`);
        }
        result = await Gemini.generateVisualBlueprint(nluObj as NLUData, config, addLog);
      } else if (step === 'bitmap') {
        result = await Gemini.generateImage(ensureElementsArray(row.elements), row.prompt || "", row, config, addLog);
      }

      if (stopFlags.current[row.id]) {
        addLog('info', `🛑 Proceso detenido por usuario en paso ${step.toUpperCase()}`);
        updateRow(index, { [statusKey]: 'idle' });
        return false;
      }

      const duration = (Date.now() - startTime) / 1000;
      updateRow(index, {
        [statusKey]: 'completed',
        [durationKey]: duration,
        ...(step === 'nlu' ? { NLU: result, visualStatus: 'outdated', bitmapStatus: 'outdated' } : {}),
        ...(step === 'visual' ? { elements: result.elements, prompt: result.prompt, bitmapStatus: 'outdated' } : {}),
        ...(step === 'bitmap' ? { bitmap: result, status: 'completed', shared: false } : {})
      });
      addLog('success', `${step.toUpperCase()} completo: ${duration.toFixed(1)}s para "${row.UTTERANCE}"`);

      if (step === 'bitmap') {
        requestAnimationFrame(() => {
          const rowEl = document.getElementById(`picto-row-${row.id}`);
          const bitmapEl = rowEl?.querySelector('#bitmap-preview');
          if (bitmapEl) bitmapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
      return true;
    } catch (err: any) {
      updateRow(index, { [statusKey]: 'error' });
      addLog('error', `${step.toUpperCase()} Error para "${row.UTTERANCE}": ${err.message}`);
      return false;
    }
  };

  const processCascade = async (index: number) => {
    const row = rows[index];
    if (!row) return;

    stopFlags.current[row.id] = false;
    addLog('info', `Iniciando propagación en grafo para: ${row.UTTERANCE}`);

    let finalUpdates: Partial<RowData> = { status: 'processing' };

    try {
      // --- NLU Step ---
      addLog('info', `[CASCADA] Paso 1/3: COMPRENDER - Análisis semántico`);
      updateRow(index, { nluStatus: 'processing', visualStatus: 'idle', bitmapStatus: 'idle' });
      const nluStartTime = Date.now();
      const nluResult = await Gemini.generateNLU(row.UTTERANCE, addLog, config);
      if (stopFlags.current[row.id]) {
        addLog('info', `❌ [CASCADA] Detenida por usuario en paso COMPRENDER`);
        updateRow(index, { nluStatus: 'idle', status: 'idle' });
        return;
      }
      finalUpdates.NLU = nluResult;
      finalUpdates.nluStatus = 'completed';
      finalUpdates.nluDuration = (Date.now() - nluStartTime) / 1000;
      addLog('success', `✓ [CASCADA] Paso 1/3 completado en ${finalUpdates.nluDuration.toFixed(1)}s`);

      // --- Visual Step ---
      addLog('info', `[CASCADA] Paso 2/3: COMPONER - Blueprint visual`);
      updateRow(index, { nluStatus: 'completed', nluDuration: finalUpdates.nluDuration, NLU: nluResult, visualStatus: 'processing' });
      const visualStartTime = Date.now();
      const visualResult = await Gemini.generateVisualBlueprint(nluResult, config, addLog);
      if (stopFlags.current[row.id]) {
        addLog('info', `❌ [CASCADA] Detenida por usuario en paso COMPONER`);
        updateRow(index, { visualStatus: 'idle' });
        return;
      }
      finalUpdates.elements = visualResult.elements;
      finalUpdates.prompt = visualResult.prompt;
      finalUpdates.visualStatus = 'completed';
      finalUpdates.visualDuration = (Date.now() - visualStartTime) / 1000;
      addLog('success', `✓ [CASCADA] Paso 2/3 completado en ${finalUpdates.visualDuration.toFixed(1)}s`);

      // --- Bitmap Step (NanoBanana) ---
      addLog('info', `[CASCADA] Paso 3/3: PRODUCIR - Renderizado de imagen`);
      updateRow(index, { visualStatus: 'completed', visualDuration: finalUpdates.visualDuration, elements: visualResult.elements, prompt: visualResult.prompt, bitmapStatus: 'processing' });
      const bitmapStartTime = Date.now();
      const bitmapResult = await Gemini.generateImage(ensureElementsArray(visualResult.elements), visualResult.prompt || "", row, config, addLog);
      if (stopFlags.current[row.id]) {
        addLog('info', `❌ [CASCADA] Detenida por usuario en paso PRODUCIR`);
        updateRow(index, { bitmapStatus: 'idle' });
        return;
      }
      finalUpdates.bitmap = bitmapResult;
      finalUpdates.bitmapStatus = 'completed';
      finalUpdates.bitmapDuration = (Date.now() - bitmapStartTime) / 1000;
      addLog('success', `✓ [CASCADA] Paso 3/3 completado en ${finalUpdates.bitmapDuration.toFixed(1)}s`);

      finalUpdates.shared = false;
      finalUpdates.status = 'completed';
      updateRow(index, finalUpdates);

      const totalTime = (finalUpdates.nluDuration || 0) + (finalUpdates.visualDuration || 0) + (finalUpdates.bitmapDuration || 0);
      addLog('success', `✓ [CASCADA] Pipeline completo en ${totalTime.toFixed(1)}s total para "${row.UTTERANCE}"`);

      requestAnimationFrame(() => {
        const rowEl = document.getElementById(`picto-row-${row.id}`);
        const bitmapEl = rowEl?.querySelector('#bitmap-preview');
        if (bitmapEl) bitmapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

    } catch (err: any) {
      let stepFailed: 'nlu' | 'visual' | 'bitmap' = 'nlu';
      if (finalUpdates.nluStatus === 'completed' && finalUpdates.visualStatus !== 'completed') stepFailed = 'visual';
      else if (finalUpdates.visualStatus === 'completed') stepFailed = 'bitmap';

      const stepNames = { nlu: 'COMPRENDER', visual: 'COMPONER', bitmap: 'PRODUCIR' };
      updateRow(index, { [`${stepFailed}Status`]: 'error', status: 'error' });
      addLog('error', `❌ [CASCADA] Fallo en paso ${stepNames[stepFailed]}: ${err.message}`);
    }
  };

  // Helper functions for sorting
  const getRowCompleteness = (row: RowData): number => {
    let count = 0;
    if (row.NLU && row.nluStatus === 'completed') count++;
    if (row.elements && row.prompt && row.visualStatus === 'completed') count++;
    if (row.bitmap && row.bitmapStatus === 'completed') count++;
    return count;
  };

  const sharePictogram = async (index: number): Promise<boolean> => {
    const row = rows[index];
    console.log('[SHARE] Iniciando proceso de compartir pictograma', { index, utterance: row?.UTTERANCE });

    if (!row) {
      addLog('error', 'No se encontró la fila');
      return false;
    }

    if (row.shared) {
      console.log('[SHARE] El pictograma ya fue compartido previamente');
      addLog('info', t('share.alreadyShared'));
      return false;
    }

    try {
      console.log('[SHARE] Preparando datos para enviar a PICTOS');
      addLog('info', t('share.sharing', { utterance: row.UTTERANCE }));

      const payload = {
        id: row.id,
        UTTERANCE: row.UTTERANCE,
        status: row.status,
        NLU: row.NLU,
        elements: row.elements,
        prompt: row.prompt,
        bitmap: row.bitmap, // Bitmap already resized to 800x800 at generation time
        nluStatus: row.nluStatus,
        visualStatus: row.visualStatus,
        bitmapStatus: row.bitmapStatus,
        source: 'pictos.net',
        author: config.author,
        timestamp: new Date().toISOString()
      };
      console.log('[SHARE] Enviando a función serverless', { payloadSize: JSON.stringify(payload).length });

      // Llamar a la función de Netlify (protege el GITHUB_TOKEN)
      const response = await fetch('/.netlify/functions/share-pictogram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      console.log('[SHARE] Respuesta recibida', { status: response.status, statusText: response.statusText });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SHARE] Error en respuesta', { status: response.status, error: errorText });
        addLog('error', t('share.error', { status: response.status, error: errorText }));
        return false;
      }

      console.log('[SHARE] ✓ Pictograma compartido exitosamente');
      updateRow(index, { shared: true });
      addLog('success', t('share.success', { utterance: row.UTTERANCE }));

      // Mostrar mensaje de agradecimiento al usuario
      alert(t('share.thanksMessage'));

      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      console.error('[SHARE] Excepción capturada', { error: msg });
      addLog('error', t('share.exception', { error: msg }));
      return false;
    }
  };

  const openSVGEditor = (rowId: string) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    const svgToEdit = row.structuredSvg || row.rawSvg;
    const source = row.structuredSvg ? 'structured' : 'raw';

    if (!svgToEdit) {
      addLog('error', 'No hay SVG para editar. Primero vectoriza la imagen.');
      return;
    }

    setSvgEditorState({
      isOpen: true,
      rowId: rowId,
      svg: svgToEdit,
      svgSource: source,
    });
    addLog('info', `Abriendo editor SVG para: ${row.UTTERANCE}`);
  };

  const handleSVGEditorSave = (updatedSvg: string) => {
    if (!svgEditorState.rowId) return;
    const source = svgEditorState.svgSource;

    // Write only to the origin field — do not promote rawSvg to structuredSvg
    const update: Partial<RowData> = source === 'structured'
      ? { structuredSvg: updatedSvg }
      : { rawSvg: updatedSvg };

    updateRowById(svgEditorState.rowId, update);

    // Only update the SVG Library for structured SVGs (the "official" pictogram)
    if (source === 'structured') {
      const savedRow = rows.find(r => r.id === svgEditorState.rowId);
      if (savedRow) {
        addSVG({
          id: savedRow.id,
          utterance: savedRow.UTTERANCE,
          svg: updatedSvg,
          createdAt: new Date().toISOString(),
          sourceRowId: savedRow.id,
          lang: (typeof savedRow.NLU === 'object' && savedRow.NLU !== null)
            ? (savedRow.NLU as any).lang
            : undefined
        });
      }
    }

    const savedRow = rows.find(r => r.id === svgEditorState.rowId);
    addLog('success', `SVG actualizado correctamente para: ${savedRow?.UTTERANCE}`);
    setSvgEditorState({ isOpen: false, rowId: null, svg: null, svgSource: null });
  };

  const handleVectorizerApply = (result: VectorizerResult) => {
    if (!vectorizerState.rowId) return;
    updateRowById(vectorizerState.rowId, { rawSvg: result.svg });
    addLog('success', `Vectorizado: ${result.layersTraced}/${result.layersTotal} capas (tier ${result.tiersUsed})`);
    if (result.warnings.length > 0) {
      result.warnings.forEach(w => addLog('info', w));
    }
    setVectorizerState({ isOpen: false, rowId: null });
  };

  const filteredRows = useMemo(() => {
    // First filter by search
    let filtered = rows;
    if (searchValue) {
      const lowSearch = searchValue.toLowerCase();
      filtered = rows.filter(r => r.UTTERANCE.toLowerCase().includes(lowSearch));
    }

    // Then sort by selected criteria
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'alphabetical') {
        return a.UTTERANCE.localeCompare(b.UTTERANCE);
      } else if (sortBy === 'completeness') {
        return getRowCompleteness(b) - getRowCompleteness(a); // descending (more complete first)
      }
      return 0;
    });

    return sorted;
  }, [rows, searchValue, sortBy]);

  const focusedRowData = useMemo(() => {
    if (!focusMode) return null;
    return rows.find(r => r.id === focusMode.rowId);
  }, [focusMode, rows]);

  const svgCount = svgs?.length ?? 0;
  const pngCount = rows.filter(r => r.bitmap).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <a href="#mainContent" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-violet-950 focus:text-white focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:rounded">
        Saltar al contenido principal
      </a>
      <header id="toolbar" className="h-20 bg-white border-b border-slate-200 sticky top-0 z-50 flex items-center px-8 justify-between shadow-sm" aria-label="Barra de herramientas">
        <div id="brand-area" className="flex items-center gap-4 cursor-pointer" onClick={() => { setViewMode('home'); setShowConfig(false); }}>
          <div className="p-1.5"><LogoIcon size={44} /></div>
          <div>
            <h1 className="font-bold uppercase tracking-tight text-xl text-slate-900 leading-none">{config.author}</h1>
            <span id="tagline" className="text-xs text-slate-500 font-mono tracking-widest uppercase">PICTOS.net v{APP_VERSION}</span>
          </div>
        </div>

        <div id="search-area" className="flex-1 max-w-xl mx-8">
          <SearchComponent
            rows={rows}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            onAddNewRow={addNewRow}
            isFocused={isSearching}
            setIsFocused={setIsSearching}
          />
        </div>

        <nav id="header-actions" aria-label="Acciones principales" className="flex gap-2 items-center">
          <input type="file" ref={importInputRef} className="hidden" accept=".json" onChange={handleImportProject} />
          <input type="file" ref={appendPhrasesInputRef} className="hidden" accept=".txt" onChange={e => e.target.files?.[0]?.text().then(processPhrases)} />

          {/* Language Switcher */}
          <select
            value={lang}
            onChange={(e) => {
              const newLang = e.target.value as Locale;
              setLang(newLang);
              setConfig(prev => ({ ...prev, lang: newLang, uiLang: newLang }));
            }}
            className="p-2.5 text-xs border border-slate-200 bg-white hover:border-violet-200 rounded-md transition-all text-slate-600 font-medium cursor-pointer shadow-sm"
            title="UI Language"
          >
            <option value="en-GB">English</option>
            <option value="es-419">Español</option>
          </select>

          <div id="library-btn-group" ref={libraryBtnRef} className="relative flex items-center bg-white border border-slate-200 shadow-sm rounded-md transition-all hover:border-violet-200 group">
            <button
              onClick={() => setViewMode('list')}
              className="p-2.5 hover:bg-slate-50 text-slate-600 border-r border-slate-100 flex items-center gap-2"
              title={t('header.libraryTooltip')}
            >
              <Library size={18} />
              <span className="text-xs font-medium text-slate-500 hidden md:inline">{t('header.library')}</span>
            </button>
            <button
              onClick={handleLibraryMenuToggle}
              className={`p-1.5 hover:bg-slate-50 text-slate-500 border-l border-transparent hover:text-violet-950 transition-colors ${showLibraryMenu ? 'bg-slate-50 text-violet-950' : ''}`}
              aria-label={t('header.libraryTooltip')}
            >
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          </div>

          <div className="w-px h-8 bg-slate-200 mx-2"></div>

          <button id="settings-btn" onClick={() => setShowConfig(!showConfig)} className={`p-2.5 hover:bg-slate-50 text-slate-500 border border-transparent hover:border-slate-200 rounded-md transition-all ${showConfig ? 'bg-slate-100 text-violet-950' : ''}`} title={t('header.settingsTooltip')} aria-label={t('header.settingsTooltip')}><Settings size={18} aria-hidden="true" /></button>
          <button id="console-btn" onClick={() => setShowConsole(!showConsole)} className="p-2.5 hover:bg-slate-50 text-slate-500 border border-transparent hover:border-slate-200 rounded-md transition-all" title={t('header.consoleTooltip')} aria-label={t('header.consoleTooltip')}><Terminal size={18} aria-hidden="true" /></button>
        </nav>
      </header>

      {showConfig && (
        <>
        <div className="fixed inset-0 z-[39]" onClick={() => setShowConfig(false)} />
        <div id="globalSettings" className="fixed top-20 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-b shadow-2xl p-8 animate-in slide-in-from-top duration-200">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">

            {/* ── Columna izquierda ── */}
            <div className="flex flex-col gap-6">

              {/* field-author */}
              <div id="field-author">
                <FieldLabel label={t('config.spaceName')} tooltip={t('config.spaceNameTooltip')} />
                <input
                  type="text"
                  value={config.author}
                  onChange={e => setConfig({ ...config, author: e.target.value })}
                  className="w-full text-xs border p-3 bg-slate-50 focus:bg-white transition-colors"
                  placeholder="My Pictogram Library"
                />
              </div>

              {/* field-credits */}
              <div id="field-credits">
                <FieldLabel
                  label="Créditos"
                  tooltip="Personas o institución responsables de esta librería. Se incluye en los metadatos al compartir o exportar para garantizar la atribución correcta."
                />
                <textarea
                  value={config.credits || ''}
                  onChange={e => setConfig({ ...config, credits: e.target.value })}
                  placeholder="Ej: Herbert Spencer — e[ad] PUCV / Núcleo de Accesibilidad e Inclusión"
                  className="w-full text-xs border p-3 bg-slate-50 focus:bg-white transition-colors h-16 resize-none"
                />
              </div>

              {/* field-license */}
              <div id="field-license">
                <FieldLabel
                  label="Licencia"
                  tooltip="Licencia que aplica al trabajo derivado de esta librería. Los modelos Gemini no imponen restricciones sobre uso comercial si se respentan las condiciones de uso."
                />
                <select
                  value={config.license}
                  onChange={e => setConfig({ ...config, license: e.target.value })}
                  className="w-full text-xs border p-3 bg-slate-50 focus:bg-white transition-colors"
                >
                  <option value="copyright">© Copyright (todos los derechos reservados)</option>
                  <option value="cc0">CC0 — Dominio Público</option>
                  <option value="cc-by">CC BY — Atribución</option>
                  <option value="cc-by-sa">CC BY-SA — Atribución-CompartirIgual</option>
                  <option value="cc-by-nc">CC BY-NC — Atribución-NoComercial</option>
                  <option value="cc-by-nc-sa">CC BY-NC-SA — Atribución-NoComercial-CompartirIgual</option>
                </select>
              </div>

              {/* field-geo */}
              <div id="field-geo">
                <FieldLabel
                  label="Geo-Linguistic Context"
                  tooltip="Idioma de procesamiento NLU y región geográfica de referencia. Afecta la interpretación cultural de los pictogramas."
                />
                <div className="flex flex-col gap-2">
                  <div className="border p-3 bg-slate-50 focus-within:bg-white focus-within:ring-1 focus-within:ring-violet-200 transition-colors">
                    <div className="flex items-center gap-2">
                      <Globe size={14} className="text-slate-500" />
                      <select
                        value={config.lang}
                        onChange={(e) => {
                          const newLang = e.target.value as Locale;
                          setConfig({ ...config, lang: newLang, uiLang: newLang });
                          setLang(newLang);
                        }}
                        className="w-full text-xs bg-transparent border-none outline-none font-medium cursor-pointer"
                      >
                        <option value="es-419">Español</option>
                        <option value="en-GB">English</option>
                      </select>
                    </div>
                  </div>
                  <GeoAutocomplete
                    value={{
                      lat: config.geoContext?.lat || '',
                      lng: config.geoContext?.lng || '',
                      region: config.geoContext?.region || ''
                    }}
                    onChange={(geoContext: { lat: string; lng: string; region: string }) => setConfig({ ...config, geoContext })}
                  />
                </div>
              </div>
            </div>

            {/* ── Columna derecha ── */}
            <div className="flex flex-col gap-6">

              {/* field-visual-style */}
              <div id="field-visual-style">
                <FieldLabel
                  label="Prompt de estilo visual"
                  tooltip="Descripción del estilo gráfico que Gemini usará para renderizar todos los pictogramas de este espacio."
                />
                <textarea
                  value={config.visualStylePrompt}
                  onChange={e => setConfig({ ...config, visualStylePrompt: e.target.value })}
                  className="w-full text-xs border p-3 bg-slate-50 focus:bg-white transition-colors h-32 resize-none"
                />
              </div>

              {/* field-aspect-ratio */}
              <div id="field-aspect-ratio">
                <FieldLabel
                  label="Proporción"
                  tooltip="Relación de aspecto de las imágenes generadas."
                />
                <select
                  value={config.aspectRatio}
                  onChange={e => setConfig({ ...config, aspectRatio: e.target.value })}
                  className="w-full text-xs border p-3 bg-slate-50 focus:bg-white transition-colors"
                >
                  <option value="1:1">Square (1:1)</option>
                  <option value="4:3">Standard (4:3)</option>
                  <option value="3:4">Portrait (3:4)</option>
                  <option value="16:9">Widescreen (16:9)</option>
                  <option value="9:16">Mobile (9:16)</option>
                </select>
              </div>

              {/* field-image-model */}
              <div id="field-image-model">
                <FieldLabel
                  label="Modelo"
                  tooltip="NanoBanana Flash es más rápido; NanoBanana Pro produce mayor calidad pero tarda más."
                />
                <select
                  value={config.imageModel || 'flash'}
                  onChange={e => setConfig({ ...config, imageModel: e.target.value })}
                  className="w-full text-xs border p-3 bg-slate-50 focus:bg-white transition-colors"
                >
                  <option value="flash">NanoBanana (Flash 2.5)</option>
                  <option value="pro">NanoBanana Pro (Gemini 3 Pro)</option>
                </select>
              </div>

              {/* field-style-editor */}
              <div id="field-style-editor">
                <FieldLabel
                  label="Estilos"
                  tooltip="Editor visual de estilos CSS para los SVGs generados. Define clases reutilizables para animaciones y apariencia."
                />
                <button
                  onClick={() => setShowStyleEditor(true)}
                  className="w-full text-xs font-bold uppercase text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 p-3 rounded transition-colors flex items-center justify-center gap-2"
                >
                  <Palette size={14} aria-hidden="true" /> Abrir editor
                </button>
              </div>

              {/* field-reduce-motion */}
              <div id="field-reduce-motion">
                <FieldLabel
                  label="Animaciones"
                  tooltip="Desactivar animaciones y transiciones en la interfaz. Recomendado para accesibilidad (WCAG 2.3.3)."
                />
                <label className="flex items-center gap-3 cursor-pointer p-3 border bg-slate-50 hover:bg-white transition-colors">
                  <input
                    type="checkbox"
                    checked={!reduceMotion}
                    onChange={e => setReduceMotion(!e.target.checked)}
                    className="w-4 h-4 accent-violet-600"
                  />
                  <span className="text-xs font-medium text-slate-700">
                    {reduceMotion ? 'Animaciones desactivadas' : 'Animaciones activadas'}
                  </span>
                </label>
              </div>

              {/* field-high-contrast */}
              <div id="field-high-contrast">
                <FieldLabel
                  label="Alto contraste"
                  tooltip="Activar modo de alto contraste: bordes reforzados, texto mas oscuro y fondos blancos puros. Recomendado para accesibilidad (WCAG 1.4.11)."
                />
                <label className="flex items-center gap-3 cursor-pointer p-3 border bg-slate-50 hover:bg-white transition-colors">
                  <input
                    type="checkbox"
                    checked={highContrast}
                    onChange={e => setHighContrast(e.target.checked)}
                    className="w-4 h-4 accent-violet-600"
                  />
                  <span className="text-xs font-medium text-slate-700">
                    {highContrast ? 'Alto contraste activado' : 'Alto contraste desactivado'}
                  </span>
                </label>
              </div>
            </div>

          </div>
        </div>
        </>
      )}

      <main id="mainContent" className="flex-1 p-8 max-w-7xl mx-auto w-full">
        {viewMode === 'list' && rows.length > 0 && (
          <div id="sort-controls" className="mb-6 flex justify-end gap-2">
            <span className="text-xs font-medium uppercase text-slate-500 tracking-wider self-center mr-2">{t('library.sortBy')}</span>
            <button
              onClick={() => setSortBy('alphabetical')}
              className={`px-3 py-1.5 text-xs font-medium uppercase tracking-wider border transition-all ${sortBy === 'alphabetical' ? 'bg-violet-950 text-white border-violet-950' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}
            >
              {t('library.alphabetical')}
            </button>
            <button
              onClick={() => setSortBy('completeness')}
              className={`px-3 py-1.5 text-xs font-medium uppercase tracking-wider border transition-all ${sortBy === 'completeness' ? 'bg-violet-950 text-white border-violet-950' : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'}`}
            >
              {t('library.completeness')}
            </button>
          </div>
        )}
        {viewMode === 'home' ? (
          <div id="home-view" className="py-20 text-center space-y-16 animate-in fade-in zoom-in-95 duration-700">
            <div id="hero-area" className="space-y-4">
              <div className="inline-flex gap-4 bg-orange-500 text-white px-6 py-2 text-xs font-medium uppercase tracking-[0.3em] shadow-lg rounded-xl">
                <ScreenShare size={14} /> {t('header.betterOnLargeScreens')}
              </div>
              <p className="text-8xl font-black tracking-tighter text-slate-900 leading-none" aria-hidden="true">{config.author}</p>
              <p className="text-slate-500 text-xl font-medium max-w-2xl mx-auto leading-relaxed">
                {t('home.description')}
              </p>
            </div>

            <div className="flex justify-center max-w-2xl mx-auto">
              <div id="import-card" onClick={() => fileInputRef.current?.click()} className="bg-violet-950 p-12 text-left space-y-6 shadow-xl hover:bg-black transition-all cursor-pointer group hover:-translate-y-1 w-full max-w-md">
                <div className="text-white group-hover:scale-110 transition-transform"><FileText size={40} /></div>
                <div>
                  <h2 className="font-bold text-xl uppercase tracking-wider text-white">{t('home.importTextNode')}</h2>
                  <div className="text-xs text-violet-400 font-mono mt-1">{t('home.importNamespace')}</div>
                </div>
                <p className="text-xs text-violet-300 leading-relaxed font-medium">{t('home.importDescription')}</p>
                <input ref={fileInputRef} type="file" accept=".txt" className="hidden" onChange={e => e.target.files?.[0]?.text().then(processPhrases)} />
              </div>
            </div>

            {/* Example Libraries Section - Only show if libraries are available */}
            {availableLibraries.length > 0 && (
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900">{t('home.exampleLibraries')}</h2>
                  <p className="text-sm text-slate-500">{t('home.exampleLibrariesDescription')}</p>
                </div>

                <div id="example-libraries" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {availableLibraries.map((library: LibraryMetadata) => (
                    <div
                      key={library.filename}
                      onClick={() => loadLibrary(library.filename)}
                      className="bg-slate-50 border border-slate-200 p-6 text-left space-y-3 hover:border-violet-600 hover:bg-white transition-all cursor-pointer group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-violet-600 group-hover:scale-110 transition-transform">
                          <Library size={24} />
                        </div>
                        <div className="flex gap-1">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5">
                            {library.language}
                          </span>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-bold text-sm uppercase tracking-wide text-slate-900">{library.name}</h4>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">{library.location}</div>
                      </div>

                      {/* {library.description && (
                      <p className="text-xs text-slate-500 leading-relaxed">{library.description}</p>
                    )} */}

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                        <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                          {t('home.loadLibrary')}
                        </span>
                        {library.items && (
                          <span className="text-xs text-violet-600 font-bold">
                            {library.items} {t('home.items')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-8 text-center">
              <a
                href="https://github.com/hspencer/pictos-net#readme"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-600 transition-colors font-medium"
              >
                <ExternalLink size={14} />
                {t('home.aboutProject')}
              </a>
            </div>
          </div>
        ) : (
          <div id="list-view" className="space-y-4 pb-64 animate-in fade-in slide-in-from-bottom-8 duration-500">
            {filteredRows.map((row) => {
              const globalIndex = rows.findIndex(r => r.id === row.id);
              return (
                <RowComponent
                  key={row.id} row={row} isOpen={openRowId === row.id} setIsOpen={v => { setOpenRowId(v ? row.id : null); if (v) setShowConfig(false); }}
                  onUpdate={u => updateRowById(row.id, u)} onProcess={s => processStep(globalIndex, s)}
                  onRegeneratePrompt={() => regeneratePrompt(globalIndex)}
                  onStop={() => {
                    stopFlags.current[row.id] = true;
                    addLog('info', `🛑 Solicitud de detención para: "${row.UTTERANCE}"`);
                  }}
                  onCascade={() => processCascade(globalIndex)}
                  onDelete={() => {
                    // Delete bitmap and SVG from IndexedDB
                    IndexedDBService.deleteBitmap(row.id).catch(err => {
                      console.error('Failed to delete bitmap from IndexedDB:', err);
                    });
                    IndexedDBService.deleteSvgs(row.id).catch(err => {
                      console.error('Failed to delete SVG from IndexedDB:', err);
                    });
                    // Remove row from state
                    setRows(prev => prev.filter(r => r.id !== row.id));
                    // If the deleted row was in focus mode, clear focus mode
                    if (focusMode?.rowId === row.id) {
                      setFocusMode(null);
                    }
                  }}
                  onFocus={step => setFocusMode({ step, rowId: row.id })}
                  onShare={() => sharePictogram(globalIndex)}
                  onLog={addLog}
                  config={config}
                  onConfigChange={partial => setConfig(prev => ({ ...prev, ...partial }))}
                  onOpenEditor={() => openSVGEditor(row.id)}
                  onOpenVectorizer={() => setVectorizerState({ isOpen: true, rowId: row.id })}
                />
              );
            })}
          </div>
        )}
      </main>

      {showConsole && (
        <div id="console" className="fixed bottom-0 inset-x-0 h-64 bg-slate-950 text-slate-500 mono text-xs p-6 z-50 border-t border-slate-800 overflow-auto shadow-2xl animate-in slide-in-from-bottom duration-300">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-900 font-medium tracking-widest uppercase">
            <span className="flex items-center gap-3"><Terminal size={14} /> PICTOS Console</span>
            <button onClick={() => setLogs([])} className="hover:text-white transition-colors">Flush</button>
          </div>
          {logs.slice().reverse().map(l => (
            <div key={l.id} className="flex gap-4 py-1 border-b border-slate-900 last:border-0 items-start">
              <span className="opacity-30 shrink-0">[{l.timestamp}]</span>
              <span className={`font-medium w-16 text-center shrink-0 ${l.type === 'error' ? 'text-rose-600' : 'text-emerald-600'}`}>{l.type.toUpperCase()}</span>
              <span className="break-all">{l.message}</span>
            </div>
          ))}
        </div>
      )}

      {focusMode && focusedRowData && (
        <FocusViewModal
          mode={focusMode.step}
          row={focusedRowData}
          onClose={() => setFocusMode(null)}
          onUpdate={updates => updateRowById(focusMode.rowId, updates)}
          onShare={() => sharePictogram(rows.findIndex(r => r.id === focusMode.rowId))}
          onRegeneratePrompt={() => regeneratePrompt(rows.findIndex(r => r.id === focusMode.rowId))}
          config={config}
          onConfigChange={partial => setConfig(prev => ({ ...prev, ...partial }))}
          onLog={addLog}
          onOpenEditor={() => openSVGEditor(focusMode!.rowId)}
          onOpenVectorizer={() => setVectorizerState({ isOpen: true, rowId: focusMode!.rowId })}
          onModeChange={(step) => setFocusMode({ step, rowId: focusMode.rowId })}
        />
      )}

      {showStyleEditor && (
        <StyleEditor
          config={config}
          onUpdateConfig={setConfig}
          onClose={() => setShowStyleEditor(false)}
        />
      )}

      {/* SVG Editor Modal */}
      {svgEditorState.isOpen && svgEditorState.svg && svgEditorState.rowId !== null && (
        <SVGEditorModal
          isOpen={svgEditorState.isOpen}
          onClose={() => setSvgEditorState({ isOpen: false, rowId: null, svg: null, svgSource: null })}
          initialSvg={svgEditorState.svg}
          utterance={rows.find(r => r.id === svgEditorState.rowId)?.UTTERANCE || ''}
          onSave={handleSVGEditorSave}
          styleDefs={config.svgStyleDefs ?? []}
          svgSource={svgEditorState.svgSource}
        />
      )}

      {/* Vectorizer Modal */}
      {vectorizerState.isOpen && vectorizerState.rowId && (() => {
        const vRow = rows.find(r => r.id === vectorizerState.rowId);
        return vRow ? (
          <VectorizerModal
            isOpen={vectorizerState.isOpen}
            bitmap={vRow.bitmap || ''}
            utterance={vRow.UTTERANCE || ''}
            onClose={() => setVectorizerState({ isOpen: false, rowId: null })}
            onApply={handleVectorizerApply}
          />
        ) : null;
      })()}

      {/* Confirmation Dialog Modal */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] animate-in fade-in duration-200" onClick={closeConfirmDialog}>
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()} {...confirmDialogProps}>
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">{confirmDialog.title}</h3>
            </div>
            <div className="p-6">
              <p className="text-slate-600 leading-relaxed">{confirmDialog.message}</p>
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={closeConfirmDialog}
                className="px-6 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all rounded-md"
              >
                {t('actions.cancel')}
              </button>
              <button
                onClick={() => {
                  confirmDialog.onConfirm();
                }}
                className="px-6 py-2.5 text-sm font-medium text-white bg-violet-950 hover:bg-black transition-all rounded-md shadow-lg"
              >
                {t('actions.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Library Dropdown Portal */}
      {showLibraryMenu && ReactDOM.createPortal(
        <>
          <div
            className="fixed inset-0 z-[55]"
            onClick={() => setShowLibraryMenu(false)}
          />
          <div
            id="library-dropdown"
            className="fixed w-56 bg-white border border-slate-200 shadow-xl z-[56] rounded-sm animate-in fade-in slide-in-from-top-2"
            style={{ top: libraryMenuPos.top, left: libraryMenuPos.left }}
          >
            <div className="px-4 py-2 border-b border-slate-100 text-xs font-bold text-slate-500 tracking-wider tabular-nums">
              {rows.length} {rows.length === 1 ? 'elemento' : 'elementos'}
            </div>
            <button
              onClick={() => { appendPhrasesInputRef.current?.click(); setShowLibraryMenu(false); }}
              className="w-full text-left px-4 py-3 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
            >
              <Upload size={14} className="text-violet-950" /> Importar frases (.txt)
            </button>
            <button
              onClick={() => { importInputRef.current?.click(); setShowLibraryMenu(false); }}
              className="w-full text-left px-4 py-3 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
            >
              <Upload size={14} className="text-emerald-600" /> Importar librería (.json)
            </button>
            <div className="border-t border-slate-100 my-1"></div>
            <button
              onClick={() => { exportProject(); setShowLibraryMenu(false); }}
              disabled={rows.length === 0}
              className="w-full text-left px-4 py-3 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={14} className="text-slate-500" /> Exportar librería (.json)
            </button>
            <div className="border-t border-slate-100 my-1"></div>
            <button
              onClick={async () => {
                const rowsWithBitmaps = rows.filter(r => r.bitmap);
                if (rowsWithBitmaps.length === 0) return;
                const zip = new JSZip();
                const folder = zip.folder('pictogramas');
                rowsWithBitmaps.forEach(row => {
                  const base64Data = row.bitmap!.split(',')[1];
                  const filename = sanitizeFilename(row.UTTERANCE) || row.id;
                  folder!.file(`${filename}.png`, base64Data, { base64: true });
                });
                const blob = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const safeAuthor = sanitizeFilename(config.author) || 'pictonet';
                a.download = `${safeAuthor}_pngs_${new Date().toISOString().split('T')[0]}.zip`;
                a.click();
                URL.revokeObjectURL(url);
                setShowLibraryMenu(false);
                addLog('success', `${rowsWithBitmaps.length} PNGs exportados como ZIP.`);
              }}
              disabled={pngCount === 0}
              className="w-full text-left px-4 py-3 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ImageIcon size={14} className="text-orange-500" /> Descargar PNGs ({pngCount})
            </button>
            <button
              onClick={async () => {
                if (svgs.length === 0) return;
                const zip = new JSZip();
                const folder = zip.folder('svgs');
                svgs.forEach(picto => {
                  const filename = sanitizeFilename(picto.utterance) || picto.id;
                  folder!.file(`${filename}.svg`, picto.svg);
                });
                const blob = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const safeAuthor = sanitizeFilename(config.author) || 'pictonet';
                a.download = `${safeAuthor}_svgs_${new Date().toISOString().split('T')[0]}.zip`;
                a.click();
                URL.revokeObjectURL(url);
                setShowLibraryMenu(false);
                addLog('success', `${svgs.length} SVGs exportados como ZIP.`);
              }}
              disabled={svgCount === 0}
              className="w-full text-left px-4 py-3 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileDown size={14} className="text-blue-600" /> Exportar SVGs ({svgCount})
            </button>
            <div className="border-t border-slate-100 my-1"></div>
            <button
              onClick={clearAll}
              disabled={rows.length === 0}
              className="w-full text-left px-4 py-3 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:text-slate-500"
            >
              <Trash2 size={14} className="text-rose-600" /> {t('actions.deleteAll')}
            </button>
          </div>
        </>,
        document.body
      )}

      {/* Loading Library Overlay */}
      {isLoadingLibrary && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] animate-in fade-in duration-200">
          <div className="bg-white rounded-lg shadow-2xl p-8 mx-4 animate-in zoom-in-95 duration-200 flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-950 rounded-full animate-spin"></div>
            <div className="text-center">
              <p className="text-lg font-bold text-slate-900">{t('messages.loadingLibrary', { name: loadingLibraryName })}</p>
              <p className="text-sm text-slate-500 mt-1">{lang === 'es-419' ? 'Por favor espere...' : 'Please wait...'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Live region for screen reader announcements (WCAG 4.1.3) */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {statusAnnouncement}
      </div>
    </div>
  );
};

const RowComponent: React.FC<{
  row: RowData; isOpen: boolean; setIsOpen: (v: boolean) => void;
  onUpdate: (u: any) => void; onProcess: (s: any) => Promise<boolean>;
  onRegeneratePrompt: () => void;
  onStop: () => void; onCascade: () => void; onDelete: () => void;
  onFocus: (step: 'nlu' | 'visual' | 'bitmap' | 'eval') => void;
  onShare: () => void;
  onLog: (type: 'info' | 'error' | 'success', message: string) => void;
  config: GlobalConfig;
  onConfigChange: (partial: Partial<GlobalConfig>) => void;
  onOpenEditor: () => void;
  onOpenVectorizer: () => void;
}> = ({ row, isOpen, setIsOpen, onUpdate, onProcess, onRegeneratePrompt, onStop, onCascade, onDelete, onFocus, onShare, onLog, config, onConfigChange, onOpenEditor, onOpenVectorizer }) => {
  const { t } = useTranslation();
  const [elementsManuallyEdited, setElementsManuallyEdited] = React.useState(false);
  const [promptManuallyEdited, setPromptManuallyEdited] = React.useState(false);
  const [isPromptEditing, setIsPromptEditing] = React.useState(false);
  const [isRegeneratingPrompt, setIsRegeneratingPrompt] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  return (
    <div id={`picto-row-${row.id}`} className={`border transition-all duration-300 ${isOpen ? 'ring-8 ring-slate-100 border-violet-950 bg-white' : 'hover:border-slate-300 bg-white shadow-sm'}`}>
      <div id={`row-header-${row.id}`} className="p-6 flex items-center gap-8 group">
        <textarea
          value={row.UTTERANCE}
          onChange={e => onUpdate({ UTTERANCE: e.target.value, nluStatus: 'outdated', visualStatus: 'outdated', bitmapStatus: 'outdated' })}
          rows={1}
          onInput={e => { const el = e.target as HTMLTextAreaElement; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }}
          className="flex-1 w-full bg-transparent border-none outline-none focus:ring-0 utterance-title text-slate-900 uppercase font-light resize-none overflow-hidden hover:bg-amber-50 hover:cursor-text focus:bg-amber-50 transition-colors rounded"
          style={{ maxHeight: '4.2em', lineHeight: '1.4em' }}
        />
        <div id={`pipeline-badges-${row.id}`} className="flex gap-1.5 cursor-pointer" aria-label="Estado del pipeline" onClick={() => setIsOpen(!isOpen)}>
          <Badge step={1} label={t('pipeline.understand')} status={row.nluStatus} />
          <Badge step={2} label={t('pipeline.compose')} status={row.visualStatus} />
          <Badge step={3} label={t('pipeline.produce')} status={row.bitmapStatus} />
        </div>
        <div
          id={`picto-thumbnail-${row.id}`}
          className="w-14 h-14 border border-slate-200 bg-slate-50 flex items-center justify-center p-1 group-hover:scale-110 transition-all cursor-pointer overflow-hidden"
          onClick={() => setIsOpen(!isOpen)}
        >
          {(row.structuredSvg || row.rawSvg) ? (
            <div
              dangerouslySetInnerHTML={{ __html: injectSvgA11y(row.structuredSvg || row.rawSvg!, row.UTTERANCE, row.prompt) }}
              className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-full [&>svg]:max-h-full"
            />
          ) : row.bitmap ? (
            <img src={row.bitmap} alt={row.UTTERANCE} className="w-full h-full object-contain" />
          ) : (
            <div className="text-slate-200"><ImageIcon size={20} /></div>
          )}
        </div>
        <div id={`cascade-ctrl-${row.id}`} className="flex gap-2 transition-all">
          {row.status === 'processing' ? (
            <button onClick={e => { e.stopPropagation(); onStop(); }} className="p-2 bg-orange-600 text-white hover:bg-orange-700 transition-all rounded-full shadow-sm animate-pulse" title="Detener proceso" aria-label="Detener proceso">
              <Square size={18} aria-hidden="true" />
            </button>
          ) : (
            <button onClick={e => { e.stopPropagation(); onCascade(); }} className="p-2 border border-slate-200 hover:border-violet-950 text-slate-500 hover:text-violet-950 transition-all rounded-full bg-white shadow-sm" title="Ejecutar pipeline completo" aria-label="Ejecutar pipeline completo">
              <Play size={18} aria-hidden="true" />
            </button>
          )}
        </div>
        <ChevronDown onClick={() => setIsOpen(!isOpen)} size={20} className={`text-slate-500 transition-transform duration-500 cursor-pointer ${isOpen ? 'rotate-180 text-violet-950' : ''}`} />
      </div>

      {isOpen && (
        <>
          <div id={`row-detail-${row.id}`} className="p-8 border-t bg-slate-50/30 grid grid-cols-1 lg:grid-cols-3 gap-10 animate-in slide-in-from-top-2">
            <StepBox id="block-nlu" label={t('pipeline.understand')} status={row.nluStatus} onRegen={() => onProcess('nlu')} onStop={onStop} onFocus={() => onFocus('nlu')} duration={row.nluDuration}>
              <SmartNLUEditor
                data={row.NLU}
                onUpdate={val => onUpdate({ NLU: val, visualStatus: 'outdated', bitmapStatus: 'outdated' })}
                config={config}
                onConfigChange={onConfigChange}
              />
            </StepBox>
            <StepBox
              id="block-compose"
              label={t('pipeline.compose')}
              status={row.visualStatus}
              onRegen={() => {
                onProcess('visual');
                setElementsManuallyEdited(false);
                setPromptManuallyEdited(false);
              }}
              onStop={onStop}
              onFocus={() => onFocus('visual')}
              duration={row.visualDuration}
            >
              <div className="flex flex-col h-full">
                <div className="flex-1 flex flex-col gap-6 overflow-y-auto">
                  <div id="hierarchical-elements">
                    <label className="text-xs font-medium uppercase text-slate-500 block mb-2 tracking-widest">{t('editor.hierarchicalElements')}</label>
                    <ElementsEditor elements={row.elements || []} onUpdate={val => {
                      onUpdate({ elements: val, bitmapStatus: 'outdated', shared: false });
                      setElementsManuallyEdited(true);
                    }} />
                    {elementsManuallyEdited && row.NLU && row.elements && row.elements.length > 0 && (
                      <button
                        onMouseDown={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsRegeneratingPrompt(true);
                          await onRegeneratePrompt();
                          setIsRegeneratingPrompt(false);
                          setElementsManuallyEdited(false);
                          setPromptManuallyEdited(false);
                        }}
                        disabled={isRegeneratingPrompt}
                        className="mt-3 w-full py-2 px-3 bg-violet-950 hover:bg-black text-white transition-all flex items-center justify-end gap-2 text-xs font-bold uppercase tracking-widest shadow-lg disabled:opacity-50 disabled:cursor-not-allowed animate-in fade-in slide-in-from-top-2 duration-300"
                        title={t('actions.regeneratePrompt')}
                      >
                        {isRegeneratingPrompt ? (
                          <>
                            <RefreshCw size={12} className="animate-spin" />
                            {t('actions.regenerate')}...
                          </>
                        ) : (
                          <>
                            <RefreshCw size={12} />
                            {t('actions.regeneratePrompt')}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <div id="spatial-prompt" className="flex-1 mt-6 border-t pt-6 border-slate-200 flex flex-col gap-3">
                    <label className="text-xs font-medium uppercase text-slate-500 block tracking-widest">{t('editor.spatialLogic')}</label>
                    {isPromptEditing ? (
                      <textarea
                        value={row.prompt || ""}
                        onChange={e => {
                          onUpdate({ prompt: e.target.value, bitmapStatus: 'outdated', shared: false });
                          setPromptManuallyEdited(true);
                        }}
                        onBlur={() => setIsPromptEditing(false)}
                        autoFocus
                        className="w-full min-h-[100px] border-none p-0 text-sm font-light text-slate-700 outline-none focus:ring-0 bg-transparent resize-none leading-relaxed"
                      />
                    ) : (
                      <div
                        onClick={() => setIsPromptEditing(true)}
                        className="w-full min-h-[100px] cursor-text text-sm font-light text-slate-700 leading-relaxed"
                      >
                        {row.prompt && row.elements && row.elements.length > 0 ? (
                          <PromptRenderer prompt={row.prompt} elements={row.elements} />
                        ) : (
                          <div className="text-slate-500">{row.prompt || ""}</div>
                        )}
                      </div>
                    )}
                    {promptManuallyEdited && row.prompt && row.elements && row.elements.length > 0 && (
                      <button
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onProcess('bitmap');
                          setPromptManuallyEdited(false);
                        }}
                        className="mt-3 w-full py-2 px-3 bg-white border border-slate-200 hover:border-violet-950 text-slate-500 hover:text-violet-950 transition-all flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-widest shadow-sm animate-in fade-in slide-in-from-top-2 duration-300"
                        title={t('pipeline.produce')}
                      >
                        <Play size={12} />
                        {t('pipeline.produce')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </StepBox>
            <StepBox id="block-produce" label={t('pipeline.produce')} status={row.bitmapStatus} onRegen={() => onProcess('bitmap')} onStop={onStop} onFocus={() => onFocus('eval')} duration={row.bitmapDuration}
            >
              <div className="flex flex-col h-full gap-4">
                <div
                  id="bitmap-preview"
                  className="relative border border-slate-200 flex items-start justify-center p-4 shadow-inner overflow-hidden group/preview min-h-[250px]"
                >
                  {row.bitmap ? (
                    <>
                      <img src={row.bitmap} alt={row.UTTERANCE} className="max-w-full max-h-full object-contain transition-transform duration-500 group-hover/preview:scale-110" />
                      <button
                        onClick={(e) => { e.stopPropagation(); const a = document.createElement('a'); a.href = row.bitmap!; a.download = `${row.UTTERANCE.replace(/\s+/g, '_').toLowerCase()}.png`; a.click(); }}
                        className="absolute bottom-2 right-2 opacity-0 group-hover/preview:opacity-100 transition-opacity p-2 bg-black/60 hover:bg-black/80 text-white rounded-full shadow-lg"
                        title="Download PNG"
                      >
                        <FileDown size={14} />
                      </button>
                    </>
                  ) : (
                    <div className="text-xs text-slate-500 uppercase font-medium">{t('editor.noBitmapRender')}</div>
                  )}
                </div>

                {/* SVG Generation - same height as bitmap */}
                {row.bitmap && (
                  <div className="border-t border-slate-200 min-h-[250px] flex flex-col">
                    <SVGGenerator
                      row={row}
                      config={config}
                      onLog={onLog}
                      onUpdate={onUpdate}
                      onOpenEditor={onOpenEditor}
                      onOpenVectorizer={onOpenVectorizer}
                    />
                  </div>
                )}


              </div>
            </StepBox>
          </div>

          {/* Row Actions: Copy and Delete */}
          <div className="px-8 pb-6 bg-slate-50/30 flex justify-end gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(JSON.stringify(row, null, 2))
                  .then(() => {
                    onLog('success', t('actions.copyRowSuccess', { utterance: row.UTTERANCE }));
                  })
                  .catch((err) => {
                    onLog('error', t('actions.copyRowError', { error: err.message }));
                  });
              }}
              className="p-2 border border-slate-200 hover:border-violet-950 text-slate-500 hover:text-violet-950 transition-all bg-white shadow-sm"
              title={t('actions.copyRow')}
            >
              <Copy size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(true);
              }}
              className="p-2 border border-slate-200 hover:border-rose-600 text-slate-500 hover:text-rose-600 transition-all bg-white shadow-sm"
              title={t('actions.deleteRow')}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] animate-in fade-in duration-200" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">{t('actions.deleteRow')}</h3>
            </div>
            <div className="p-6">
              <p className="text-slate-600 leading-relaxed">{t('actions.deleteRowConfirm', { utterance: row.UTTERANCE })}</p>
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-6 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all rounded-md"
              >
                {t('actions.cancel')}
              </button>
              <button
                onClick={() => {
                  onDelete();
                  setShowDeleteConfirm(false);
                }}
                className="px-6 py-2.5 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 transition-all rounded-md shadow-lg"
              >
                {t('actions.delete')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const StepBox: React.FC<{ id?: string; label: string; status: StepStatus; onRegen: () => void; onStop: () => void; onFocus: () => void; duration?: number; children: React.ReactNode; actionNode?: React.ReactNode; }> = ({ id, label, status, onRegen, onStop, onFocus, duration, children, actionNode }) => {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  useEffect(() => {
    let raf: number;
    if (status === 'processing') {
      startRef.current = Date.now();
      const tick = () => {
        setElapsed((Date.now() - startRef.current) / 1000);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } else {
      setElapsed(0);
    }
    return () => cancelAnimationFrame(raf);
  }, [status]);

  const bg = status === 'processing' ? 'bg-orange-50/50' : status === 'completed' ? 'bg-white' : status === 'outdated' ? 'bg-amber-50/50' : 'bg-slate-50/50';

  return (
    <div id={id} role="region" aria-label={label} className={`flex flex-col gap-4 min-h-[500px] border p-6 transition-all shadow-sm ${bg}`}>
      <div className="flex items-center justify-between border-b pb-4 border-slate-100">
        <h3 className="text-xs font-medium uppercase tracking-wider text-slate-900">{label}</h3>
        <div className="flex items-center gap-3">
          {status === 'processing' ? (
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-medium text-orange-600">{elapsed.toFixed(1)}s</span>
              <button onClick={onStop} className="p-2 bg-orange-600 text-white animate-spectral rounded-full"><Square size={14} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {duration && <span className="text-xs text-slate-500 font-mono font-medium">{duration.toFixed(1)}s</span>}
              {actionNode}
              <button onClick={onFocus} className="p-2 border hover:border-violet-950 text-slate-500 hover:text-violet-950 transition-all rounded-full" aria-label="Focus view"><Maximize size={14} aria-hidden="true" /></button>
              <button onClick={onRegen} className="p-2 border hover:border-violet-950 text-slate-500 hover:text-violet-950 transition-all rounded-full" aria-label="Regenerate"><Play size={14} aria-hidden="true" /></button>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
};

const SmartNLUEditor: React.FC<{
  data: any;
  onUpdate: (v: any) => void;
  config: GlobalConfig;
  onConfigChange: (c: Partial<GlobalConfig>) => void;
}> = ({ data, onUpdate, config, onConfigChange }) => {
  const { t, lang: uiLang, setLang } = useTranslation();
  const nlu = useMemo<Partial<NLUData>>(() => {
    if (typeof data === 'string') {
      try { return JSON.parse(data); } catch (e) { return {}; }
    }
    return data || {};
  }, [data]);

  const updateField = (path: (string | number)[], value: any) => {
    const next = JSON.parse(JSON.stringify(nlu));
    let current = next;
    for (let i = 0; i < path.length - 1; i++) {
      if (current[path[i]] === undefined) {
        current[path[i]] = (typeof path[i + 1] === 'number') ? [] : {};
      }
      current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
    onUpdate(next);
  };

  const renderEditableDict = (dict: Record<string, string> | undefined, path: string) => {
    return (
      <div className="space-y-2 text-xs bg-slate-50 p-2 border">
        {Object.entries(dict || {}).map(([key, value]) => (
          <div key={key} className="grid grid-cols-3 gap-2 items-start">
            <span className="font-mono text-slate-500 truncate col-span-1 pt-1">{key}</span>
            <textarea
              rows={1}
              value={value}
              onChange={e => {
                updateField([path, key], e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              onInput={e => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = 'auto';
                t.style.height = t.scrollHeight + 'px';
              }}
              ref={el => {
                if (el) {
                  el.style.height = 'auto';
                  el.style.height = el.scrollHeight + 'px';
                }
              }}
              className="col-span-2 w-full bg-white border-b outline-none focus:border-violet-400 resize-none overflow-hidden"
            />
          </div>
        ))}
      </div>
    );
  };

  const domainLabels: Record<string, Record<string, string>> = {
    'es-419': {
      transporte: 'Transporte', salud: 'Salud', alimentación: 'Alimentación',
      educación: 'Educación', vida_cotidiana: 'Vida Cotidiana', trabajo: 'Trabajo',
      emociones: 'Emociones', tiempo_libre: 'Tiempo Libre', dinero: 'Dinero',
      seguridad: 'Seguridad', comunicación: 'Comunicación', lugar: 'Lugar',
      trámites: 'Trámites',
    },
    'en-GB': {
      transporte: 'Transport', salud: 'Health', alimentación: 'Food',
      educación: 'Education', vida_cotidiana: 'Daily Life', trabajo: 'Work',
      emociones: 'Emotions', tiempo_libre: 'Leisure', dinero: 'Money',
      seguridad: 'Safety', comunicación: 'Communication', lugar: 'Place',
      trámites: 'Paperwork',
    },
  };

  const getDomainLabel = (key: string) => {
    return domainLabels[uiLang]?.[key] || domainLabels['es-419']?.[key] || key;
  };

  return (
    <div className="space-y-4">
      {/* CONTEXTO section */}
      <div id="nlu-context" className="border bg-white p-3 shadow-sm text-xs space-y-2">
        <span className="nlu-key uppercase">{t('editor.context')}</span>
        <div className="mt-2 space-y-2 pt-2 border-t">
          {/* Language selector */}
          <div className="grid grid-cols-3 gap-2 items-center">
            <label className="font-mono text-slate-500 truncate col-span-1">{t('editor.language')}</label>
            <select
              value={config.lang}
              onChange={e => {
                const newLang = e.target.value;
                onConfigChange({ lang: newLang, uiLang: newLang as 'es-419' | 'en-GB' });
                setLang(newLang as Locale);
              }}
              className="col-span-2 w-full bg-white border-b outline-none focus:border-violet-400 text-xs p-1"
            >
              <option value="es-419">Español</option>
              <option value="en-GB">English</option>
            </select>
          </div>
          {/* Domain selector */}
          <div className="grid grid-cols-3 gap-2 items-center">
            <label className="font-mono text-slate-500 truncate col-span-1">{t('editor.domain')}</label>
            <select
              value={nlu.domain || ''}
              onChange={e => {
                updateField(['domain'], e.target.value);
                // Mark NLU as outdated so user can regenerate
                onUpdate({ ...nlu, domain: e.target.value });
              }}
              className="col-span-2 w-full bg-white border-b outline-none focus:border-violet-400 text-xs p-1"
            >
              <option value="" disabled>{t('placeholders.selectOption')}</option>
              {VOCAB.domain.map(d => <option key={d} value={d}>{getDomainLabel(d)}</option>)}
            </select>
          </div>
          {/* Geo region (read-only) */}
          <div className="grid grid-cols-3 gap-2 items-center">
            <label className="font-mono text-slate-500 truncate col-span-1">{t('editor.region')}</label>
            <div className="col-span-2 flex items-center gap-1 text-xs">
              <span className={config.geoContext?.region ? 'text-slate-700' : 'text-slate-500 italic'}>
                {config.geoContext?.region || t('editor.regionNotConfigured')}
              </span>
              <span className="text-slate-500 cursor-help" title={t('editor.regionTooltip')}>
                <HelpCircle size={12} />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* METADATA CLASSIFICATION */}
      <details className="border bg-white p-3 shadow-sm text-xs" open>
        <summary className="nlu-key cursor-pointer uppercase">{t('editor.metadataClassification')}</summary>
        <div className="mt-3 space-y-2 pt-3 border-t">
          <div className="grid grid-cols-3 gap-2 items-center">
            <label className="font-mono text-slate-500 truncate col-span-1">speech_act</label>
            <select
              value={nlu.metadata?.speech_act || ''}
              onChange={e => updateField(['metadata', 'speech_act'], e.target.value)}
              className="col-span-2 w-full bg-white border-b outline-none focus:border-violet-400 text-xs p-1"
            >
              <option value="" disabled>Select...</option>
              {VOCAB.speech_act.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2 items-center">
            <label className="font-mono text-slate-500 truncate col-span-1">intent</label>
            <select
              value={nlu.metadata?.intent || ''}
              onChange={e => updateField(['metadata', 'intent'], e.target.value)}
              className="col-span-2 w-full bg-white border-b outline-none focus:border-violet-400 text-xs p-1"
            >
              <option value="" disabled>Select...</option>
              {VOCAB.intent.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
        </div>
      </details>

      {/* FRAMES */}
      {nlu.frames?.map((frame, fIdx) => (
        <details key={fIdx} className="border bg-white p-3 shadow-sm text-xs" open>
          <summary className="nlu-key cursor-pointer uppercase">
            {frame.frame_label || frame.frame_name}
            {' '}<span className="font-mono lowercase text-violet-500" title={frame.frame_name}>({frame.lexical_unit})</span>
          </summary>
          <div className="mt-3 space-y-2 pt-3 border-t">
            {frame.frame_label && frame.frame_name !== frame.frame_label && (
              <div className="text-xs text-slate-500 font-mono mb-1">FrameNet: {frame.frame_name}</div>
            )}
            {Object.entries(frame.roles || {}).map(([role, rawData]) => {
              const data = rawData as NLUFrameRole;
              return (
                <div key={role} className="flex gap-2">
                  <span className="font-medium w-20 text-slate-500 shrink-0">{role}:</span>
                  <span className="text-slate-900 truncate">{data.surface} <span className="text-xs text-violet-400">[{data.type}]</span></span>
                </div>
              )
            })}
          </div>
        </details>
      ))}

      {/* DETAILED LINGUISTIC ANALYSIS — expanded by default */}
      <details className="border bg-white p-3 shadow-sm text-xs" open>
        <summary className="nlu-key cursor-pointer">{t('editor.detailedAnalysis').toUpperCase()}</summary>
        <div className="mt-3 space-y-4 pt-3 border-t">
          <div>
            <h4 className="nlu-key mb-1">{t('editor.nsmExplications').toUpperCase()}</h4>
            {renderEditableDict(nlu.nsm_explications, 'nsm_explications')}
          </div>
          <div>
            <h4 className="nlu-key mb-1">{t('editor.logicalForm').toUpperCase()}</h4>
            {renderEditableDict(nlu.logical_form as unknown as Record<string, string>, 'logical_form')}
          </div>
          <div>
            <h4 className="nlu-key mb-1">{t('editor.pragmatics').toUpperCase()}</h4>
            {renderEditableDict(nlu.pragmatics as unknown as Record<string, string>, 'pragmatics')}
          </div>
        </div>
      </details>
    </div>
  );
};

const PromptRenderer: React.FC<{ prompt: string; elements: VisualElement[] }> = ({ prompt, elements }) => {
  if (!prompt) return null;

  // Collect all element IDs recursively
  const getAllElementIds = (items: VisualElement[]): string[] => {
    return items.flatMap(item => [
      item.id,
      ...(item.children ? getAllElementIds(item.children) : [])
    ]);
  };

  const elementIds = getAllElementIds(elements);

  // Parse prompt and replace 'element_id' with pills
  const renderPromptWithPills = () => {
    // Match single-quoted strings that are element IDs
    const regex = /'([^']+)'/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(prompt)) !== null) {
      const beforeText = prompt.substring(lastIndex, match.index);
      const quotedText = match[1];

      // Add text before the match
      if (beforeText) {
        parts.push(beforeText);
      }

      // Check if quoted text is an element ID
      if (elementIds.includes(quotedText)) {
        parts.push(
          <span key={match.index} className="element-pill">
            {quotedText}
          </span>
        );
      } else {
        // Not an element, keep the quotes
        parts.push(`'${quotedText}'`);
      }

      lastIndex = regex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < prompt.length) {
      parts.push(prompt.substring(lastIndex));
    }

    return parts;
  };

  return (
    <div className="prompt-text text-sm text-slate-600 leading-relaxed p-3 bg-slate-50 rounded border border-slate-200">
      {renderPromptWithPills()}
    </div>
  );
};

const ElementsEditor: React.FC<{ elements: VisualElement[]; onUpdate: (v: VisualElement[]) => void; }> = ({ elements, onUpdate }) => {
  const { t } = useTranslation();
  const safeElements = Array.isArray(elements) ? elements : [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  const addElement = (parentId: string | null = null) => {
    const newId = `elemento`;
    const newElement: VisualElement = { id: newId };

    if (parentId === null) {
      onUpdate([...safeElements, newElement]);
    } else {
      const update = (items: VisualElement[]): VisualElement[] => {
        return items.map(item => {
          if (item.id === parentId) {
            return { ...item, children: [...(item.children || []), newElement] };
          }
          if (item.children) {
            return { ...item, children: update(item.children) };
          }
          return item;
        });
      };
      onUpdate(update(safeElements));
    }
    // Auto-select new element for editing
    setTimeout(() => {
      setEditingId(newId);
      setEditingValue(newId);
    }, 50);
  };

  const removeElement = (idToRemove: string) => {
    const filter = (items: VisualElement[]): VisualElement[] => {
      return items
        .filter(item => item.id !== idToRemove)
        .map(item => {
          if (item.children) {
            return { ...item, children: filter(item.children) };
          }
          return item;
        });
    };
    onUpdate(filter(safeElements));
  };

  const updateElementId = (oldId: string, newId: string) => {
    if (!newId.trim() || newId === oldId) {
      setEditingId(null);
      return;
    }
    const update = (items: VisualElement[]): VisualElement[] => {
      return items.map(item => {
        if (item.id === oldId) {
          return { ...item, id: newId.trim() };
        }
        if (item.children) {
          return { ...item, children: update(item.children) };
        }
        return item;
      });
    };
    onUpdate(update(safeElements));
    setEditingId(null);
  };

  const handlePillClick = (element: VisualElement) => {
    setEditingId(element.id);
    setEditingValue(element.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent, elementId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      updateElementId(elementId, editingValue);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  const renderElement = (element: VisualElement, level = 0, isLast = false) => {
    const isEditing = editingId === element.id;
    const isRoot = level === 0;

    return (
      <div key={element.id} className={`element-item ${isRoot ? 'element-root' : ''}`}>
        {!isRoot && <div className="element-dot" />}

        <div className="flex items-center gap-2">
          {isEditing ? (
            <div className="element-pill element-editing">
              <input
                type="text"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={() => updateElementId(element.id, editingValue)}
                onKeyDown={(e) => handleKeyDown(e, element.id)}
                autoFocus
                className="element-pill-input"
              />
            </div>
          ) : (
            <div className="element-pill" onClick={() => handlePillClick(element)}>
              {element.id}
            </div>
          )}

          <div className="element-actions">
            <button
              onClick={() => addElement(element.id)}
              className="element-action-btn"
              title="Agregar hijo"
            >
              <CornerDownRight size={12} />
            </button>
            <button
              onClick={() => removeElement(element.id)}
              className="element-action-btn delete"
              title="Eliminar"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {element.children && element.children.length > 0 && (
          <div>
            {element.children.map((child, idx) =>
              renderElement(child, level + 1, idx === element.children!.length - 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="border p-4 min-h-[120px] bg-white shadow-inner">
      <div className="element-tree">
        {safeElements.map((el, idx) => renderElement(el, 0, idx === safeElements.length - 1))}
      </div>
      <button
        onClick={() => addElement(null)}
        className="mt-4 pt-3 border-t border-slate-200 text-left text-xs font-bold text-violet-600 hover:text-violet-900 transition-colors w-full flex items-center gap-2 uppercase tracking-wider"
      >
        <Plus size={14} /> {t('editor.addRootElement')}
      </button>
    </div>
  );
};

const Badge: React.FC<{ step: number; label: string; status: StepStatus }> = ({ step, label, status }) => {
  const styles = {
    idle: 'bg-slate-100 text-slate-500 border-slate-200',
    processing: 'bg-orange-600 text-white animate-pulse border-orange-500',
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    outdated: 'bg-amber-50 text-amber-800 border-amber-300',
    error: 'bg-rose-50 text-rose-700 border-rose-300'
  };
  const tooltipId = `badge-tip-${step}`;
  return (
    <div className="group/badge relative">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all cursor-default ${styles[status]}`}
        aria-describedby={tooltipId}
        tabIndex={0}
      >
        {step}
      </div>
      <div
        id={tooltipId}
        role="tooltip"
        className="invisible group-hover/badge:visible group-focus-within/badge:visible absolute left-1/2 -translate-x-1/2 bottom-full mb-2 whitespace-nowrap bg-slate-900 text-white text-xs font-medium px-2.5 py-1 rounded shadow-lg z-50 pointer-events-none"
      >
        {label}
      </div>
    </div>
  );
};

const FOCUS_STEPS = ['nlu', 'visual', 'bitmap', 'eval'] as const;

const FocusViewModal: React.FC<{
  mode: 'nlu' | 'visual' | 'bitmap' | 'eval';
  row: RowData;
  onClose: () => void;
  onUpdate: (updates: Partial<RowData>) => void;
  onShare: () => void;
  onRegeneratePrompt: () => void;
  config: GlobalConfig;
  onConfigChange: (partial: Partial<GlobalConfig>) => void;
  onLog: (type: 'info' | 'error' | 'success', message: string) => void;
  onOpenEditor?: () => void;
  onOpenVectorizer?: () => void;
  onModeChange: (mode: 'nlu' | 'visual' | 'bitmap' | 'eval') => void;
}> = ({ mode, row, onClose, onUpdate, onShare, onRegeneratePrompt, config, onConfigChange, onLog, onOpenEditor, onOpenVectorizer, onModeChange }) => {
  const { t } = useTranslation();
  const { dialogProps: focusDialogProps } = useDialogA11y({ isOpen: true, onClose, label: `${row.UTTERANCE} — ${mode}` });
  const [copyStatus, setCopyStatus] = useState(t('actions.copy'));
  const [isPromptEditing, setIsPromptEditing] = useState(false);
  const [elementsManuallyEdited, setElementsManuallyEdited] = useState(false);
  const [isRegeneratingPrompt, setIsRegeneratingPrompt] = useState(false);

  const currentIndex = FOCUS_STEPS.indexOf(mode);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < FOCUS_STEPS.length - 1;
  const goToPrev = () => { if (hasPrev) onModeChange(FOCUS_STEPS[currentIndex - 1]); };
  const goToNext = () => { if (hasNext) onModeChange(FOCUS_STEPS[currentIndex + 1]); };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goToPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); goToNext(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex]);

  const handleCopy = () => {
    let contentToCopy: string = '';
    if (mode === 'nlu') {
      contentToCopy = JSON.stringify(row.NLU, null, 2);
    } else if (mode === 'visual') {
      contentToCopy = JSON.stringify({ "elements": row.elements, "prompt": row.prompt }, null, 2);
    } else if (mode === 'bitmap') {
      contentToCopy = row.prompt || '';
    }

    if (contentToCopy) {
      navigator.clipboard.writeText(contentToCopy).then(() => {
        setCopyStatus(t('actions.copied'));
        setTimeout(() => setCopyStatus(t('actions.copy')), 2000);
      });
    }
  };

  const titleMap: Record<string, string> = {
    nlu: t('pipeline.understand'),
    visual: t('pipeline.compose'),
    bitmap: t('pipeline.produce'),
    eval: t('pipeline.evaluate')
  };

  const renderContent = () => {
    switch (mode) {
      case 'nlu': return <SmartNLUEditor data={row.NLU} onUpdate={val => onUpdate({ NLU: val, visualStatus: 'outdated', bitmapStatus: 'outdated' })} config={config} onConfigChange={onConfigChange} />;
      case 'visual': return (
        <div className="flex flex-col h-full gap-6">
          <div>
            <label className="text-xs font-medium uppercase text-slate-500 block mb-2 tracking-widest">{t('editor.hierarchicalElements')}</label>
            <ElementsEditor elements={row.elements || []} onUpdate={val => {
              onUpdate({ elements: val, bitmapStatus: 'outdated', shared: false });
              setElementsManuallyEdited(true);
            }} />
            {elementsManuallyEdited && row.NLU && row.elements && row.elements.length > 0 && (
              <button
                onMouseDown={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsRegeneratingPrompt(true);
                  await onRegeneratePrompt();
                  setIsRegeneratingPrompt(false);
                  setElementsManuallyEdited(false);
                }}
                disabled={isRegeneratingPrompt}
                className="mt-3 w-full py-2 px-3 bg-violet-950 hover:bg-black text-white transition-all flex items-center justify-end gap-2 text-xs font-bold uppercase tracking-widest shadow-lg disabled:opacity-50 disabled:cursor-not-allowed animate-in fade-in slide-in-from-top-2 duration-300"
                title={t('actions.regeneratePrompt')}
              >
                {isRegeneratingPrompt ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    {t('actions.regenerate')}...
                  </>
                ) : (
                  <>
                    <RefreshCw size={12} />
                    {t('actions.regeneratePrompt')}
                  </>
                )}
              </button>
            )}
          </div>
          <div className="flex-1 mt-6 border-t pt-6 border-slate-200">
            <label className="text-xs font-medium uppercase text-slate-500 block mb-3 tracking-widest">{t('editor.spatialLogic')}</label>
            {isPromptEditing ? (
              <textarea
                value={row.prompt || ""}
                onChange={e => onUpdate({ prompt: e.target.value, bitmapStatus: 'outdated', shared: false })}
                onBlur={() => setIsPromptEditing(false)}
                autoFocus
                className="w-full h-full border-none p-0 text-lg font-light text-slate-700 outline-none focus:ring-0 bg-transparent resize-none leading-relaxed"
              />
            ) : (
              <div
                onClick={() => setIsPromptEditing(true)}
                className="w-full h-full cursor-text text-lg font-light text-slate-700 leading-relaxed"
              >
                {row.prompt && row.elements && row.elements.length > 0 ? (
                  <PromptRenderer prompt={row.prompt} elements={row.elements} />
                ) : (
                  <div className="text-slate-500">{row.prompt || ""}</div>
                )}
              </div>
            )}
          </div>
        </div>
      );
      case 'bitmap':
        return (
          <div className="flex items-center justify-center h-full bg-neutral-200 p-8 border-2 border-slate-300 shadow-inner">
            {row.bitmap ? (
              <img src={row.bitmap} className="max-w-full max-h-full object-contain shadow-2xl bg-white" alt={row.UTTERANCE} />
            ) : (
              <p className="text-slate-500 font-mono">No bitmap generated yet.</p>
            )}
          </div>
        );
      case 'eval':
        return (
          <div className="flex h-full bg-slate-50 gap-0">
            {/* Left: Bitmap (top-aligned, compact) */}
            <div className="w-5/12 bg-white border-r border-slate-200 flex items-start justify-center p-8 relative">
              <div className="absolute inset-0 pattern-grid-sm opacity-5 pointer-events-none"></div>
              {row.bitmap ? (
                <img src={row.bitmap} alt={row.UTTERANCE} className="max-w-full max-h-full object-contain shadow-lg" />
              ) : (
                <div className="text-slate-500 font-mono text-xs">{t('editor.noBitmapReference')}</div>
              )}
            </div>

            {/* Right: SVG Generator + Share (stretches to fill) */}
            <div className="w-7/12 p-6 bg-slate-50 flex flex-col">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xs font-bold uppercase text-slate-500 tracking-widest">SVG Output (SSoT)</h3>
                {(() => {
                  const isShared = row.shared;
                  return (
                    <button
                      onClick={onShare}
                      disabled={isShared}
                      className={`p-2 transition-all shadow-sm ${isShared
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default'
                        : 'bg-slate-50 text-emerald-600 border border-emerald-500 hover:bg-emerald-50 hover:border-emerald-600'
                        }`}
                      title={isShared ? t('share.alreadyShared') : t('share.shareWithPictos')}
                    >
                      {isShared ? <CheckCircle size={14} /> : <ImageUp size={14} />}
                    </button>
                  );
                })()}
              </div>
              <div className="flex-1 overflow-hidden">
                <SVGGenerator row={row} config={config} onLog={onLog} onUpdate={onUpdate} onOpenEditor={onOpenEditor} onOpenVectorizer={onOpenVectorizer} />
              </div>
            </div>
          </div>
        );
      default: return null;
    }
  }

  return (
    <div className="focus-modal-backdrop animate-in fade-in duration-300" onClick={onClose}>
      <div className="focus-modal-content animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()} {...focusDialogProps}>
        <header className="p-4 border-b bg-white flex items-center gap-3">
          <button onClick={goToPrev} className={`p-2 hover:bg-slate-100 transition-opacity ${hasPrev ? '' : 'opacity-20 pointer-events-none'}`} aria-label="Previous step">
            <ChevronLeft size={18} />
          </button>
          <div className="flex-1 text-center min-w-0">
            <div className="flex items-center justify-center gap-3">
              <h2 className="text-sm font-bold uppercase tracking-wider">{titleMap[mode]}</h2>
              <div className="flex items-center gap-1.5">
                {FOCUS_STEPS.map((step, i) => (
                  <button
                    key={step}
                    onClick={() => onModeChange(step)}
                    className={`w-2 h-2 rounded-full transition-all ${i === currentIndex ? 'bg-violet-600 scale-125' : 'bg-slate-300 hover:bg-slate-400'}`}
                    aria-label={titleMap[step]}
                  />
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-500 truncate">{row.UTTERANCE}</p>
          </div>
          <button onClick={goToNext} className={`p-2 hover:bg-slate-100 transition-opacity ${hasNext ? '' : 'opacity-20 pointer-events-none'}`} aria-label="Next step">
            <ChevronRight size={18} />
          </button>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 ml-1" aria-label={t('actions.close')}><X size={18} aria-hidden="true" /></button>
        </header>
        <main className="flex-1 p-6 overflow-auto bg-slate-50">{renderContent()}</main>
        <footer className="p-4 border-t bg-white flex justify-between gap-3">
          {/* Left actions */}
          <div className="flex gap-3">
            {(mode === 'bitmap' || mode === 'eval') && row.bitmap && (
              <button onClick={() => { const a = document.createElement('a'); a.href = row.bitmap!; a.download = `${row.UTTERANCE.replace(/\s+/g, '_').toLowerCase()}.png`; a.click(); }} className="flex items-center gap-2 bg-slate-100 text-slate-600 px-6 py-3 font-bold uppercase text-xs tracking-widest hover:bg-slate-200 transition-all">
                <Download size={14} /> PNG
              </button>
            )}
          </div>
          {/* Right actions */}
          <div className="flex gap-3">
            {mode === 'eval' && (row.structuredSvg || row.rawSvg) && onOpenEditor && (
              <button onClick={onOpenEditor} className="flex items-center gap-2 bg-slate-100 text-slate-600 px-6 py-3 font-bold uppercase text-xs tracking-widest hover:bg-slate-200 transition-all">
                <Edit size={14} /> Editar SVG
              </button>
            )}
            {mode === 'eval' && (row.structuredSvg || row.rawSvg) && (
              <button onClick={() => { const svg = row.structuredSvg || row.rawSvg!; const blob = new Blob([svg], { type: 'image/svg+xml' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${row.UTTERANCE.replace(/\s+/g, '_').toLowerCase()}.svg`; a.click(); URL.revokeObjectURL(url); }} className="flex items-center gap-2 bg-slate-100 text-slate-600 px-6 py-3 font-bold uppercase text-xs tracking-widest hover:bg-slate-200 transition-all">
                <Download size={14} /> SVG
              </button>
            )}
            <button onClick={handleCopy} className="flex items-center gap-2 bg-violet-950 text-white px-6 py-3 font-bold uppercase text-xs tracking-widest hover:bg-black transition-all shadow-lg">
              <Copy size={14} /> {copyStatus}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
};

export default App;
