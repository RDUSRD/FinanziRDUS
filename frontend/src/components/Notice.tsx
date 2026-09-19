/**
 * A visible, dismissible notice for success/error feedback, rendered on the
 * sheet. It is deliberately NOT a live region: the app keeps exactly one
 * `role="status"` region (LiveRegion.tsx) and never duplicates it.
 */
export function Notice({
  kind,
  text,
  onDismiss,
}: {
  kind: 'success' | 'error';
  text: string;
  onDismiss: () => void;
}) {
  return (
    <div className={kind === 'success' ? 'notice success' : 'notice error'}>
      <p>{text}</p>
      <button type="button" className="linkb" onClick={onDismiss} aria-label="Cerrar el aviso">
        Cerrar
      </button>
    </div>
  );
}
