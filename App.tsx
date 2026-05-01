
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import JSZip from 'jszip';
import {
  Upload, Download, Trash2, Terminal, RefreshCw, ChevronDown,
  Play, BookOpen, Search, FileDown, Square, Settings,
  X, Code, Plus, FileText, Maximize, Copy, BrainCircuit, PlusCircle, CornerDownRight, Image as ImageIcon,
  Library, ScreenShare, Globe, HelpCircle, ExternalLink, Palette, GripVertical, Edit,
  ChevronLeft, ChevronRight, ArrowUp, FileCode, Layers, LogOut, LogIn, History,
  List, LayoutGrid
} from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { RowData, LogEntry, StepStatus, NLUData, GlobalConfig, VOCAB, VisualElement, NLUFrameRole, ElementOpKind, RowInterventionLog } from './types';
import * as Gemini from './services/geminiService';
import * as Recording from './services/interventionRecording';
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
import OnboardingModal from './components/OnboardingModal';
import { RowAuditPanel } from './components/RowAuditPanel';
import { PictogramGridCell } from './components/PictogramGridCell';
import type { VectorizerResult } from './services/vtracerService';
import { injectSvgA11y } from './utils/svgAccessibility';
import { AuthProvider, logout, requestLogin, onLogin, ensureAuth } from './components/AuthGate';


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
  <label className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
    {label}
    <div className="group/tooltip relative">
      <HelpCircle size={14} className="text-orange-400 hover:text-orange-600 cursor-help" />
      <div className="invisible group-hover/tooltip:visible absolute left-0 bottom-full mb-2 w-64 bg-slate-900 text-white text-xs p-2 rounded shadow-lg z-[56] leading-relaxed">
        {tooltip}
      </div>
    </div>
  </label>
);

const DEFAULT_STYLE_PROMPTS: Record<string, string> = {
  'es-419': 'Un pictograma universal y limpio de estilo vectorial, diseñado para una alta accesibilidad cognitiva, inspirado en la señalética AIGA/DOT pero con detalles contextuales concretos añadidos. Diseño gráfico plano 2D, icono minimalista. Siluetas negras sólidas y contornos gruesos y uniformes sobre un fondo blanco puro. Usar un único color de acento tenue (como un gris neutro o un azul suave) estrictamente para resaltar el objeto principal de interacción o el contexto específico. Las figuras humanas deben ser figuras simplificadas y robustas con extremidades y articulaciones claras, sin rasgos faciales. Es crucial incluir utilería ambiental básica y literal (por ejemplo, un mueble específico, una puerta, un objeto distintivo) para definir inequívocamente el escenario. Sin sombreado, sin degradados, sin efectos 3D, sin iluminación realista. Alto contraste, centrado enteramente en acciones literales y claras. Sin texto.',
  'en-GB': 'A clean, universal vector-style pictogram designed for high cognitive accessibility, inspired by AIGA/DOT symbol signs but with added concrete contextual details. Flat 2D graphic design, minimalist icon. Solid black silhouettes and thick, uniform outlines on a pure white background. Use a single muted accent colour (like a calm grey or soft blue) strictly to highlight the primary object of interaction or specific context. Human figures must be simplified, robust stick-figures with clear limbs and joints, lacking facial features. Crucially, include basic, literal environmental props (e.g., a specific piece of furniture, a door, a distinct object) to unambiguously define the scenario. No shading, no gradients, no 3D effects, no realistic lighting. High contrast, focusing entirely on literal, clear actions. No text.',
};

function getDefaultStylePrompt(lang: string): string {
  return DEFAULT_STYLE_PROMPTS[lang] || DEFAULT_STYLE_PROMPTS['es-419'];
}

interface AppProps {
  authUser?: { email: string; user_metadata?: { full_name?: string } } | null;
}

