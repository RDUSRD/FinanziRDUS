import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { CloseIcon } from './Icons';

interface WindowProps {
  /** Whether the window is rendered. When false the component renders nothing. */
  open: boolean;
  /** The window's heading text. Also names the dialog unless `labelledById` is set. */
  title: string;
  /** Called on close: the close button, Escape and a scrim click route here. */
  onClose: () => void;
  /** Id of an existing heading to use as the accessible name (skips the built-in h2). */
  labelledById?: string;
  children: ReactNode;
  /** Actions rendered in the bottom bar of the window. */
  footer?: ReactNode;
  /** While true the window cannot be dismissed and the close button is disabled. */
  busy?: boolean;
  /** Element to receive focus when the window opens (defaults to the first focusable). */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * The window primitive: a sheet thrown over the desk on a scrim, with a titled
 * bar and a labelled close button. It traps focus, closes on Escape, locks body
 * scroll, closes on a scrim click and restores focus to the opener on close.
 * Never nest one window inside another.
 */
export function Window({
  open,
  title,
  onClose,
  labelledById,
  children,
  footer,
  busy = false,
  initialFocusRef,
}: WindowProps) {
  const windowRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const reactId = useId();
  const autoTitleId = `window-title-${reactId.replace(/[^A-Za-z0-9_-]/g, '')}`;
  const titleId = labelledById ?? autoTitleId;

  // Remember the opener and restore focus to it when the window closes.
  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement ? active : null;
    return () => {
      openerRef.current?.focus();
    };
  }, [open]);

  // Move focus into the window once it is open.
  useEffect(() => {
    if (!open) return;
    const node = windowRef.current;
    if (!node) return;
    const first = node.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (initialFocusRef?.current ?? first ?? node).focus();
  }, [open, initialFocusRef]);

  // Lock body scroll while the window is open, restore it afterwards.
  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previous;
    };
  }, [open]);

  const focusableWithin = useCallback((): HTMLElement[] => {
    const node = windowRef.current;
    if (!node) return [];
    return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!busy) {
        event.preventDefault();
        onClose();
      }
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = focusableWithin();
    if (focusable.length === 0) {
      event.preventDefault();
      windowRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const inside = windowRef.current?.contains(active) ?? false;

    if (event.shiftKey) {
      if (!inside || active === first) {
        event.preventDefault();
        last.focus();
      }
    } else if (!inside || active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="scrim" aria-hidden="true" onClick={busy ? undefined : onClose} />
      <div
        ref={windowRef}
        className="window"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="wtitle">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="iconb"
            aria-label="Cerrar"
            onClick={onClose}
            disabled={busy}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="wbody">{children}</div>
        {footer ? <div className="wfoot">{footer}</div> : null}
      </div>
    </>
  );
}

interface ConfirmWindowProps {
  open: boolean;
  title: string;
  /** The consequence, named as specifically as possible. */
  children: ReactNode;
  confirmLabel: string;
  /** Marks the confirmed action as destructive (delete a movement or a wallet). */
  destructive?: boolean;
  confirmBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A confirmation window built on `Window`. Focus starts on the cancel action
 * so a stray Enter never commits the change.
 */
export function ConfirmWindow({
  open,
  title,
  children,
  confirmLabel,
  destructive = false,
  confirmBusy = false,
  onConfirm,
  onCancel,
}: ConfirmWindowProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Window
      open={open}
      title={title}
      onClose={onCancel}
      busy={confirmBusy}
      initialFocusRef={cancelRef}
      footer={
        <>
          <button ref={cancelRef} type="button" className="linkb" onClick={onCancel} disabled={confirmBusy}>
            Cancelar
          </button>
          <button
            type="button"
            className="plate"
            data-destructive={destructive ? 'true' : undefined}
            onClick={onConfirm}
            disabled={confirmBusy}
          >
            {confirmBusy ? 'Guardando…' : confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Window>
  );
}
