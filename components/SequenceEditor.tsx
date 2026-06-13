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
  ChevronLeft, GripVertical, X, Printer, Download, Plus,
} from 'lucide-react';
import { Sequence, Step } from '../types';
import { useTranslation } from '../hooks/useTranslation';

interface SequenceEditorProps {
  sequence: Sequence;
  onSave: (seq: Sequence) => void;
  onBack: () => void;
  /** App.tsx creates a blank RowData + returns a Step already linked to it. */
  onAddStep: () => Step;
  onPrint: (seq: Sequence) => void;
  onDownloadZip: (seq: Sequence) => void;
  /** Renders every step; receives the step, drag handle, 1-based position, and
   *  a callback to remove the step (and optionally its linked row). */
  renderLinkedRow?: (
    step: Step,
    dragHandle: React.ReactNode,
    position: number,
    deleteStep: () => void,
  ) => React.ReactNode;
}

// ── SortableStep ──────────────────────────────────────────────────────────────
// Thin sortable wrapper — all step content is delegated to renderLinkedRow.

function SortableStep({ step, onDelete, renderLinkedRow }: {
  step: Step;
  onDelete: () => void;
  renderLinkedRow: SequenceEditorProps['renderLinkedRow'];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

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
      {renderLinkedRow
        ? renderLinkedRow(step, dragHandle, step.position, onDelete)
        : (
          <div className="flex items-center gap-2 p-3 border border-dashed border-slate-200 rounded text-xs text-slate-400">
            {dragHandle}
            <span className="flex-1">Paso {step.position}</span>
            <button onClick={onDelete} className="p-1 hover:text-red-500"><X size={12} /></button>
          </div>
        )
      }
    </div>
  );
}

// ── SequenceEditor ────────────────────────────────────────────────────────────

export function SequenceEditor({
  sequence, onSave, onBack, onAddStep, onPrint, onDownloadZip, renderLinkedRow,
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

  // Sync external step updates (e.g., row generation completed in App.tsx).
  // Uses a functional updater to break the auto-save ↔ sync feedback loop:
  // when App.tsx reflects our own save back as a new array reference with
  // identical data, returning `prev` prevents a re-render and no further
  // auto-save fires.
  useEffect(() => {
    setSteps(prev => {
      if (prev.length !== sequence.steps.length) return sequence.steps;
      const changed = sequence.steps.some((s, i) =>
        prev[i].id !== s.id ||
        prev[i].rowId !== s.rowId ||
        prev[i].utterance !== s.utterance ||
        prev[i].state !== s.state ||
        prev[i].position !== s.position
      );
      return changed ? sequence.steps : prev;
    });
  }, [sequence.steps]);

  // Auto-save on every local change
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

  const deleteStep = useCallback((id: string) => {
    setSteps(prev =>
      prev.filter(s => s.id !== id).map((s, i) => ({ ...s, position: i + 1 }))
    );
  }, []);

  const addStep = () => {
    const newStep = onAddStep();
    setSteps(prev => [...prev, { ...newStep, position: prev.length + 1 }]);
  };

  const commitName = () => {
    const name = seqName.trim();
    if (!name) setSeqName(sequence.name);
    setIsEditingName(false);
  };

  const startEditingName = () => {
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const linkedSteps = steps.filter(s => s.rowId !== null);
  const canExport = linkedSteps.length > 0;
  const currentSeq = { ...sequence, name: seqName, steps, modifiedAt: new Date().toISOString() };

  return (
    <div className="py-4 space-y-6 animate-in fade-in duration-300">

      {/* Header — back link above title, exports to the right */}
      <div className="space-y-1">

        {/* Back button — sits above the title, not beside it */}
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-violet-700 transition-colors"
        >
          <ChevronLeft size={12} />
          {t('sequence.back')}
        </button>

        {/* Title row + export actions */}
        <div className="flex items-center gap-4">

          {/* Sequence name — same amber-bg style as the row utterance field */}
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
                className="w-full text-2xl font-bold text-slate-900 bg-amber-50 border-none outline-none focus:ring-0 rounded px-1 leading-tight"
              />
            ) : (
              <h2
                onClick={startEditingName}
                className="text-2xl font-bold text-slate-900 cursor-text hover:bg-amber-50 transition-colors rounded px-1 truncate leading-tight"
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

        {/* Step count — below the title row */}
        <p className="text-xs text-slate-400 px-1">
          {t('sequence.stepsCount', { count: steps.length, complete: linkedSteps.length })}
        </p>
      </div>

      {/* Sortable step list */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {steps.map(step => (
              <SortableStep
                key={step.id}
                step={step}
                onDelete={() => deleteStep(step.id)}
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
