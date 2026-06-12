import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronLeft, GripVertical, X, Printer, Download, Plus, Loader2,
} from 'lucide-react';
import { Sequence, Step, StepState, RowData } from '../types';
import { useTranslation } from '../hooks/useTranslation';

interface SequenceEditorProps {
  sequence: Sequence;
  libraryRows: RowData[];
  onSave: (seq: Sequence) => void;
  onBack: () => void;
  onGenerateRow: (utterance: string, stepId: string) => void;
  onPrint: (seq: Sequence) => void;
  onDownloadZip: (seq: Sequence) => void;
  /** When provided, linked steps (step.rowId set) are rendered via this instead of SortableStep.
   *  Receives the step, a drag handle element, 1-based position, and an unlinkStep callback. */
  renderLinkedRow?: (step: Step, dragHandle: React.ReactNode, position: number, unlinkStep: () => void) => React.ReactNode;
}

// ── StepThumbnail ─────────────────────────────────────────────────────────────
// Always occupies the same slot; renders image, spinner placeholder, or empty.

function StepThumbnail({ row, generating }: { row: RowData | null; generating?: boolean }) {
  if (generating && !row) {
    return (
      <div className="w-14 h-14 rounded border border-slate-200 bg-slate-50 shrink-0 flex items-center justify-center">
        <Loader2 size={18} className="animate-spin text-violet-300" />
      </div>
    );
  }
  if (!row) {
    return <div className="w-14 h-14 rounded border border-dashed border-slate-200 bg-slate-50 shrink-0" />;
  }
  const svg = row.structuredSvg || row.rawSvg;
  if (svg) {
    return (
      <img
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
        className="w-14 h-14 object-contain bg-white rounded border border-slate-200 shrink-0"
        alt=""
      />
    );
  }
  if (row.bitmap) {
    return (
      <img
        src={row.bitmap}
        className="w-14 h-14 object-contain bg-white rounded border border-slate-200 shrink-0"
        alt=""
      />
    );
  }
  // Row exists but hasn't produced imagery yet (still generating)
  return (
    <div className="w-14 h-14 rounded border border-slate-200 bg-slate-50 shrink-0 flex items-center justify-center">
      <Loader2 size={18} className="animate-spin text-violet-300" />
    </div>
  );
}

// ── SortableStep ──────────────────────────────────────────────────────────────

interface SortableStepProps {
  step: Step;
  libraryRows: RowData[];
  onUpdate: (s: Step) => void;
  onDelete: () => void;
  onGenerate: (utterance: string) => void;
  renderLinkedRow?: SequenceEditorProps['renderLinkedRow'];
}

