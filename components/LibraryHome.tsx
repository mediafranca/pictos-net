import React, { useState, useRef, useEffect } from 'react';
import {
  Plus, MoreHorizontal, Globe, Download, Copy, Trash2, Edit,
  FolderOpen, HardDrive, Upload, FileText,
} from 'lucide-react';
import { LibraryMeta } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import * as libraryService from '../services/libraryService';

interface LibraryMetadata {
  filename: string;
  name: string;
  location: string;
  language: string;
  items: number;
}

interface LibraryHomeProps {
  libraries: LibraryMeta[];
  templates: LibraryMetadata[];
  sort: 'recientes' | 'alfabetico';
  onSortChange: (s: 'recientes' | 'alfabetico') => void;
  storageUsed: number;
  storageQuota: number;
  activeLibraryId?: string;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDuplicate: (id: string) => void;
  onDownload: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onImport: () => void;
  onImportPhrases: () => void;
  onBackup: () => void;
  onOpenTemplate: (filename: string) => void;
}

// ── helpers ────────────────────────────────────────────────────────────────────

function relativeDate(iso: string, t: (k: string, v?: Record<string, string | number>) => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return t('sequence.today');
  if (days === 1) return t('sequence.yesterday');
  if (days < 7) return t('sequence.daysAgo', { days });
  if (days < 30) return t('sequence.weeksAgo', { weeks: Math.floor(days / 7) });
  return t('sequence.monthsAgo', { months: Math.floor(days / 30) });
}

