import type { ReactNode } from 'react';

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
    <div className="banner error" role="group" aria-label="Error al cargar los datos">
      <p className="m-0">{message}</p>
      <button type="button" className="btn btn-sm mt-3" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}

/** Empty state text. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>;
}