function SortableStep({ step, libraryRows, onUpdate, onDelete, onGenerate, renderLinkedRow }: SortableStepProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  // When a row is linked and the caller provides renderLinkedRow, delegate rendering entirely.
  if (step.rowId && renderLinkedRow) {
    const dragHandle = (
      <button
        {...attributes}
        {...listeners}
        className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none"
        tabIndex={-1}
        aria-label="Arrastrar"
      >
        <GripVertical size={14} />
      </button>
    );
    return (
      <div ref={setNodeRef} style={style}>
        {renderLinkedRow(step, dragHandle, step.position, () => onUpdate({ ...step, rowId: null, state: 'blank' as const }))}
      </div>
    );
  }

  const [inputValue, setInputValue] = useState(step.utterance ?? '');
  const [suggestions, setSuggestions] = useState<RowData[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync utterance when step is updated externally (e.g. generation completed)
  useEffect(() => {
    setInputValue(step.utterance ?? '');
    if (step.state === 'complete') setGenerating(false);
  }, [step.utterance, step.state]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  const handleInputChange = (value: string) => {
    setInputValue(value);
    setGenerating(false);

    if (!value.trim()) {
      onUpdate({ ...step, utterance: null, rowId: null, state: 'blank' });
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const lower = value.toLowerCase();
    const exact = libraryRows.find(r => r.UTTERANCE.toLowerCase() === lower);

    if (exact) {
      onUpdate({ ...step, utterance: exact.UTTERANCE, rowId: exact.id, state: 'complete' });
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const matches = libraryRows
      .filter(r => r.UTTERANCE.toLowerCase().includes(lower))
      .slice(0, 8);

    const newState: StepState = value.trim() ? 'pending' : 'blank';
    onUpdate({ ...step, utterance: value, rowId: null, state: newState });
    setSuggestions(matches);
    setShowDropdown(matches.length > 0);
    setSelectedIdx(0);
  };

  const handleSelect = (row: RowData) => {
    setInputValue(row.UTTERANCE);
    onUpdate({ ...step, utterance: row.UTTERANCE, rowId: row.id, state: 'complete' });
    setSuggestions([]);
    setShowDropdown(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (suggestions[selectedIdx]) handleSelect(suggestions[selectedIdx]); }
    else if (e.key === 'Escape') setShowDropdown(false);
  };

  const handleGenerate = () => {
    if (!step.utterance) return;
    setGenerating(true);
    setSuggestions([]);
    setShowDropdown(false);
    onGenerate(step.utterance);
  };

  // Find the linked row (for thumbnail and status)
  const linkedRow = step.rowId ? libraryRows.find(r => r.id === step.rowId) ?? null : null;

  // A linked row that hasn't finished generating yet
  const rowIsProcessing = linkedRow && (
    linkedRow.nluStatus === 'processing' ||
    linkedRow.visualStatus === 'processing' ||
    linkedRow.bitmapStatus === 'processing'
  );

  const isGenerating = generating || !!rowIsProcessing;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-stretch bg-white border border-slate-200 rounded-lg hover:border-violet-300 transition-colors group"
    >
      {/* Left strip: drag handle + step number */}
      <div className="flex flex-col items-center justify-center gap-1 px-2 py-3 border-r border-slate-100 shrink-0">
        <button
          {...attributes}
          {...listeners}
          className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none"
          tabIndex={-1}
          aria-label="Arrastrar"
        >
          <GripVertical size={14} />
        </button>
        <span className="text-[10px] font-bold text-slate-400 leading-none">{step.position}</span>
      </div>

      {/* Thumbnail slot — always rendered for stable layout */}
      <div className="flex items-center px-3 py-3 shrink-0">
        <StepThumbnail row={linkedRow} generating={isGenerating && !linkedRow} />
      </div>

      {/* Utterance input + autocomplete dropdown */}
      <div className="flex-1 min-w-0 flex items-center py-3 pr-1" ref={dropdownRef}>
        <div className="relative w-full">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={e => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
            placeholder={t('sequence.stepPlaceholder')}
            disabled={generating}
            className={`w-full text-sm border-b-2 outline-none py-0.5 bg-transparent transition-colors
              ${generating
                ? 'border-slate-100 text-slate-400 cursor-not-allowed'
                : step.state === 'blank'
                ? 'border-slate-200 text-slate-900 placeholder:text-slate-300 focus:border-amber-300'
                : 'border-amber-300 text-slate-900 focus:border-amber-400'
              }`}
          />
          {showDropdown && suggestions.length > 0 && (
            <div className="absolute z-30 left-0 top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {suggestions.map((row, i) => (
                <button
                  key={row.id}
                  onMouseDown={e => { e.preventDefault(); handleSelect(row); }}
                  onMouseEnter={() => setSelectedIdx(i)}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
                    i === selectedIdx ? 'bg-violet-50 text-violet-900' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {(row.structuredSvg || row.rawSvg || row.bitmap) && (
                    <span className="w-6 h-6 shrink-0 inline-block">
                      {(row.structuredSvg || row.rawSvg) ? (
                        <img
                          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(row.structuredSvg || row.rawSvg || '')}`}
                          className="w-6 h-6 object-contain"
                          alt=""
                        />
                      ) : row.bitmap ? (
                        <img src={row.bitmap} className="w-6 h-6 object-contain" alt="" />
                      ) : null}
                    </span>
                  )}
                  <span className="truncate">{row.UTTERANCE}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1.5 px-3 py-3 shrink-0">
        {isGenerating ? (
          <Loader2 size={14} className="animate-spin text-violet-400" />
        ) : step.state === 'pending' && step.utterance ? (
          <button
            onClick={handleGenerate}
            className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-violet-950 text-white hover:bg-violet-800 transition-colors rounded"
          >
            {t('sequence.generateStep')}
          </button>
        ) : null}

        <button
          onClick={onDelete}
          className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors opacity-0 group-hover:opacity-100"
          aria-label="Eliminar paso"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ── SequenceEditor ────────────────────────────────────────────────────────────

export function SequenceEditor({
  sequence, libraryRows, onSave, onBack, onGenerateRow, onPrint, onDownloadZip, renderLinkedRow,
}: SequenceEditorProps) {
  const { t } = useTranslation();
  const [steps, setSteps] = useState<Step[]>(sequence.steps);
  const [seqName, setSeqName] = useState(sequence.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Re-sync when switching to a different sequence
  useEffect(() => {
    setSteps(sequence.steps);
    setSeqName(sequence.name);
  }, [sequence.id]);

  // Sync external step updates (e.g., generation completed)
  useEffect(() => {
    setSteps(sequence.steps);
  }, [sequence.steps]);

  // Auto-save on every change
  useEffect(() => {
    onSave({
      ...sequence,
      name: seqName,
      steps,
      modifiedAt: new Date().toISOString(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, seqName]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSteps(prev => {
      const oldIdx = prev.findIndex(s => s.id === active.id);
      const newIdx = prev.findIndex(s => s.id === over.id);
      const moved = arrayMove(prev, oldIdx, newIdx);
      return moved.map((s: Step, i: number): Step => Object.assign({}, s, { position: i + 1 }));
    });
  };

  const updateStep = useCallback((id: string, patch: Partial<Step>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }, []);

  const deleteStep = useCallback((id: string) => {
    setSteps(prev =>
      prev.filter(s => s.id !== id).map((s, i) => ({ ...s, position: i + 1 }))
    );
  }, []);

  const addStep = () => {
    const newStep: Step = {
      id: crypto.randomUUID(),
      position: steps.length + 1,
      utterance: null,
      rowId: null,
      state: 'blank',
    };
    setSteps(prev => [...prev, newStep]);
  };

  const commitName = () => {
    const name = seqName.trim();
    if (!name) setSeqName(sequence.name);
    setIsEditingName(false);
  };

  const startEditingName = () => {
    setIsEditingName(true);
    // Focus after state update renders the input
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const completeSteps = steps.filter(s => s.state === 'complete');
  const canExport = completeSteps.length > 0;
  const currentSeq = { ...sequence, name: seqName, steps, modifiedAt: new Date().toISOString() };

  return (
    <div className="py-4 space-y-6 animate-in fade-in duration-300">

      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-violet-700 transition-colors shrink-0"
        >
          <ChevronLeft size={14} />
          {t('sequence.back')}
        </button>

        {/* Sequence name — amber underline on hover/edit, larger type */}
        <div className="flex-1 min-w-0">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              value={seqName}
              onChange={e => setSeqName(e.target.value)}
              onBlur={commitName}
              onKeyDown={e => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') { setSeqName(sequence.name); setIsEditingName(false); }
              }}
              autoFocus
              className="w-full text-2xl font-bold text-slate-900 bg-transparent border-b-2 border-amber-400 outline-none leading-tight"
            />
          ) : (
            <h2
              onClick={startEditingName}
              className="text-2xl font-bold text-slate-900 cursor-text border-b-2 border-transparent hover:border-amber-300 transition-colors truncate leading-tight"
              title={seqName}
            >
              {seqName}
            </h2>
          )}
        </div>

        {/* Export actions */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onPrint(currentSeq)}
            disabled={!canExport}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-violet-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Printer size={14} />
            {t('sequence.printSequence')}
          </button>
          <button
            onClick={() => onDownloadZip(currentSeq)}
            disabled={!canExport}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-violet-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Download size={14} />
            {t('sequence.downloadPictogramas')}
          </button>
        </div>
      </div>

      {/* Step count */}
      <p className="text-xs text-slate-400">
        {t('sequence.stepsCount', { count: steps.length, complete: completeSteps.length })}
      </p>

      {/* Sortable step list */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {steps.map(step => (
              <SortableStep
                key={step.id}
                step={step}
                libraryRows={libraryRows}
                onUpdate={updated => updateStep(step.id, updated)}
                onDelete={() => deleteStep(step.id)}
                onGenerate={utterance => onGenerateRow(utterance, step.id)}
                renderLinkedRow={renderLinkedRow}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add step */}
      <button
        onClick={addStep}
        className="flex items-center gap-2 text-xs text-slate-400 hover:text-violet-600 transition-colors py-2"
      >
        <Plus size={14} />
        {t('sequence.addStep')}
      </button>

      {!canExport && steps.length > 0 && (
        <p className="text-xs text-slate-400 italic">{t('sequence.noCompleteSteps')}</p>
      )}
    </div>
  );
}
