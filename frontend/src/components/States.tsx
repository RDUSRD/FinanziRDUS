/** Loading placeholder. Deliberately not a live region. */
export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return (
    <p className="empty-state" aria-busy="true">
      {label}
    </p>
  );
}

/** Error state with a retry action. Never a blank screen. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="notice error" role="group" aria-label="Error al cargar los datos">
      <p>{message}</p>
      <button type="button" className="pbtn" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}