const App: React.FC<AppProps> = ({ authUser }) => {
  const { t, lang, setLang } = useTranslation();
  const { svgs, exportSVGs, importSVGs, clearLibrary, addSVG } = useSVGLibrary();
  const [rows, setRows] = useState<RowData[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showLibraryMenu, setShowLibraryMenu] = useState(false);
  const [libraryMenuPos, setLibraryMenuPos] = useState({ top: 0, left: 0 });
  const libraryBtnRef = useRef<HTMLDivElement>(null);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [langMenuPos, setLangMenuPos] = useState({ top: 0, left: 0 });
  const langBtnRef = useRef<HTMLDivElement>(null);
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
    name: 'PICTOS.NET',
    credits: '',
    license: 'CC BY 4.0',
    visualStylePrompt: getDefaultStylePrompt('es-419'),
    geoContext: { lat: '40.4168', lng: '-3.7038', region: 'Madrid, ES' },
    annotatedContext: '',
    svgStyleDefs: INITIAL_STYLES,
    svgKeyframes: INITIAL_KEYFRAMES,
  });
  const [focusMode, setFocusMode] = useState<{ step: 'nlu' | 'visual' | 'bitmap' | 'format', rowId: string } | null>(null);
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

  // Populate credits field on first login (name + email or just email)
  useEffect(() => {
    return onLogin((user) => {
      setConfig(prev => {
        if (prev.credits) return prev; // don't overwrite user-set credits
        const name = user.user_metadata?.full_name;
        const credit = name ? `${name} <${user.email}>` : user.email;
        return { ...prev, credits: credit };
      });
    });
  }, []);

  useEffect(() => {
    localStorage.setItem('pictonet_reduce_motion', String(reduceMotion));
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);
  useEffect(() => {
    localStorage.setItem('pictonet_high_contrast', String(highContrast));
    document.documentElement.classList.toggle('high-contrast', highContrast);
  }, [highContrast]);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('pictonet_onboarding_done');
  });
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
      interventionLog: sanitizeInterventionLog(row.interventionLog),
    };
  };

  // Close any session left "active" by a previous tab close. Without this
  // sweep, an orphaned active session would coexist with a new one on next
  // open of the same row, violating SingleActiveSessionPerRow.
  const sanitizeInterventionLog = (log: any): RowInterventionLog | undefined => {
    if (!log || !Array.isArray(log.sessions)) return undefined;
    const orphanCutoff = new Date().toISOString();
    const sessions = log.sessions
      .filter((s: any) => s && typeof s.startedAt === 'string' && Array.isArray(s.events))
      .map((s: any) => ({
        startedAt: s.startedAt,
        endedAt: typeof s.endedAt === 'string' ? s.endedAt : orphanCutoff,
        events: s.events,
      }));
    return { sessions };
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

    // Scroll the new row into view, offset below the sticky toolbar.
    // Double rAF + setTimeout fallback: React may need >1 frame to render
    // the expanded row content after state change.
    const doScroll = () => {
      const el = document.getElementById(`picto-row-${openRowId}`);
      if (!el) return;
      const headerHeight = document.getElementById('toolbar')?.offsetHeight ?? 80;
      const top = el.getBoundingClientRect().top + window.scrollY - headerHeight - 16;
      window.scrollTo({ top, behavior: 'smooth' });
    };

    requestAnimationFrame(() => requestAnimationFrame(doScroll));
    // Safety net: if rAF fires before layout settles, retry after paint
    const timer = setTimeout(doScroll, 150);
    return () => clearTimeout(timer);
  }, [openRowId]);

  // Auto-cascade: when a new row with real text is added, start the pipeline
  useEffect(() => {
    const targetId = autoCascadeRef.current;
    if (!targetId) return;
    if (!rows.some(r => r.id === targetId)) return;
    autoCascadeRef.current = null;
    processCascade(targetId);
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
      addLog('success', t('messages.importSuccess', { count: newRows.length }));
    } catch (e) {
      addLog('error', t('messages.processingError'));
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
    const safeFilename = config.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'pictonet';
    a.download = `${safeFilename}_graph_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('success', t('messages.exportSuccess'));
  };

  const handleImportProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Warn user about replacement
    if (!window.confirm(t('messages.libraryImportWarning'))) {
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
          addLog('success', t('messages.importLegacy', { count: sanitized.length }));
        }
        else if (parsed.rows && Array.isArray(parsed.rows)) {
          const sanitized = parsed.rows.map(sanitizeRow);
          setRows(sanitized);
          if (parsed.config) {
            const newConfig = { ...parsed.config };
            // Retrocompatibilidad: author → name
            if (!newConfig.name && newConfig.author) {
              newConfig.name = newConfig.author;
              delete newConfig.author;
            }
            if (!newConfig.aspectRatio) newConfig.aspectRatio = '1:1';
            if (!newConfig.imageModel) newConfig.imageModel = 'flash';
            if (!newConfig.credits) newConfig.credits = '';
            if (!newConfig.license) newConfig.license = 'cc-by';
            setConfig(newConfig);
            addLog('info', t('messages.configRestored'));
          }
          if (parsed.svgs && Array.isArray(parsed.svgs)) {
            const count = importSVGs(parsed.svgs);
            if (count > 0) addLog('success', t('messages.svgLibraryRestored', { count }));
          }
          addLog('success', t('messages.graphRestored', { count: sanitized.length }));
        } else {
          throw new Error(t('messages.fileFormatError'));
        }
        setViewMode('list');
      } catch (err) {
        addLog('error', t('messages.importError'));
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
    handleOpenRowChange(newId);
    setShowConfig(false);
    setSearchValue('');
    setIsSearching(false);
  };

  const handleLibraryMenuToggle = () => {
    if (!showLibraryMenu && libraryBtnRef.current) {
      const rect = libraryBtnRef.current.getBoundingClientRect();
      const DROPDOWN_WIDTH = 224;
      setLibraryMenuPos({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - DROPDOWN_WIDTH),
      });
    }
    setShowLibraryMenu(!showLibraryMenu);
  };

  const handleLangMenuToggle = () => {
    if (!showLangMenu && langBtnRef.current) {
      const rect = langBtnRef.current.getBoundingClientRect();
      const DROPDOWN_WIDTH = 140;
      setLangMenuPos({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - DROPDOWN_WIDTH),
      });
    }
    setShowLangMenu(!showLangMenu);
  };

  const handleLangSelect = (newLang: Locale) => {
    setLang(newLang);
    setConfig(prev => {
      const isDefault = Object.values(DEFAULT_STYLE_PROMPTS).includes(prev.visualStylePrompt);
      return {
        ...prev,
        lang: newLang,
        uiLang: newLang,
        ...(isDefault ? { visualStylePrompt: getDefaultStylePrompt(newLang) } : {}),
      };
    });
    setShowLangMenu(false);
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
          const loadedConfig = { ...data.config };
          // Retrocompatibilidad: author → name
          if (!loadedConfig.name && loadedConfig.author) {
            loadedConfig.name = loadedConfig.author;
            delete loadedConfig.author;
          }
          setConfig(prev => ({ ...prev, ...loadedConfig }));
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

  // === Intervention recording (see specs/intervention-recording.allium) ===

  // Snapshot of phase artifacts at session start / last commit, used to detect
  // edits at settle moments (row close, regenerate). Element edits commit
  // eagerly with explicit op, so they bypass this comparison.
  type PhaseSnapshot = { utterance?: string; nlu?: unknown; elements?: unknown; prompt?: string };
  const phaseSnapshotsRef = useRef<Record<string, PhaseSnapshot>>({});

  const takeSnapshot = (row: RowData): PhaseSnapshot => ({
    utterance: row.UTTERANCE,
    nlu: row.NLU,
    elements: row.elements,
    prompt: row.prompt,
  });

  const startRecordingSession = useCallback((rowId: string) => {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const next = Recording.startSession(r, config);
      phaseSnapshotsRef.current[rowId] = takeSnapshot(next);
      return next;
    }));
  }, [config]);

  // Pure settle: takes (row, snap) and returns { row, snap } with edits emitted.
  // Mutating the ref inside a setRows updater is unsafe under StrictMode, which
  // runs updaters twice — the second run would see the mutation from the first
  // and skip emission. Callers capture snap before setRows and update after.
  const settleEditsPure = useCallback((row: RowData, snap: PhaseSnapshot | undefined): { row: RowData; snap: PhaseSnapshot | undefined } => {
    if (!snap) {
      const hasActive = row.interventionLog?.sessions.some(s => !s.endedAt) ?? false;
      if (!hasActive) return { row, snap: undefined };
      return { row, snap: takeSnapshot(row) };
    }
    let next = row;
    if (row.UTTERANCE !== snap.utterance) {
      next = Recording.recordEdit(next, config, { phase: 'utterance', before: snap.utterance ?? '', after: row.UTTERANCE });
    }
    if (JSON.stringify(row.NLU) !== JSON.stringify(snap.nlu)) {
      next = Recording.recordEdit(next, config, { phase: 'nlu', before: snap.nlu, after: row.NLU });
    }
    if ((row.prompt ?? '') !== (snap.prompt ?? '')) {
      next = Recording.recordEdit(next, config, { phase: 'prompt', before: snap.prompt ?? '', after: row.prompt ?? '' });
    }
    return { row: next, snap: takeSnapshot(next) };
  }, [config]);

  const endRecordingSession = useCallback((rowId: string) => {
    const oldSnap = phaseSnapshotsRef.current[rowId];
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const { row: settled } = settleEditsPure(r, oldSnap);
      return Recording.endSession(settled);
    }));
    delete phaseSnapshotsRef.current[rowId];
  }, [settleEditsPure]);

  // Side effects run from a useEffect so StrictMode's double-invocation of
  // setState updaters does not double-call session lifecycle helpers.
  const previousOpenRowIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = previousOpenRowIdRef.current;
    if (prev && prev !== openRowId) endRecordingSession(prev);
    if (openRowId && prev !== openRowId) startRecordingSession(openRowId);
    previousOpenRowIdRef.current = openRowId;
  }, [openRowId, startRecordingSession, endRecordingSession]);

  const handleOpenRowChange = useCallback((nextOpenId: string | null) => {
    setOpenRowId(nextOpenId);
  }, []);

  // Element operations commit eagerly with explicit op kind.
  const recordElementOp = useCallback((rowId: string, op: ElementOpKind, before: unknown, after: unknown) => {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const next = Recording.recordEdit(r, config, { phase: 'elements', op, before, after });
      const snap = phaseSnapshotsRef.current[rowId];
      if (snap) phaseSnapshotsRef.current[rowId] = { ...snap, elements: after };
      return next;
    }));
  }, [config]);

  const updateRowInterventionLog = useCallback((rowId: string, log: RowInterventionLog | null) => {
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      if (log === null) {
        const cleared = Recording.clearLog(r);
        delete phaseSnapshotsRef.current[rowId];
        return cleared;
      }
      return Recording.replaceLog(r, log);
    }));
  }, []);

  // Settle pending edits before a regeneration, so the discard event is
  // ordered after any unrecorded manual edit on the same phase. The snapshot
  // is captured before setRows and updated after, keeping the updater pure
  // so StrictMode's double-invocation does not skip emission.
  const settleRowEdits = useCallback((rowId: string) => {
    const oldSnap = phaseSnapshotsRef.current[rowId];
    let nextSnap: PhaseSnapshot | undefined = oldSnap;
    setRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      const result = settleEditsPure(r, oldSnap);
      nextSnap = result.snap;
      return result.row;
    }));
    if (nextSnap) phaseSnapshotsRef.current[rowId] = nextSnap;
  }, [settleEditsPure]);

  // Record a discard event for a phase whose previous value is being replaced
  // by a fresh generation. Updates the phase snapshot to the new value so that
  // a subsequent settle does not also emit an edit event for this phase.
  const recordPhaseRegen = useCallback((rowId: string, phase: 'utterance' | 'nlu' | 'elements' | 'prompt', before: unknown, after: unknown) => {
    const hadValue = before !== undefined && before !== null && before !== '' &&
      !(Array.isArray(before) && before.length === 0);
    if (hadValue) {
      setRows(prev => prev.map(r => {
        if (r.id !== rowId) return r;
        return Recording.recordDiscard(r, config, { phase, before });
      }));
    }
    const snap = phaseSnapshotsRef.current[rowId];
    if (snap) {
      if (phase === 'nlu') snap.nlu = after;
      else if (phase === 'elements') snap.elements = after;
      else if (phase === 'prompt') snap.prompt = after as string;
      else if (phase === 'utterance') snap.utterance = after as string;
    }
  }, [config]);

  const regeneratePrompt = async (rowId: string): Promise<boolean> => {
    const row = rows.find(r => r.id === rowId);
    if (!row || !row.NLU || !row.elements) {
      addLog('error', 'Se requiere NLU y elementos para regenerar el prompt');
      return false;
    }

    stopFlags.current[rowId] = false;
    settleRowEdits(rowId);
    const beforePrompt = row.prompt;
    updateRowById(rowId, { visualStatus: 'processing' });
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

      if (stopFlags.current[rowId]) {
        addLog('info', t('messages.promptRegenerationStopped'));
        updateRowById(rowId, { visualStatus: 'completed' });
        return false;
      }

      const duration = (Date.now() - startTime) / 1000;
      updateRowById(rowId, {
        prompt: newPrompt,
        visualStatus: 'completed',
        visualDuration: duration,
        bitmapStatus: 'outdated'
      });
      recordPhaseRegen(rowId, 'prompt', beforePrompt, newPrompt);
      addLog('success', `Prompt regenerado en ${duration.toFixed(1)}s: "${newPrompt.substring(0, 50)}..."`);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      addLog('error', `Error al regenerar prompt: ${msg}`);
      updateRowById(rowId, { visualStatus: 'completed' });
      return false;
    }
  };

  const processStep = async (rowId: string, step: 'nlu' | 'visual' | 'bitmap'): Promise<boolean> => {
    // Pre-flight: garantizar sesión antes de tocar estado de UI.
    try {
      await ensureAuth();
    } catch {
      return false;
    }

    const row = rows.find(r => r.id === rowId);
    if (!row) return false;

    stopFlags.current[rowId] = false;
    const statusKey = `${step}Status` as keyof RowData;
    const durationKey = `${step}Duration` as keyof RowData;

    // Settle pending manual edits as edit events before recording any discards.
    if (step !== 'bitmap') settleRowEdits(rowId);
    const beforeNLU = row.NLU;
    const beforeElements = row.elements;
    const beforePrompt = row.prompt;

    updateRowById(rowId, { [statusKey]: 'processing' });
    const startTime = Date.now();

    try {
      let result: any;
      if (step === 'nlu') {
        result = await Gemini.generateNLU(row.UTTERANCE, addLog, config);
      } else if (step === 'visual') {
        if (!row.NLU) throw new Error('No NLU data — run COMPRENDER first');
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

      if (stopFlags.current[rowId]) {
        addLog('info', `Proceso detenido por usuario en paso ${step.toUpperCase()}`);
        updateRowById(rowId, { [statusKey]: 'idle' });
        return false;
      }

      const duration = (Date.now() - startTime) / 1000;
      updateRowById(rowId, {
        [statusKey]: 'completed',
        [durationKey]: duration,
        ...(step === 'nlu' ? { NLU: result, visualStatus: 'outdated', bitmapStatus: 'outdated' } : {}),
        ...(step === 'visual' ? { elements: result.elements, prompt: result.prompt, bitmapStatus: 'outdated' } : {}),
        ...(step === 'bitmap' ? { bitmap: result, status: 'completed' } : {})
      });
      if (step === 'nlu') {
        recordPhaseRegen(rowId, 'nlu', beforeNLU, result);
      } else if (step === 'visual') {
        recordPhaseRegen(rowId, 'elements', beforeElements, result.elements);
        recordPhaseRegen(rowId, 'prompt', beforePrompt, result.prompt);
      }
      addLog('success', `${step.toUpperCase()} completo: ${duration.toFixed(1)}s para "${row.UTTERANCE}"`);

      if (step === 'bitmap') {
        requestAnimationFrame(() => {
          const rowEl = document.getElementById(`picto-row-${rowId}`);
          const bitmapEl = rowEl?.querySelector('#bitmap-preview');
          if (bitmapEl) bitmapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
      return true;
    } catch (err: any) {
      updateRowById(rowId, { [statusKey]: 'error' });
      addLog('error', `${step.toUpperCase()} Error para "${row.UTTERANCE}": ${err.message}`);
      return false;
    }
  };

  const processCascade = async (rowId: string) => {
    // Pre-flight: garantizar sesión antes de tocar estado de UI.
    // Si el usuario cancela el login, salir silenciosamente.
    try {
      await ensureAuth();
    } catch {
      return;
    }

    const row = rows.find(r => r.id === rowId);
    if (!row) return;

    stopFlags.current[row.id] = false;
    addLog('info', t('messages.cascadeStarted', { utterance: row.UTTERANCE }));

    // Settle pending manual edits before the cascade discards downstream artifacts.
    settleRowEdits(rowId);
    const beforeNLU = row.NLU;
    const beforeElements = row.elements;
    const beforePrompt = row.prompt;

    const stepNames = { nlu: t('pipeline.understand'), visual: t('pipeline.compose'), bitmap: t('pipeline.produce') };
    let finalUpdates: Partial<RowData> = { status: 'processing' };

    try {
      // --- NLU Step ---
      addLog('info', t('messages.cascadeStep', { current: 1, total: 3, step: stepNames.nlu }));
      updateRowById(rowId, { nluStatus: 'processing', visualStatus: 'idle', bitmapStatus: 'idle' });
      const nluStartTime = Date.now();
      const nluResult = await Gemini.generateNLU(row.UTTERANCE, addLog, config);
      if (stopFlags.current[row.id]) {
        addLog('info', t('messages.cascadeStoppedAtStep', { step: stepNames.nlu }));
        updateRowById(rowId, { nluStatus: 'idle', status: 'idle' });
        return;
      }
      finalUpdates.NLU = nluResult;
      finalUpdates.nluStatus = 'completed';
      finalUpdates.nluDuration = (Date.now() - nluStartTime) / 1000;
      addLog('success', t('messages.cascadeStepComplete', { current: 1, total: 3, duration: finalUpdates.nluDuration.toFixed(1) }));

      // --- Visual Step ---
      addLog('info', t('messages.cascadeStep', { current: 2, total: 3, step: stepNames.visual }));
      updateRowById(rowId, { nluStatus: 'completed', nluDuration: finalUpdates.nluDuration, NLU: nluResult, visualStatus: 'processing' });
      const visualStartTime = Date.now();
      const visualResult = await Gemini.generateVisualBlueprint(nluResult, config, addLog);
      if (stopFlags.current[row.id]) {
        addLog('info', t('messages.cascadeStoppedAtStep', { step: stepNames.visual }));
        updateRowById(rowId, { visualStatus: 'idle' });
        return;
      }
      finalUpdates.elements = visualResult.elements;
      finalUpdates.prompt = visualResult.prompt;
      finalUpdates.visualStatus = 'completed';
      finalUpdates.visualDuration = (Date.now() - visualStartTime) / 1000;
      addLog('success', t('messages.cascadeStepComplete', { current: 2, total: 3, duration: finalUpdates.visualDuration.toFixed(1) }));

      // --- Bitmap Step (NanoBanana) ---
      addLog('info', t('messages.cascadeStep', { current: 3, total: 3, step: stepNames.bitmap }));
      updateRowById(rowId, { visualStatus: 'completed', visualDuration: finalUpdates.visualDuration, elements: visualResult.elements, prompt: visualResult.prompt, bitmapStatus: 'processing' });
      const bitmapStartTime = Date.now();
      const bitmapResult = await Gemini.generateImage(ensureElementsArray(visualResult.elements), visualResult.prompt || "", row, config, addLog);
      if (stopFlags.current[row.id]) {
        addLog('info', t('messages.cascadeStoppedAtStep', { step: stepNames.bitmap }));
        updateRowById(rowId, { bitmapStatus: 'idle' });
        return;
      }
      finalUpdates.bitmap = bitmapResult;
      finalUpdates.bitmapStatus = 'completed';
      finalUpdates.bitmapDuration = (Date.now() - bitmapStartTime) / 1000;
      addLog('success', t('messages.cascadeStepComplete', { current: 3, total: 3, duration: finalUpdates.bitmapDuration.toFixed(1) }));

      finalUpdates.status = 'completed';
      updateRowById(rowId, finalUpdates);

      // Record discards for each downstream phase that had a previous value.
      recordPhaseRegen(rowId, 'nlu', beforeNLU, nluResult);
      recordPhaseRegen(rowId, 'elements', beforeElements, visualResult.elements);
      recordPhaseRegen(rowId, 'prompt', beforePrompt, visualResult.prompt);

      const totalTime = (finalUpdates.nluDuration || 0) + (finalUpdates.visualDuration || 0) + (finalUpdates.bitmapDuration || 0);
      addLog('success', t('messages.cascadeComplete', { duration: totalTime.toFixed(1), utterance: row.UTTERANCE }));

      requestAnimationFrame(() => {
        const rowEl = document.getElementById(`picto-row-${row.id}`);
        const bitmapEl = rowEl?.querySelector('#bitmap-preview');
        if (bitmapEl) bitmapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

    } catch (err: any) {
      let stepFailed: 'nlu' | 'visual' | 'bitmap' = 'nlu';
      if (finalUpdates.nluStatus === 'completed' && finalUpdates.visualStatus !== 'completed') stepFailed = 'visual';
      else if (finalUpdates.visualStatus === 'completed') stepFailed = 'bitmap';

      updateRowById(rowId, { [`${stepFailed}Status`]: 'error', status: 'error' });
      addLog('error', t('messages.cascadeFailed', { step: stepNames[stepFailed], error: err.message }));
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

  const openSVGEditor = (rowId: string, preferSource?: 'raw' | 'structured') => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;

    let svgToEdit: string | undefined;
    let source: 'raw' | 'structured';

    if (preferSource === 'raw' && row.rawSvg) {
      svgToEdit = row.rawSvg;
      source = 'raw';
    } else if (preferSource === 'structured' && row.structuredSvg) {
      svgToEdit = row.structuredSvg;
      source = 'structured';
    } else {
      svgToEdit = row.structuredSvg || row.rawSvg;
      source = row.structuredSvg ? 'structured' : 'raw';
    }

    if (!svgToEdit) {
      addLog('error', t('messages.noSvgToEdit'));
      return;
    }

    setSvgEditorState({
      isOpen: true,
      rowId: rowId,
      svg: svgToEdit,
      svgSource: source,
    });
    addLog('info', t('messages.openingSvgEditor', { utterance: row.UTTERANCE }));
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
    addLog('success', t('messages.svgUpdatedSuccess', { utterance: savedRow?.UTTERANCE }));
    setSvgEditorState({ isOpen: false, rowId: null, svg: null, svgSource: null });
  };

  const handleVectorizerApply = (result: VectorizerResult) => {
    if (!vectorizerState.rowId) return;
    updateRowById(vectorizerState.rowId, { rawSvg: result.svg });
    addLog('success', t('messages.vectorizationComplete', { traced: result.layersTraced, total: result.layersTotal, tier: result.tiersUsed }));
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
            <h1 className="font-bold uppercase tracking-tight text-xl text-slate-900 leading-none">{config.name}</h1>
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
          <div id="lang-btn-group" ref={langBtnRef} className="relative flex items-center bg-white border border-slate-200 shadow-sm rounded-md transition-all hover:border-violet-200 group">
            <button
              onClick={handleLangMenuToggle}
              className="p-2.5 hover:bg-slate-50 text-slate-600 border-r border-slate-100 flex items-center gap-2"
              title="UI Language"
            >
              <Globe size={18} />
              <span className="text-xs font-medium text-slate-500 hidden md:inline">
                {lang === 'es-419' ? 'Español' : 'English'}
              </span>
            </button>
            <button
              onClick={handleLangMenuToggle}
              className={`p-1.5 hover:bg-slate-50 text-slate-500 border-l border-transparent hover:text-violet-950 transition-colors ${showLangMenu ? 'bg-slate-50 text-violet-950' : ''}`}
              aria-label="Cambiar idioma"
            >
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          </div>

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

          <button id="console-btn" onClick={() => setShowConsole(!showConsole)} className="p-2.5 hover:bg-slate-50 text-slate-500 border border-transparent hover:border-slate-200 rounded-md transition-all" title={t('header.consoleTooltip')} aria-label={t('header.consoleTooltip')}><Terminal size={18} aria-hidden="true" /></button>

          {!(import.meta as any).env?.DEV && (
            <>
              <div className="w-px h-8 bg-slate-200 mx-1"></div>
              {authUser ? (
                <button
                  onClick={() => logout()}
                  className="p-2.5 hover:bg-slate-50 text-slate-400 hover:text-rose-500 border border-transparent hover:border-slate-200 rounded-md transition-all"
                  title={`${t('header.logout')} (${authUser.email})`}
                  aria-label={t('header.logout')}
                >
                  <LogOut size={16} aria-hidden="true" />
                </button>
              ) : (
                <button
                  onClick={() => requestLogin()}
                  className="p-2.5 hover:bg-slate-50 text-slate-400 hover:text-emerald-600 border border-transparent hover:border-slate-200 rounded-md transition-all"
                  title={t('header.login')}
                  aria-label={t('header.login')}
                >
                  <LogIn size={16} aria-hidden="true" />
                </button>
              )}
            </>
          )}
        </nav>
      </header>

      {showConfig && (
        <>
        <div className="fixed inset-0 z-[39]" onClick={() => setShowConfig(false)} />
        <div id="globalSettings" className="fixed top-20 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-b shadow-2xl p-6 animate-in slide-in-from-top duration-200">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* ── Col 1: Identidad ── */}
            <div className="flex flex-col gap-4">

              {/* field-author */}
              <div id="field-author">
                <FieldLabel label={t('config.spaceName')} tooltip={t('config.spaceNameTooltip')} />
                <input
                  type="text"
                  value={config.name}
                  onChange={e => setConfig({ ...config, name: e.target.value })}
                  className="w-full text-xs border p-2.5 bg-slate-50 focus:bg-white transition-colors"
                  placeholder="My Pictogram Library"
                />
              </div>

              {/* field-credits */}
              <div id="field-credits">
                <FieldLabel
                  label={t('config.credits')}
                  tooltip={t('config.creditsTooltip')}
                />
                <textarea
                  value={config.credits || ''}
                  onChange={e => setConfig({ ...config, credits: e.target.value })}
                  placeholder={t('config.creditsPlaceholder')}
                  className="w-full text-xs border p-2.5 bg-slate-50 focus:bg-white transition-colors h-16 resize-none"
                />
              </div>

              {/* field-license */}
              <div id="field-license">
                <FieldLabel
                  label={t('config.license')}
                  tooltip={t('config.licenseTooltip')}
                />
                <select
                  value={config.license}
                  onChange={e => setConfig({ ...config, license: e.target.value })}
                  className="w-full text-xs border p-2.5 bg-slate-50 focus:bg-white transition-colors"
                >
                  <option value="copyright">{t('config.licenses.copyright')}</option>
                  <option value="cc0">{t('config.licenses.cc0')}</option>
                  <option value="cc-by">{t('config.licenses.ccBy')}</option>
                  <option value="cc-by-sa">{t('config.licenses.ccBySa')}</option>
                  <option value="cc-by-nc">{t('config.licenses.ccByNc')}</option>
                  <option value="cc-by-nc-sa">{t('config.licenses.ccByNcSa')}</option>
                </select>
              </div>

              {/* field-geo */}
              <div id="field-geo">
                <FieldLabel
                  label={t('config.geoContext')}
                  tooltip={t('config.geoContextTooltip')}
                />
                <div className="flex flex-col gap-2">
                  <div className="border p-2.5 bg-slate-50 focus-within:bg-white focus-within:ring-1 focus-within:ring-violet-200 transition-colors">
                    <div className="flex items-center gap-2">
                      <Globe size={14} className="text-slate-500" />
                      <select
                        value={config.lang}
                        onChange={(e) => {
                          const newLang = e.target.value as Locale;
                          const isDefault = Object.values(DEFAULT_STYLE_PROMPTS).includes(config.visualStylePrompt);
                          setConfig({
                            ...config,
                            lang: newLang,
                            uiLang: newLang,
                            ...(isDefault ? { visualStylePrompt: getDefaultStylePrompt(newLang) } : {}),
                          });
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

            {/* ── Col 2: Estilo visual ── */}
            <div className="flex flex-col gap-4">

              {/* field-visual-style */}
              <div id="field-visual-style" className="flex-1 flex flex-col">
                <FieldLabel
                  label={t('config.visualStylePrompt')}
                  tooltip={t('config.visualStylePromptTooltip')}
                />
                <textarea
                  value={config.visualStylePrompt}
                  onChange={e => setConfig({ ...config, visualStylePrompt: e.target.value })}
                  className="w-full text-xs border p-2.5 bg-slate-50 focus:bg-white transition-colors flex-1 min-h-[10rem] resize-none"
                />
              </div>

              {/* field-style-editor */}
              <div id="field-style-editor">
                <FieldLabel
                  label={t('config.styles')}
                  tooltip={t('config.stylesTooltip')}
                />
                <button
                  onClick={() => setShowStyleEditor(true)}
                  className="w-full text-sm font-bold uppercase text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 p-3.5 rounded transition-colors flex items-center justify-center gap-2"
                >
                  <Palette size={16} aria-hidden="true" /> {t('config.openEditor')}
                </button>
              </div>
            </div>

            {/* ── Col 3: Generación y preferencias ── */}
            <div className="flex flex-col gap-4">

              {/* field-aspect-ratio */}
              <div id="field-aspect-ratio">
                <FieldLabel
                  label={t('config.proportion')}
                  tooltip={t('config.aspectRatioTooltip')}
                />
                <select
                  value={config.aspectRatio}
                  onChange={e => setConfig({ ...config, aspectRatio: e.target.value })}
                  className="w-full text-xs border p-2.5 bg-slate-50 focus:bg-white transition-colors"
                >
                  <option value="1:1">{t('config.aspectRatios.square')}</option>
                  <option value="4:3">{t('config.aspectRatios.standard')}</option>
                  <option value="3:4">{t('config.aspectRatios.portrait')}</option>
                  <option value="16:9">{t('config.aspectRatios.widescreen')}</option>
                  <option value="9:16">{t('config.aspectRatios.mobile')}</option>
                </select>
              </div>


              {/* field-reduce-motion */}
              <div id="field-reduce-motion">
                <FieldLabel
                  label={t('config.animations')}
                  tooltip={t('config.animationsTooltip')}
                />
                <label className="flex items-center gap-3 cursor-pointer p-2.5 border bg-slate-50 hover:bg-white transition-colors">
                  <input
                    type="checkbox"
                    checked={!reduceMotion}
                    onChange={e => setReduceMotion(!e.target.checked)}
                    className="w-4 h-4 accent-violet-600"
                  />
                  <span className="text-xs font-medium text-slate-700">
                    {reduceMotion ? t('config.animationsDisabled') : t('config.animationsEnabled')}
                  </span>
                </label>
              </div>

              {/* field-high-contrast */}
              <div id="field-high-contrast">
                <FieldLabel
                  label={t('config.highContrast')}
                  tooltip={t('config.highContrastTooltip')}
                />
                <label className="flex items-center gap-3 cursor-pointer p-2.5 border bg-slate-50 hover:bg-white transition-colors">
                  <input
                    type="checkbox"
                    checked={highContrast}
                    onChange={e => setHighContrast(e.target.checked)}
                    className="w-4 h-4 accent-violet-600"
                  />
                  <span className="text-xs font-medium text-slate-700">
                    {highContrast ? t('config.highContrastEnabled') : t('config.highContrastDisabled')}
                  </span>
                </label>
              </div>

              {/* field-recording */}
              <div id="field-recording">
                <FieldLabel
                  label={t('config.recordingModifications')}
                  tooltip={t('config.recordingModificationsTooltip')}
                />
                <label className="flex items-center gap-3 cursor-pointer p-2.5 border bg-slate-50 hover:bg-white transition-colors">
                  <input
                    type="checkbox"
                    checked={config.recording?.enabled !== false}
                    onChange={e => setConfig(prev => ({ ...prev, recording: { enabled: e.target.checked } }))}
                    className="w-4 h-4 accent-violet-600"
                  />
                  <span className="text-xs font-medium text-slate-700">
                    {(config.recording?.enabled !== false) ? t('config.recordingEnabled') : t('config.recordingDisabled')}
                  </span>
                </label>
              </div>

              {/* field-tutorial */}
              <div id="field-tutorial" className="mt-auto pt-2">
                <button
                  onClick={() => { setShowOnboarding(true); setShowConfig(false); }}
                  className="w-full text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200 p-2.5 rounded transition-colors flex items-center justify-center gap-2"
                  title={t('config.tutorialTooltip')}
                >
                  <HelpCircle size={14} aria-hidden="true" /> {t('config.tutorial')}
                </button>
              </div>
            </div>

          </div>
        </div>
        </>
      )}

      <main id="mainContent" className="flex-1 p-8 max-w-7xl mx-auto w-full">
        {viewMode === 'list' && rows.length > 0 && (
          <div id="sort-controls" className="mb-6 flex justify-between items-center gap-2">
            {/* View mode switcher (left) — see specs/library-views.allium */}
            <div id="view-switcher" className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase text-slate-500 tracking-wider mr-2">{t('library.viewMode')}</span>
              <div className="inline-flex border border-slate-200 bg-white">
                <button
                  onClick={() => setConfig(prev => ({ ...prev, libraryViewMode: 'list' }))}
                  className={`p-2 transition-all ${(config.libraryViewMode ?? 'list') === 'list' ? 'bg-violet-950 text-white' : 'text-slate-500 hover:text-violet-700 hover:bg-slate-50'}`}
                  title={t('library.viewList')}
                  aria-label={t('library.viewList')}
                  aria-pressed={(config.libraryViewMode ?? 'list') === 'list'}
                >
                  <List size={14} aria-hidden="true" />
                </button>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, libraryViewMode: 'grid' }))}
                  className={`p-2 transition-all border-l border-slate-200 ${config.libraryViewMode === 'grid' ? 'bg-violet-950 text-white' : 'text-slate-500 hover:text-violet-700 hover:bg-slate-50'}`}
                  title={t('library.viewGrid')}
                  aria-label={t('library.viewGrid')}
                  aria-pressed={config.libraryViewMode === 'grid'}
                >
                  <LayoutGrid size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
            {/* Sort controls (right) */}
            <div className="flex gap-2 items-center">
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
          </div>
        )}
        {viewMode === 'home' ? (
          <div id="home-view" className="py-20 text-center space-y-16 animate-in fade-in zoom-in-95 duration-700">
            <div id="hero-area" className="space-y-4">
              <div className="inline-flex gap-4 bg-orange-500 text-white px-6 py-2 text-xs font-medium uppercase tracking-[0.3em] shadow-lg rounded-xl">
                <ScreenShare size={14} /> {t('header.betterOnLargeScreens')}
              </div>
              <p className="text-8xl font-black tracking-tighter text-slate-900 leading-none" aria-hidden="true">{config.name}</p>
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
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900">{t('home.exampleLibraries')}</h2>
                  <p className="text-sm text-slate-500">{t('home.exampleLibrariesDescription')}</p>
                </div>

                <div id="example-libraries" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {availableLibraries.map((library: LibraryMetadata) => {
                    const slug = library.filename.replace(/(_graph.*)?\.json$/, '');
                    return (
                      <div
                        key={library.filename}
                        onClick={() => loadLibrary(library.filename)}
                        className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-violet-400 hover:shadow-lg transition-all cursor-pointer group"
                      >
                        {/* Thumbnail strip */}
                        <div className="flex h-24 bg-slate-100">
                          {[0, 1, 2].map(i => (
                            <picture key={i} className="w-1/3 h-full">
                              <source srcSet={`/libraries/thumbs-opt/${slug}_${i}.webp`} type="image/webp" />
                              <img
                                src={`/libraries/thumbs/${slug}_${i}.jpg`}
                                alt=""
                                width={240}
                                height={240}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </picture>
                          ))}
                        </div>

                        {/* Info */}
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-bold text-sm text-slate-900 leading-tight">{library.name}</h4>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                              {library.language}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400">
                            <Globe size={10} />
                            <span className="truncate">{library.location}</span>
                          </div>
                          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
                            <span className="text-xs text-violet-600 font-semibold">
                              {library.items} {t('home.items')}
                            </span>
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium group-hover:text-violet-600 transition-colors">
                              {t('home.loadLibrary')}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 animate-in fade-in duration-700">
            <div className="animate-bounce">
              <ArrowUp size={32} className="text-violet-400" />
            </div>
            <h2 className="mt-8 text-3xl font-bold text-slate-300 tracking-tight">{t('home.emptyLibrary')}</h2>
            <p className="mt-4 text-sm text-slate-500 font-medium">{t('home.emptyLibraryHint')}</p>
            <p className="mt-6 text-xs text-slate-400">
              <button
                onClick={() => appendPhrasesInputRef.current?.click()}
                className="underline hover:text-violet-600 transition-colors cursor-pointer"
              >
                {t('home.emptyLibraryImport')}
              </button>
              <span className="relative inline-block ml-1 group">
                <HelpCircle size={12} className="inline text-slate-400 cursor-help" />
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs bg-slate-800 text-white rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {t('home.emptyLibraryImportTooltip')}
                </span>
              </span>
            </p>
          </div>
        ) : config.libraryViewMode === 'grid' ? (
          /* Pictogram grid view — see specs/library-views.allium */
          <div id="grid-view" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-64 animate-in fade-in slide-in-from-bottom-8 duration-500">
            {filteredRows.map((row) => (
              <PictogramGridCell
                key={row.id}
                row={row}
                onUpdate={u => updateRowById(row.id, u)}
                onCascade={() => processCascade(row.id)}
                onStop={() => {
                  stopFlags.current[row.id] = true;
                  addLog('info', t('messages.stopRequested', { utterance: row.UTTERANCE }));
                }}
                onFocus={step => setFocusMode({ step, rowId: row.id })}
                onOpenEditor={source => openSVGEditor(row.id, source)}
                onOpenVectorizer={() => setVectorizerState({ isOpen: true, rowId: row.id })}
                onSettleField={() => settleRowEdits(row.id)}
              />
            ))}
          </div>
        ) : (
          <div id="list-view" className="space-y-4 pb-64 animate-in fade-in slide-in-from-bottom-8 duration-500">
            {filteredRows.map((row) => {
              return (
                <RowComponent
                  key={row.id} row={row} isOpen={openRowId === row.id} setIsOpen={v => { handleOpenRowChange(v ? row.id : null); if (v) setShowConfig(false); }}
                  onUpdate={u => updateRowById(row.id, u)} onProcess={s => processStep(row.id, s)}
                  onRegeneratePrompt={() => regeneratePrompt(row.id)}
                  onStop={() => {
                    stopFlags.current[row.id] = true;
                    addLog('info', t('messages.stopRequested', { utterance: row.UTTERANCE }));
                  }}
                  onCascade={() => processCascade(row.id)}
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
                    // Clean up recording state if this row was open
                    delete phaseSnapshotsRef.current[row.id];
                    if (openRowId === row.id) setOpenRowId(null);
                    // If the deleted row was in focus mode, clear focus mode
                    if (focusMode?.rowId === row.id) {
                      setFocusMode(null);
                    }
                  }}
                  onFocus={step => setFocusMode({ step, rowId: row.id })}
                  onLog={addLog}
                  config={config}
                  onConfigChange={partial => setConfig(prev => ({ ...prev, ...partial }))}
                  onOpenEditor={(source) => openSVGEditor(row.id, source)}
                  onOpenVectorizer={() => setVectorizerState({ isOpen: true, rowId: row.id })}
                  onSettleField={() => settleRowEdits(row.id)}
                  onRecordElementOp={(op, before, after) => recordElementOp(row.id, op, before, after)}
                  onUpdateInterventionLog={(log) => updateRowInterventionLog(row.id, log)}
                />
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-slate-50 px-8 py-10 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h4 className="text-slate-900 font-semibold text-sm mb-2">{t('footer.research')}</h4>
            <p className="leading-relaxed">{t('footer.researchDesc')}</p>
          </div>
          <div>
            <h4 className="text-slate-900 font-semibold text-sm mb-2">{t('footer.collaborate')}</h4>
            <p className="leading-relaxed mb-3">{t('footer.collaborateDesc')}</p>
            <a
              href={lang === 'es-419' ? 'https://forms.gle/DaFLWAjfj7sGCD3s7' : 'https://forms.gle/CCZHejJ71F3REE2P6'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-violet-600 hover:text-violet-700 font-medium transition-colors"
            >
              <ExternalLink size={12} /> {t('footer.collaborate')}
            </a>
          </div>
          <div>
            <h4 className="text-slate-900 font-semibold text-sm mb-2">
              <a href="https://herbertspencer.net" target="_blank" rel="noopener noreferrer" className="hover:text-violet-600 transition-colors">
                {t('footer.author')}
              </a>
            </h4>
            <p className="leading-relaxed">{t('footer.affiliation1')}<br />{t('footer.affiliation2')}</p>
            <div className="flex items-center gap-4 mt-3">
              <a
                href="https://github.com/hspencer/pictos-net"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-violet-600 hover:text-violet-700 font-medium transition-colors"
              >
                <Code size={12} /> {t('footer.openSource')}
              </a>
              <span className="text-slate-300">|</span>
              <span>{t('footer.license')}</span>
            </div>
            <p className="mt-3 text-slate-400">v{APP_VERSION}</p>
          </div>
        </div>
      </footer>

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
          onRegeneratePrompt={() => regeneratePrompt(focusMode.rowId)}
          config={config}
          onConfigChange={partial => setConfig(prev => ({ ...prev, ...partial }))}
          onLog={addLog}
          onOpenEditor={(source) => openSVGEditor(focusMode!.rowId, source)}
          onOpenVectorizer={() => setVectorizerState({ isOpen: true, rowId: focusMode!.rowId })}
          onModeChange={(step) => setFocusMode({ step, rowId: focusMode.rowId })}
          onRecordElementOp={(op, before, after) => recordElementOp(focusMode!.rowId, op, before, after)}
          onSettleField={() => settleRowEdits(focusMode!.rowId)}
          onProcess={(step) => processStep(focusMode!.rowId, step)}
          onStop={() => {
            stopFlags.current[focusMode!.rowId] = true;
            addLog('info', t('messages.stopRequested', { utterance: focusedRowData.UTTERANCE }));
          }}
        />
      )}

      {/* Onboarding Modal */}
      {showOnboarding && (
        <OnboardingModal
          t={t}
          lang={lang as 'es-419' | 'en-GB'}
          onClose={() => {
            setShowOnboarding(false);
            localStorage.setItem('pictonet_onboarding_done', '1');
          }}
          onSelectPreset={(stylePrompt) => {
            setConfig(prev => ({ ...prev, visualStylePrompt: stylePrompt }));
          }}
          onImportPhrases={() => appendPhrasesInputRef.current?.click()}
          onGoHome={() => setViewMode('home')}
          onFocusSearch={() => {
            setViewMode('list');
            setIsSearching(true);
          }}
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
          config={config}
          onUpdateConfig={setConfig}
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

      {/* Language Dropdown Portal */}
      {showLangMenu && ReactDOM.createPortal(
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setShowLangMenu(false)} />
          <div
            id="lang-dropdown"
            className="fixed w-36 bg-white border border-slate-200 shadow-xl z-[56] rounded-sm animate-in fade-in slide-in-from-top-2"
            style={{ top: langMenuPos.top, left: langMenuPos.left }}
          >
            {([['es-419', 'Español'], ['en-GB', 'English']] as [Locale, string][]).map(([code, label]) => (
              <button
                key={code}
                onClick={() => handleLangSelect(code)}
                className={`w-full text-left px-4 py-3 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors ${lang === code ? 'font-bold text-violet-950 bg-violet-50' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </>,
        document.body
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
            <button
              onClick={() => { setShowConfig(!showConfig); setShowLibraryMenu(false); }}
              className={`w-full text-left px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors border-b border-slate-100 ${showConfig ? 'text-violet-950 bg-slate-50' : ''}`}
            >
              <Settings size={14} className="text-slate-500" /> {t('header.configureLibrary')}
            </button>
            <div className="px-4 py-2 border-b border-slate-100 text-xs font-bold text-slate-500 tracking-wider tabular-nums">
              {rows.length} {rows.length === 1 ? t('actions.element') : t('actions.elements')}
            </div>
            <button
              onClick={() => { appendPhrasesInputRef.current?.click(); setShowLibraryMenu(false); }}
              className="w-full text-left px-4 py-3 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
            >
              <Upload size={14} className="text-violet-950" /> {t('actions.importPhrases')}
            </button>
            <button
              onClick={() => { importInputRef.current?.click(); setShowLibraryMenu(false); }}
              className="w-full text-left px-4 py-3 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
            >
              <Upload size={14} className="text-emerald-600" /> {t('actions.importLibrary')}
            </button>
            <div className="border-t border-slate-100 my-1"></div>
            <button
              onClick={() => { exportProject(); setShowLibraryMenu(false); }}
              disabled={rows.length === 0}
              className="w-full text-left px-4 py-3 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={14} className="text-slate-500" /> {t('actions.exportLibrary')}
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
                const safeName = sanitizeFilename(config.name) || 'pictonet';
                a.download = `${safeName}_pngs_${new Date().toISOString().split('T')[0]}.zip`;
                a.click();
                URL.revokeObjectURL(url);
                setShowLibraryMenu(false);
                addLog('success', t('messages.pngsExported', { count: rowsWithBitmaps.length }));
              }}
              disabled={pngCount === 0}
              className="w-full text-left px-4 py-3 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ImageIcon size={14} className="text-orange-500" /> {t('actions.downloadPngs', { count: pngCount })}
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
                const safeName = sanitizeFilename(config.name) || 'pictonet';
                a.download = `${safeName}_svgs_${new Date().toISOString().split('T')[0]}.zip`;
                a.click();
                URL.revokeObjectURL(url);
                setShowLibraryMenu(false);
                addLog('success', t('messages.svgsExported', { count: svgs.length }));
              }}
              disabled={svgCount === 0}
              className="w-full text-left px-4 py-3 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileDown size={14} className="text-blue-600" /> {t('actions.exportSvgs', { count: svgCount })}
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
  onFocus: (step: 'nlu' | 'visual' | 'bitmap' | 'format') => void;
  onLog: (type: 'info' | 'error' | 'success', message: string) => void;
  config: GlobalConfig;
  onConfigChange: (partial: Partial<GlobalConfig>) => void;
  onOpenEditor: (source?: 'raw' | 'structured') => void;
  onOpenVectorizer: () => void;
  onSettleField?: () => void;
  onRecordElementOp?: (op: ElementOpKind, before: unknown, after: unknown) => void;
  onUpdateInterventionLog?: (log: RowInterventionLog | null) => void;
}> = ({ row, isOpen, setIsOpen, onUpdate, onProcess, onRegeneratePrompt, onStop, onCascade, onDelete, onFocus, onLog, config, onConfigChange, onOpenEditor, onOpenVectorizer, onSettleField, onRecordElementOp, onUpdateInterventionLog }) => {
  const { t } = useTranslation();
  const [elementsManuallyEdited, setElementsManuallyEdited] = React.useState(false);
  const [promptManuallyEdited, setPromptManuallyEdited] = React.useState(false);
  const [isPromptEditing, setIsPromptEditing] = React.useState(false);
  const [isRegeneratingPrompt, setIsRegeneratingPrompt] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [showAuditPanel, setShowAuditPanel] = React.useState(false);

  return (
    <div id={`picto-row-${row.id}`} className={`border transition-all duration-300 scroll-mt-24 ${isOpen ? 'ring-8 ring-slate-100 border-violet-950 bg-white' : 'hover:border-slate-300 bg-white shadow-sm'}`}>
      <div id={`row-header-${row.id}`} className="flex items-stretch pr-0 group min-h-[5rem]">
        <div className="pl-6 py-6 pr-6 flex-1 flex items-center gap-6">
          <textarea
            value={row.UTTERANCE}
            onChange={e => onUpdate({ UTTERANCE: e.target.value, nluStatus: 'outdated', visualStatus: 'outdated', bitmapStatus: 'outdated' })}
            onBlur={() => onSettleField?.()}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLTextAreaElement).blur(); } }}
            rows={1}
            ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
            onInput={e => { const el = e.target as HTMLTextAreaElement; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }}
            className="flex-1 w-full bg-transparent border-none outline-none focus:ring-0 utterance-title text-slate-900 uppercase font-light resize-none overflow-hidden hover:bg-amber-50 hover:cursor-text focus:bg-amber-50 transition-colors rounded self-center line-clamp-2"
            style={{ lineHeight: '1.5rem' }}
          />
          <div id={`cascade-ctrl-${row.id}`} className="flex gap-2 transition-all">
            {row.status === 'processing' ? (
              <button onClick={e => { e.stopPropagation(); onStop(); }} className="p-2 bg-orange-600 text-white hover:bg-orange-700 transition-all rounded-full shadow-sm animate-pulse" title={t('actions.stopProcess')} aria-label={t('actions.stopProcess')}>
                <Square size={18} aria-hidden="true" />
              </button>
            ) : (
              <button onClick={e => { e.stopPropagation(); onCascade(); }} className="p-2 border-2 border-orange-400 hover:border-orange-600 text-orange-500 hover:text-orange-700 transition-all rounded-full bg-white shadow-sm" title={t('actions.runFullPipeline')} aria-label={t('actions.runFullPipeline')}>
                <Play size={18} aria-hidden="true" />
              </button>
            )}
          </div>
          <div id={`pipeline-badges-${row.id}`} className="flex gap-1.5 cursor-pointer" aria-label="Estado del pipeline" onClick={() => setIsOpen(!isOpen)}>
            <Badge step={1} label={t('pipeline.understand')} status={row.nluStatus} />
            <Badge step={2} label={t('pipeline.compose')} status={row.visualStatus} />
            <Badge step={3} label={t('pipeline.produce')} status={row.bitmapStatus} />
          </div>
        </div>
        <div
          id={`picto-thumbnail-${row.id}`}
          className="w-24 bg-slate-50 flex items-center justify-center group-hover:scale-110 group-hover:rounded group-hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)] transition-all cursor-pointer overflow-hidden"
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
        <ChevronDown onClick={() => setIsOpen(!isOpen)} size={20} className="text-slate-500 transition-transform duration-500 cursor-pointer self-center mx-6" />
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
                onSettleField={onSettleField}
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
                      onUpdate({ elements: val, bitmapStatus: 'outdated' });
                      setElementsManuallyEdited(true);
                    }} onRecordOp={(op, before, after) => onRecordElementOp?.(op, before, after)} />
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
                  <div id="spatial-prompt" className={`flex-1 mt-6 border-t pt-6 border-slate-200 flex flex-col gap-3 transition-colors ${elementsManuallyEdited ? 'bg-amber-50 rounded-lg px-3' : ''}`}>
                    <label className="text-xs font-medium uppercase text-slate-500 block tracking-widest">{t('editor.spatialLogic')}</label>
                    {isPromptEditing ? (
                      <textarea
                        value={row.prompt || ""}
                        onChange={e => {
                          onUpdate({ prompt: e.target.value, bitmapStatus: 'outdated' });
                          setPromptManuallyEdited(true);
                        }}
                        onBlur={() => { setIsPromptEditing(false); onSettleField?.(); }}
                        autoFocus
                        ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                        onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
                        className="w-full min-h-[100px] text-sm text-slate-600 leading-relaxed p-3 bg-slate-50 rounded border border-slate-200 outline-none focus:ring-2 focus:ring-violet-300 resize-none overflow-hidden"
                      />
                    ) : (
                      <div
                        onClick={() => setIsPromptEditing(true)}
                        className="w-full min-h-[100px] cursor-text text-sm text-slate-600 leading-relaxed p-3 bg-slate-50 rounded border border-slate-200"
                      >
                        {row.prompt && row.elements && row.elements.length > 0 ? (
                          <PromptRenderer prompt={row.prompt} elements={row.elements} bare />
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
            <StepBox id="block-produce" label={t('pipeline.produce')} status={row.bitmapStatus} onRegen={() => onProcess('bitmap')} onStop={onStop} onFocus={() => onFocus('bitmap')} duration={row.bitmapDuration}
            >
              <div className="flex flex-col h-full gap-4">
                <div className="flex items-center gap-2 px-1">
                  <select
                    value={config.imageModel || 'flash'}
                    onChange={e => onConfigChange({ ...config, imageModel: e.target.value })}
                    className="text-xs border border-slate-200 rounded px-2 py-1 bg-slate-50 hover:bg-white focus:bg-white transition-colors"
                    title={t('config.imageModelTooltip')}
                  >
                    <option value="flash">{t('config.imageModels.flash')}</option>
                    <option value="pro">{t('config.imageModels.pro')}</option>
                  </select>
                </div>
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
                        title={t('actions.downloadPng')}
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

          {/* Row Actions: Copy, Audit, Delete */}
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
                setShowAuditPanel(true);
              }}
              className="p-2 border border-slate-200 hover:border-violet-950 text-slate-500 hover:text-violet-950 transition-all bg-white shadow-sm"
              title={t('audit.openTooltip')}
              aria-label={t('audit.openLabel')}
            >
              <History size={14} />
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

          <RowAuditPanel
            isOpen={showAuditPanel}
            log={row.interventionLog}
            utterance={row.UTTERANCE}
            onClose={() => setShowAuditPanel(false)}
            onReplace={(log) => onUpdateInterventionLog?.(log)}
            onClear={() => onUpdateInterventionLog?.(null)}
            onLog={onLog}
          />
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
  expanded?: boolean;
  onSettleField?: () => void;
}> = ({ data, onUpdate, config, onConfigChange, expanded = false, onSettleField }) => {
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

  const formatKey = (key: string) => key.replace(/_/g, ' ');

  const renderEditableDict = (dict: Record<string, string> | undefined, path: string, narrow?: boolean) => {
    return (
      <div className="space-y-2 text-xs bg-slate-50 p-2 border">
        {Object.entries(dict || {}).map(([key, value]) => (
          <div key={key} className="flex gap-2 items-start">
            <span className={`font-mono text-slate-500 pt-1 shrink-0 break-words ${narrow ? 'w-16' : 'w-28'}`}>{formatKey(key)}</span>
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
              className="flex-1 min-w-0 bg-white border-b outline-none focus:border-violet-400 resize-none overflow-hidden"
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
    <div className="space-y-4" onBlur={() => onSettleField?.()}>
      {/* Top row: multi-column only in expanded (focus modal) view */}
      <div className={`grid gap-4 items-start ${expanded ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
        {/* CONTEXTO */}
        <div id="nlu-context" className="border bg-white p-3 shadow-sm text-xs space-y-2">
          <span className="nlu-key uppercase">{t('editor.context')}</span>
          <div className="mt-2 space-y-2 pt-2 border-t">
            <div className="flex gap-2 items-center">
              <label className="font-mono text-slate-500 shrink-0 w-16">{t('editor.language')}</label>
              <select
                value={config.lang}
                onChange={e => {
                  const newLang = e.target.value;
                  const isDefault = Object.values(DEFAULT_STYLE_PROMPTS).includes(config.visualStylePrompt);
                  onConfigChange({
                    lang: newLang,
                    uiLang: newLang as 'es-419' | 'en-GB',
                    ...(isDefault ? { visualStylePrompt: getDefaultStylePrompt(newLang) } : {}),
                  });
                  setLang(newLang as Locale);
                }}
                className="flex-1 min-w-0 bg-white border-b outline-none focus:border-violet-400 text-xs p-1"
              >
                <option value="es-419">Español</option>
                <option value="en-GB">English</option>
              </select>
            </div>
            <div className="flex gap-2 items-center">
              <label className="font-mono text-slate-500 shrink-0 w-16">{t('editor.domain')}</label>
              <select
                value={nlu.domain || ''}
                onChange={e => {
                  updateField(['domain'], e.target.value);
                  onUpdate({ ...nlu, domain: e.target.value });
                }}
                className="flex-1 min-w-0 bg-white border-b outline-none focus:border-violet-400 text-xs p-1"
              >
                <option value="" disabled>{t('placeholders.selectOption')}</option>
                {VOCAB.domain.map(d => <option key={d} value={d}>{getDomainLabel(d)}</option>)}
              </select>
            </div>
            <div className="flex gap-2 items-center">
              <label className="font-mono text-slate-500 shrink-0 w-16">{t('editor.region')}</label>
              <div className="flex-1 flex items-center gap-1 text-xs">
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
        <div className="border bg-white p-3 shadow-sm text-xs space-y-2">
          <span className="nlu-key uppercase">{t('editor.metadataClassification')}</span>
          <div className="mt-2 space-y-2 pt-2 border-t">
            <div className="flex gap-2 items-center">
              <label className="font-mono text-slate-500 shrink-0 w-20 break-words">{formatKey('speech_act')}</label>
              <select
                value={nlu.metadata?.speech_act || ''}
                onChange={e => updateField(['metadata', 'speech_act'], e.target.value)}
                className="flex-1 min-w-0 bg-white border-b outline-none focus:border-violet-400 text-xs p-1"
              >
                <option value="" disabled>Select...</option>
                {VOCAB.speech_act.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div className="flex gap-2 items-center">
              <label className="font-mono text-slate-500 shrink-0 w-20 break-words">{formatKey('intent')}</label>
              <select
                value={nlu.metadata?.intent || ''}
                onChange={e => updateField(['metadata', 'intent'], e.target.value)}
                className="flex-1 min-w-0 bg-white border-b outline-none focus:border-violet-400 text-xs p-1"
              >
                <option value="" disabled>Select...</option>
                {VOCAB.intent.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* FRAMES */}
        {nlu.frames?.map((frame, fIdx) => (
          <div key={fIdx} className="border bg-white p-3 shadow-sm text-xs space-y-2">
            <div className="nlu-key uppercase">
              {frame.frame_label || frame.frame_name}
              {' '}<span className="font-mono lowercase text-violet-500" title={frame.frame_name}>({frame.lexical_unit})</span>
            </div>
            <div className="mt-2 space-y-2 pt-2 border-t">
              {frame.frame_label && frame.frame_name !== frame.frame_label && (
                <div className="text-xs text-slate-500 font-mono mb-1">FrameNet: {frame.frame_name}</div>
              )}
              {Object.entries(frame.roles || {}).map(([role, rawData]) => {
                const data = rawData as NLUFrameRole;
                return (
                  <div key={role} className="flex gap-2">
                    <span className="font-medium w-24 text-slate-500 shrink-0 break-words">{formatKey(role)}:</span>
                    <span className="text-slate-900">{data.surface} <span className="text-xs text-violet-400">[{data.type}]</span></span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Second row: Logical Form + Pragmatics */}
      <div className={`grid gap-4 ${expanded ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
        <div className="border bg-white p-3 shadow-sm text-xs space-y-2">
          <span className="nlu-key uppercase">{t('editor.logicalForm')}</span>
          <div className="mt-2 pt-2 border-t">
            {renderEditableDict(nlu.logical_form as unknown as Record<string, string>, 'logical_form')}
          </div>
        </div>
        <div className="border bg-white p-3 shadow-sm text-xs space-y-2">
          <span className="nlu-key uppercase">{t('editor.pragmatics')}</span>
          <div className="mt-2 pt-2 border-t">
            {renderEditableDict(nlu.pragmatics as unknown as Record<string, string>, 'pragmatics')}
          </div>
        </div>
      </div>

      {/* Bottom: Full-width NSM Explications */}
      <div className="border bg-white p-3 shadow-sm text-xs space-y-2">
        <span className="nlu-key uppercase">{t('editor.nsmExplications')}</span>
        <div className="mt-2 pt-2 border-t">
          {renderEditableDict(nlu.nsm_explications, 'nsm_explications', true)}
        </div>
      </div>
    </div>
  );
};

const PromptRenderer: React.FC<{ prompt: string; elements: VisualElement[]; bare?: boolean }> = ({ prompt, elements, bare = false }) => {
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

  if (bare) {
    return <>{renderPromptWithPills()}</>;
  }
  return (
    <div className="prompt-text text-sm text-slate-600 leading-relaxed p-3 bg-slate-50 rounded border border-slate-200">
      {renderPromptWithPills()}
    </div>
  );
};

const ElementsEditor: React.FC<{
  elements: VisualElement[];
  onUpdate: (v: VisualElement[]) => void;
  onRecordOp?: (op: ElementOpKind, before: VisualElement[], after: VisualElement[]) => void;
}> = ({ elements, onUpdate, onRecordOp }) => {
  const { t } = useTranslation();
  const safeElements = Array.isArray(elements) ? elements : [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; zone: 'before' | 'inside' | 'after' } | null>(null);

  // --- Tree utilities ---

  const findElement = (id: string, items: VisualElement[]): VisualElement | null => {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children) {
        const found = findElement(id, item.children);
        if (found) return found;
      }
    }
    return null;
  };

  const getSubtreeDepth = (el: VisualElement): number => {
    if (!el.children || el.children.length === 0) return 1;
    return 1 + Math.max(...el.children.map(getSubtreeDepth));
  };

  const getNodeDepth = (id: string, items: VisualElement[], depth = 1): number => {
    for (const item of items) {
      if (item.id === id) return depth;
      if (item.children) {
        const found = getNodeDepth(id, item.children, depth + 1);
        if (found > 0) return found;
      }
    }
    return 0;
  };

  const isDescendantOf = (ancestorId: string, nodeId: string, items: VisualElement[]): boolean => {
    const ancestor = findElement(ancestorId, items);
    if (!ancestor || !ancestor.children) return false;
    for (const child of ancestor.children) {
      if (child.id === nodeId) return true;
      if (isDescendantOf(child.id, nodeId, items)) return true;
    }
    return false;
  };

  const removeFromTree = (items: VisualElement[], id: string): VisualElement[] => {
    return items
      .filter(item => item.id !== id)
      .map(item => item.children ? { ...item, children: removeFromTree(item.children, id) } : item);
  };

  const insertInTree = (items: VisualElement[], targetId: string, node: VisualElement, zone: 'before' | 'inside' | 'after'): VisualElement[] => {
    if (zone === 'inside') {
      return items.map(item => {
        if (item.id === targetId) {
          return { ...item, children: [...(item.children || []), node] };
        }
        return item.children ? { ...item, children: insertInTree(item.children, targetId, node, zone) } : item;
      });
    }
    // before / after: insert as sibling
    const result: VisualElement[] = [];
    for (const item of items) {
      if (item.id === targetId && zone === 'before') result.push(node);
      result.push(item.children ? { ...item, children: insertInTree(item.children, targetId, node, zone) } : item);
      if (item.id === targetId && zone === 'after') result.push(node);
    }
    return result;
  };

  const insertInTreeFirst = (items: VisualElement[], targetId: string, node: VisualElement): VisualElement[] => {
    return items.map(item => {
      if (item.id === targetId) {
        return { ...item, children: [node, ...(item.children || [])] };
      }
      return item.children ? { ...item, children: insertInTreeFirst(item.children, targetId, node) } : item;
    });
  };

  // --- CRUD operations ---

  const commitTree = (op: ElementOpKind, after: VisualElement[]) => {
    onRecordOp?.(op, safeElements, after);
    onUpdate(after);
  };

  const addElement = (parentId: string | null = null) => {
    const newId = `elemento`;
    const newElement: VisualElement = { id: newId };

    if (parentId === null) {
      commitTree('add', [...safeElements, newElement]);
    } else {
      // Check depth before adding
      const parentDepth = getNodeDepth(parentId, safeElements);
      if (parentDepth >= 5) return;
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
      commitTree('add', update(safeElements));
    }
    setTimeout(() => {
      setEditingId(newId);
      setEditingValue(newId);
    }, 50);
  };

  const removeElement = (idToRemove: string) => {
    if (idToRemove === safeElements[0]?.id && getNodeDepth(idToRemove, safeElements) === 1) return; // protect root
    commitTree('remove', removeFromTree(safeElements, idToRemove));
  };

  const updateElementId = (oldId: string, newId: string) => {
    if (!newId.trim() || newId === oldId) {
      setEditingId(null);
      return;
    }
    const update = (items: VisualElement[]): VisualElement[] => {
      return items.map(item => {
        if (item.id === oldId) return { ...item, id: newId.trim() };
        return item.children ? { ...item, children: update(item.children) } : item;
      });
    };
    commitTree('rename', update(safeElements));
    setEditingId(null);
  };

  // --- Drag handlers ---

  const handleDragStart = (e: React.DragEvent, element: VisualElement) => {
    e.stopPropagation();
    setDraggedId(element.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', element.id);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDropTarget(null);
  };

  const handleDragOver = (e: React.DragEvent, element: VisualElement, level: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedId || draggedId === element.id) return;
    if (isDescendantOf(draggedId, element.id, safeElements)) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const isRoot = level === 0;

    let zone: 'before' | 'inside' | 'after';
    if (isRoot) {
      // Root only accepts 'inside'; upper half = first, lower half = last (handled at drop)
      zone = 'inside';
    } else {
      const third = rect.height / 3;
      if (y < third) zone = 'before';
      else if (y < third * 2) zone = 'inside';
      else zone = 'after';
    }

    // Depth validation for 'inside'
    if (zone === 'inside') {
      const draggedEl = findElement(draggedId, safeElements);
      const targetDepth = getNodeDepth(element.id, safeElements);
      if (draggedEl && targetDepth + getSubtreeDepth(draggedEl) > 5) return;
    }

    e.dataTransfer.dropEffect = 'move';
    setDropTarget({ id: element.id, zone });
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    // Only clear if leaving the element entirely (not entering a child)
    const related = e.relatedTarget as HTMLElement | null;
    if (!e.currentTarget.contains(related)) {
      setDropTarget(null);
    }
  };

  const handleDrop = (e: React.DragEvent, element: VisualElement, level: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedId || draggedId === element.id) return;

    const draggedEl = findElement(draggedId, safeElements);
    if (!draggedEl) return;

    let zone = dropTarget?.zone || 'inside';
    const isRoot = level === 0;

    // For root: determine first/last child from cursor position
    if (isRoot && zone === 'inside') {
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const removed = removeFromTree(safeElements, draggedId);
      const result = y < rect.height / 2
        ? insertInTreeFirst(removed, element.id, draggedEl)
        : insertInTree(removed, element.id, draggedEl, 'inside');
      commitTree('reorder', result);
    } else {
      const removed = removeFromTree(safeElements, draggedId);
      commitTree('reorder', insertInTree(removed, element.id, draggedEl, zone));
    }

    setDraggedId(null);
    setDropTarget(null);
  };

  // --- Render ---

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
    const isDragSource = draggedId === element.id;
    const isDropTarget = dropTarget?.id === element.id;
    const dropZoneClass = isDropTarget ? `drop-${dropTarget!.zone}` : '';
    const canDrag = !isRoot;
    const children = element.children || [];
    const hasChildren = children.length > 0;

    return (
      <div
        key={element.id}
        className={`element-node ${isRoot ? 'element-root' : ''} ${isDragSource ? 'dragging' : ''} ${dropZoneClass}`}
        onDragOver={e => handleDragOver(e, element, level)}
        onDragLeave={handleDragLeave}
        onDrop={e => handleDrop(e, element, level)}
      >
        {/* Node row */}
        <div className="element-node-row">
          {canDrag && (
            <span
              className="drag-handle"
              draggable
              onDragStart={e => handleDragStart(e, element)}
              onDragEnd={handleDragEnd}
            >
              <GripVertical size={12} />
            </span>
          )}

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
            <div
              className="element-pill"
              onClick={() => handlePillClick(element)}
              draggable={canDrag}
              onDragStart={e => handleDragStart(e, element)}
              onDragEnd={handleDragEnd}
            >
              {element.id}
            </div>
          )}

          <div className="element-actions">
            <button
              onClick={() => addElement(element.id)}
              className="element-action-btn"
              title={t('actions.addChild')}
            >
              <CornerDownRight size={12} />
            </button>
            {!isRoot && (
              <button
                onClick={() => removeElement(element.id)}
                className="element-action-btn delete"
                title={t('actions.delete')}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Children with drawn connectors */}
        {hasChildren && (
          <div className="element-children">
            {children.map((child, idx) => {
              const childIsLast = idx === children.length - 1;
              return (
                <div key={child.id} className={`element-branch ${childIsLast ? 'branch-last' : ''}`}>
                  {/* Vertical spine + horizontal arm drawn via CSS */}
                  <div className="branch-connector" aria-hidden="true">
                    <div className="branch-vertical" />
                    <div className="branch-horizontal" />
                  </div>
                  {renderElement(child, level + 1, childIsLast)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const hasRoot = safeElements.length > 0;

  return (
    <div className="border p-4 min-h-[120px] bg-white shadow-inner">
      <div className="element-tree">
        {safeElements.map((el, idx) => renderElement(el, 0, idx === safeElements.length - 1))}
      </div>
      {!hasRoot && (
        <button
          onClick={() => addElement(null)}
          className="mt-4 pt-3 border-t border-slate-200 text-left text-xs font-bold text-violet-600 hover:text-violet-900 transition-colors w-full flex items-center gap-2 uppercase tracking-wider"
        >
          <Plus size={14} /> {t('editor.addRootElement')}
        </button>
      )}
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

const FOCUS_STEPS = ['nlu', 'visual', 'bitmap', 'format'] as const;

const FocusViewModal: React.FC<{
  mode: 'nlu' | 'visual' | 'bitmap' | 'format';
  row: RowData;
  onClose: () => void;
  onUpdate: (updates: Partial<RowData>) => void;
  onRegeneratePrompt: () => void;
  config: GlobalConfig;
  onConfigChange: (partial: Partial<GlobalConfig>) => void;
  onLog: (type: 'info' | 'error' | 'success', message: string) => void;
  onOpenEditor?: (source?: 'raw' | 'structured') => void;
  onOpenVectorizer?: () => void;
  onModeChange: (mode: 'nlu' | 'visual' | 'bitmap' | 'format') => void;
  onRecordElementOp?: (op: ElementOpKind, before: VisualElement[], after: VisualElement[]) => void;
  onSettleField?: () => void;
  onProcess?: (step: 'nlu' | 'visual' | 'bitmap') => Promise<boolean>;
  onStop?: () => void;
}> = ({ mode, row, onClose, onUpdate, onRegeneratePrompt, config, onConfigChange, onLog, onOpenEditor, onOpenVectorizer, onModeChange, onRecordElementOp, onSettleField, onProcess, onStop }) => {
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
    format: t('pipeline.format')
  };

  const renderContent = () => {
    switch (mode) {
      case 'nlu': return <SmartNLUEditor data={row.NLU} onUpdate={val => onUpdate({ NLU: val, visualStatus: 'outdated', bitmapStatus: 'outdated' })} config={config} onConfigChange={onConfigChange} expanded onSettleField={onSettleField} />;
      case 'visual': return (
        <div className="grid grid-cols-1 lg:grid-cols-2 h-full gap-6">
          <div className="flex flex-col">
            <label className="text-xs font-medium uppercase text-slate-500 block mb-2 tracking-widest">{t('editor.hierarchicalElements')}</label>
            <ElementsEditor elements={row.elements || []} onUpdate={val => {
              onUpdate({ elements: val, bitmapStatus: 'outdated' });
              setElementsManuallyEdited(true);
            }} onRecordOp={(op, before, after) => onRecordElementOp?.(op, before, after)} />
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
          <div className={`flex flex-col lg:border-l lg:pl-6 border-slate-200 transition-colors ${elementsManuallyEdited ? 'bg-amber-50 rounded-lg p-4 lg:border-l-amber-200' : ''}`}>
            <label className="text-xs font-medium uppercase text-slate-500 block mb-3 tracking-widest">{t('editor.spatialLogic')}</label>
            {isPromptEditing ? (
              <textarea
                value={row.prompt || ""}
                onChange={e => onUpdate({ prompt: e.target.value, bitmapStatus: 'outdated' })}
                onBlur={() => { setIsPromptEditing(false); onSettleField?.(); }}
                autoFocus
                className="w-full h-full text-lg text-slate-600 leading-relaxed p-3 bg-slate-50 rounded border border-slate-200 outline-none focus:ring-2 focus:ring-violet-300 resize-none"
              />
            ) : (
              <div
                onClick={() => setIsPromptEditing(true)}
                className="w-full h-full cursor-text text-lg text-slate-600 leading-relaxed p-3 bg-slate-50 rounded border border-slate-200"
              >
                {row.prompt && row.elements && row.elements.length > 0 ? (
                  <PromptRenderer prompt={row.prompt} elements={row.elements} bare />
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
      case 'format': {
        const hasRaw = !!row.rawSvg;
        const hasStructured = !!row.structuredSvg;

        // Nothing yet: two-column layout. Left = trace CTA, right = disabled
        // with a message pointing at the left. See specs/library-views.allium.
        if (!hasRaw && !hasStructured) {
          return (
            <div className="flex flex-row gap-3 h-full bg-slate-50 p-6">
              <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-white border border-slate-200 p-6">
                <FileCode size={40} className="text-slate-400" />
                <p className="text-sm text-slate-500 text-center">{t('svg.traceConverts')}</p>
                <button
                  onClick={() => onOpenVectorizer?.()}
                  className="flex items-center gap-2 bg-violet-950 text-white px-6 py-3 font-bold uppercase text-xs tracking-widest hover:bg-black transition-all shadow-lg"
                >
                  {t('svg.traceSvg')}
                </button>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-slate-100/50 border border-dashed border-slate-300 p-6 opacity-70">
                <Layers size={40} className="text-slate-300" />
                <p className="text-xs text-slate-500 text-center max-w-xs">{t('library.structureRequiresRaw')}</p>
                <button
                  disabled
                  className="flex items-center gap-2 bg-slate-200 text-slate-400 px-6 py-3 font-bold uppercase text-xs tracking-widest cursor-not-allowed"
                >
                  <Layers size={14} /> {t('svg.formatGemini')}
                </button>
              </div>
            </div>
          );
        }

        // Has SVG(s): two-column layout (raw left, structured right)
        // See specs/library-views.allium § FocusModalFormatStep
        return (
          <div className="flex flex-col h-full bg-slate-50 p-6">
            <div className="mb-3">
              <h3 className="text-xs font-bold uppercase text-slate-500 tracking-widest">SVG Output (SSoT)</h3>
            </div>
            <div className="flex-1 overflow-hidden">
              <SVGGenerator row={row} config={config} onLog={onLog} onUpdate={onUpdate} onOpenEditor={onOpenEditor} onOpenVectorizer={onOpenVectorizer} layout="columns" />
            </div>
          </div>
        );
      }
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
            <h2 className="text-base font-semibold text-slate-800 truncate">{row.UTTERANCE}</h2>
            <div className="flex items-center justify-center gap-3 mt-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{titleMap[mode]}</span>
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
            {/* Regenerate this step (mirrors the per-step Play button in the row's StepBox).
                For format step there is no single regenerate — vectorize and structure
                live in the column-specific actions. */}
            {(mode === 'nlu' || mode === 'visual' || mode === 'bitmap') && onProcess && (() => {
              const status = mode === 'nlu' ? row.nluStatus : mode === 'visual' ? row.visualStatus : row.bitmapStatus;
              const isProc = status === 'processing';
              return isProc && onStop ? (
                <button onClick={onStop} className="flex items-center gap-2 bg-orange-600 text-white px-6 py-3 font-bold uppercase text-xs tracking-widest hover:bg-orange-700 transition-all shadow-lg animate-pulse" title={t('actions.stopProcess')}>
                  <Square size={14} /> {t('actions.stopProcess')}
                </button>
              ) : (
                <button onClick={() => onProcess(mode)} className="flex items-center gap-2 bg-orange-500 text-white px-6 py-3 font-bold uppercase text-xs tracking-widest hover:bg-orange-600 transition-all shadow-lg" title={t('actions.regenerate')}>
                  <Play size={14} /> {t('actions.regenerate')}
                </button>
              );
            })()}
            {(mode === 'bitmap' || mode === 'format') && row.bitmap && (
              <button onClick={() => { const a = document.createElement('a'); a.href = row.bitmap!; a.download = `${row.UTTERANCE.replace(/\s+/g, '_').toLowerCase()}.png`; a.click(); }} className="flex items-center gap-2 bg-slate-100 text-slate-600 px-6 py-3 font-bold uppercase text-xs tracking-widest hover:bg-slate-200 transition-all">
                <Download size={14} /> PNG
              </button>
            )}
          </div>
          {/* Right actions */}
          <div className="flex gap-3">
            {mode === 'format' && (row.structuredSvg || row.rawSvg) && onOpenEditor && (
              <button onClick={onOpenEditor} className="flex items-center gap-2 bg-slate-100 text-slate-600 px-6 py-3 font-bold uppercase text-xs tracking-widest hover:bg-slate-200 transition-all">
                <Edit size={14} /> Editar SVG
              </button>
            )}
            {mode === 'format' && (row.structuredSvg || row.rawSvg) && (
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

const AppWithAuth: React.FC = () => {
  const [authUser, setAuthUser] = useState<{ email: string; user_metadata?: { full_name?: string } } | null>(null);
  return (
    <AuthProvider onUserChange={setAuthUser}>
      <App authUser={authUser} />
    </AuthProvider>
  );
};

export default AppWithAuth;