function formatBytes(n: number): string {
  return n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`;
}

// ── ThumbnailStrip ─────────────────────────────────────────────────────────────
// NOTE: overflow-hidden lives here (not on the card root) so the card's
// dropdown menu is not clipped by an ancestor overflow context.

interface ThumbnailImage {
  src: string;
  srcSet?: string;
}

function ThumbnailStrip({ images }: { images: ThumbnailImage[] }) {
  const slots = [0, 1, 2].map(i => images[i] ?? null);
  return (
    <div className="flex aspect-[3/1] bg-slate-100 rounded-t-xl overflow-hidden shrink-0">
      {slots.map((img, i) =>
        img ? (
          // bg-white so pictograms on transparent/white backgrounds render cleanly.
          // object-contain prevents cropping (pictograms must not be clipped).
          <div key={i} className="w-1/3 h-full bg-white">
            {img.srcSet ? (
              <picture className="w-full h-full block">
                <source srcSet={img.srcSet} type="image/webp" />
                <img src={img.src} alt="" className="w-full h-full object-contain" loading="lazy" width={300} height={300} />
              </picture>
            ) : (
              <img src={img.src} alt="" className="w-full h-full object-contain" loading="lazy" width={300} height={300} />
            )}
          </div>
        ) : (
          <div key={i} className="w-1/3 h-full bg-slate-100" />
        )
      )}
    </div>
  );
}

// ── LibraryCard ────────────────────────────────────────────────────────────────

interface LibraryCardProps {
  lib: LibraryMeta;
  isActive?: boolean;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDownload: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
}

function LibraryCard({ lib, isActive, onOpen, onDuplicate, onDownload, onRename, onDelete }: LibraryCardProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(lib.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPreviews(libraryService.getLibraryPreviews(lib.id));
  }, [lib.id, lib.modifiedAt]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const commitRename = () => {
    const name = editName.trim();
    if (name && name !== lib.name) onRename(lib.id, name);
    setIsEditing(false);
  };

  const thumbnailImages: ThumbnailImage[] = previews.map(src => ({ src }));

  const menuItems = [
    { label: t('actions.openLibrary'),      icon: <FolderOpen size={12} />, action: () => { onOpen(lib.id); setMenuOpen(false); } },
    { label: t('actions.duplicateLibrary'), icon: <Copy size={12} />,       action: () => { onDuplicate(lib.id); setMenuOpen(false); } },
    { label: t('actions.downloadLibrary'),  icon: <Download size={12} />,   action: () => { onDownload(lib.id); setMenuOpen(false); } },
    { label: t('actions.renameLibrary'),    icon: <Edit size={12} />,       action: () => { setIsEditing(true); setEditName(lib.name); setMenuOpen(false); } },
  ];

  return (
    // No overflow-hidden here — the dropdown menu must escape the card bounds.
    // The ThumbnailStrip handles its own rounded-t-xl overflow clipping.
    <div
      className={`relative bg-white rounded-xl transition-all flex flex-col group cursor-pointer border ${
        isActive
          ? 'border-violet-400 scale-[1.06] shadow-[0_18px_30px_-10px_rgba(0,0,0,0.25)] z-10'
          : 'border-slate-200 hover:border-violet-400 hover:shadow-md'
      }`}
      onClick={() => !menuOpen && !isEditing && onOpen(lib.id)}
    >
      <ThumbnailStrip images={thumbnailImages} />

      <div className="p-4 flex flex-col gap-1.5 flex-1">
        {/* Name + menu row */}
        <div className="flex items-start justify-between gap-2" onClick={e => e.stopPropagation()}>
          {isEditing ? (
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') { setEditName(lib.name); setIsEditing(false); }
              }}
              className="font-bold text-sm text-slate-900 bg-transparent border-b border-violet-400 outline-none flex-1 min-w-0"
              autoFocus
            />
          ) : (
            <h3
              className="font-bold text-sm text-slate-900 leading-tight flex-1 min-w-0 truncate"
              onDoubleClick={() => { setIsEditing(true); setEditName(lib.name); }}
              title={lib.name}
            >
              {lib.name}
            </h3>
          )}
          {lib.language && !isEditing && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0 leading-tight">
              {lib.language}
            </span>
          )}

          <div className="relative" ref={menuRef}>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(m => !m); }}
              className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
              aria-label="Opciones"
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-7 z-30 bg-white border border-slate-200 rounded-lg shadow-lg min-w-[160px] py-1">
                {menuItems.map(item => (
                  <button
                    key={item.label}
                    onClick={e => { e.stopPropagation(); item.action(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 text-left"
                  >
                    {item.icon}{item.label}
                  </button>
                ))}
                <div className="border-t border-slate-100 mt-1 pt-1">
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(lib.id); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 text-left"
                  >
                    <Trash2 size={12} />{t('actions.deleteLibrary')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-400">
          {t('home.libraryItemCount', { pictograms: lib.pictogramCount, sequences: lib.sequenceCount })}
        </p>
        <p className="text-xs text-slate-400 mt-auto">{relativeDate(lib.modifiedAt, t)}</p>
      </div>
    </div>
  );
}

// ── TemplateCard ───────────────────────────────────────────────────────────────
// Visually identical structure to LibraryCard: strip → name+badge+menu → count → footer.

function TemplateCard({ tmpl, onOpen }: { tmpl: LibraryMetadata; onOpen: () => void }) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const slug = tmpl.filename.replace(/(_graph.*)?\.json$/, '');
  const images: ThumbnailImage[] = [0, 1, 2].map(i => ({
    src: `/libraries/thumbs/${slug}_${i}.jpg`,
    srcSet: `/libraries/thumbs-opt/${slug}_${i}.webp`,
  }));

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div
      onClick={() => !menuOpen && onOpen()}
      className="bg-white border border-slate-200 rounded-xl hover:border-violet-400 hover:shadow-md transition-all flex flex-col group cursor-pointer"
    >
      <ThumbnailStrip images={images} />

      <div className="p-4 flex flex-col gap-1.5 flex-1">
        {/* Name + language badge + menu row — mirrors LibraryCard */}
        <div className="flex items-start justify-between gap-2" onClick={e => e.stopPropagation()}>
          <h3
            className="font-bold text-sm text-slate-900 leading-tight flex-1 min-w-0 truncate"
            title={tmpl.name}
          >
            {tmpl.name}
          </h3>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0 leading-tight">
            {tmpl.language}
          </span>
          <div className="relative" ref={menuRef}>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(m => !m); }}
              className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
              aria-label="Opciones"
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-7 z-30 bg-white border border-slate-200 rounded-lg shadow-lg min-w-[160px] py-1">
                <button
                  onClick={e => { e.stopPropagation(); onOpen(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 text-left"
                >
                  <FolderOpen size={12} />{t('actions.openLibrary')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Item count — unified with LibraryCard */}
        <p className="text-xs text-slate-400">
          {t('home.libraryItemCount', { pictograms: tmpl.items, sequences: 0 })}
        </p>

        {/* Footer — location */}
        <p className="text-xs text-slate-400 mt-auto flex items-center gap-1 min-w-0">
          <Globe size={10} className="shrink-0" />
          <span className="truncate">{tmpl.location}</span>
        </p>
      </div>
    </div>
  );
}

// ── CreateLibraryCard ──────────────────────────────────────────────────────────

function CreateLibraryCard({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      onClick={onCreate}
      className="border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-violet-400 hover:bg-violet-50 transition-all min-h-[160px] group"
    >
      <Plus size={20} className="text-slate-300 group-hover:text-violet-500 transition-colors" />
      <span className="text-xs font-semibold text-slate-400 group-hover:text-violet-600 transition-colors text-center px-4">
        {t('actions.createLibrary')}
      </span>
    </div>
  );
}

// ── LibraryHome ────────────────────────────────────────────────────────────────

export function LibraryHome({
  libraries,
  templates,
  sort,
  onSortChange,
  storageUsed,
  storageQuota,
  activeLibraryId,
  onOpen,
  onCreate,
  onDuplicate,
  onDownload,
  onRename,
  onDelete,
  onImport,
  onImportPhrases,
  onBackup,
  onOpenTemplate,
}: LibraryHomeProps) {
  const { t } = useTranslation();

  const sortedLibraries = sort === 'alfabetico'
    ? [...libraries].sort((a, b) => a.name.localeCompare(b.name))
    : [...libraries].sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

  const isStorageHigh = storageQuota > 0 && storageUsed / storageQuota > 0.8;
  const activeLib = libraries.find(l => l.id === activeLibraryId);

  return (
    <div className="py-12 space-y-8 animate-in fade-in zoom-in-95 duration-700">

      {/* Hero — large branding + import card */}
      <div className="py-8 text-center space-y-10">
        <div className="space-y-3">
          <p className="text-8xl font-black tracking-tighter text-slate-900 leading-none select-none" aria-hidden="true">
            pictos
          </p>
          <p className="text-slate-500 text-lg font-medium max-w-xl mx-auto leading-relaxed">
            {t('home.description')}
          </p>
        </div>
        <div className="flex justify-center">
          <div
            onClick={onImportPhrases}
            className="bg-violet-950 p-12 text-left space-y-6 shadow-xl hover:bg-black transition-all cursor-pointer group hover:-translate-y-1 w-full max-w-md"
          >
            <div className="text-white group-hover:scale-110 transition-transform origin-left">
              <FileText size={40} />
            </div>
            <div>
              <h2 className="font-bold text-xl uppercase tracking-wider text-white">{t('home.importTextNode')}</h2>
              <div className="text-xs text-violet-400 font-mono mt-1">{t('home.importNamespace')}</div>
            </div>
            <p className="text-xs text-violet-300 leading-relaxed font-medium">{t('home.importDescription')}</p>
          </div>
        </div>
      </div>

      {/* Title row: "Librerías" left (with active library indicator), sort links right */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('home.libraries')}</h1>
          {activeLib && (
            <p className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" aria-hidden="true" />
              {activeLib.name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-400 mt-1">
          <button
            onClick={() => onSortChange('recientes')}
            className={`transition-colors ${sort === 'recientes' ? 'text-violet-700 font-semibold' : 'hover:text-slate-700'}`}
          >
            {t('library.recent')}
          </button>
          <span className="mx-1">·</span>
          <button
            onClick={() => onSortChange('alfabetico')}
            className={`transition-colors ${sort === 'alfabetico' ? 'text-violet-700 font-semibold' : 'hover:text-slate-700'}`}
          >
            {t('library.alphabetical')}
          </button>
        </div>
      </div>

      {/* Unified grid: user libraries + example templates + create card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sortedLibraries.map(lib => (
          <LibraryCard
            key={lib.id}
            lib={lib}
            isActive={lib.id === activeLibraryId}
            onOpen={onOpen}
            onDuplicate={onDuplicate}
            onDownload={onDownload}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
        {templates.map(tmpl => (
          <TemplateCard
            key={tmpl.filename}
            tmpl={tmpl}
            onOpen={() => onOpenTemplate(tmpl.filename)}
          />
        ))}
        <CreateLibraryCard onCreate={onCreate} />
      </div>

      {/* Bottom bar: storage + icon-link actions */}
      <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-100">
        <div className="flex items-center gap-1.5">
          <HardDrive size={12} className={isStorageHigh ? 'text-amber-500' : 'text-slate-400'} />
          {storageQuota > 0 && (
            <span className={`text-xs ${isStorageHigh ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>
              {t(isStorageHigh ? 'library.storageIndicatorHigh' : 'library.storageIndicator', {
                used: formatBytes(storageUsed),
                total: formatBytes(storageQuota),
              })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-5">
          <button
            onClick={onImport}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-violet-700 transition-colors"
          >
            <Upload size={12} />
            {t('home.importLibraryFile')}
          </button>
          <button
            onClick={onBackup}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-violet-700 transition-colors"
          >
            <Download size={12} />
            {t('actions.backupLibraries')}
          </button>
        </div>
      </div>

    </div>
  );
}
