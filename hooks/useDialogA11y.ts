import { useEffect, useRef, useCallback } from 'react';

interface UseDialogA11yOptions {
  isOpen: boolean;
  onClose: () => void;
  labelledBy?: string;
  label?: string;
}

interface DialogA11yResult {
  dialogRef: React.RefObject<HTMLDivElement | null>;
  dialogProps: {
    ref: React.RefObject<HTMLDivElement | null>;
    role: 'dialog';
    'aria-modal': 'true';
    'aria-label'?: string;
    'aria-labelledby'?: string;
  };
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function useDialogA11y({
  isOpen,
  onClose,
  labelledBy,
  label,
}: UseDialogA11yOptions): DialogA11yResult {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Keep a stable ref to onClose so handleKeyDown never changes identity
  // even when the caller passes a new inline arrow function on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // Focus trap: cycle Tab/Shift+Tab within the dialog.
  // Empty deps → stable reference. Uses onCloseRef to always call the latest onClose.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      if (e.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null);

      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [] // stable — reads onClose via ref
  );

  // Auto-focus on open; restore focus on close.
  // Runs only when isOpen changes, never on prop/callback identity changes.
  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    const raf = requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;

      const firstFocusable = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        dialog.setAttribute('tabindex', '-1');
        dialog.focus();
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen]);

  // Attach/detach the key handler. handleKeyDown is stable so this only
  // re-runs when isOpen changes, not on every parent render.
  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  const dialogProps: DialogA11yResult['dialogProps'] = {
    ref: dialogRef,
    role: 'dialog' as const,
    'aria-modal': 'true' as const,
  };

  if (labelledBy) {
    dialogProps['aria-labelledby'] = labelledBy;
  } else if (label) {
    dialogProps['aria-label'] = label;
  }

  return { dialogRef, dialogProps };
}
