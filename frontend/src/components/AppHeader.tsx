import { useRef, type ChangeEvent } from 'react';
import type { Account, AccountFilter, ImportMode } from '../api/types';

interface AppHeaderProps {
  monthLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onCurrentMonth: () => void;
  onExport: () => void;
  onImport: (file: File, mode: ImportMode) => void;
  accounts: Account[];
  account: AccountFilter;
  onAccountChange: (value: AccountFilter) => void;
  busy?: boolean;
}

export function AppHeader({
  monthLabel,
  onPrev,
  onNext,
  onCurrentMonth,
  onExport,
  onImport,
  accounts,
  account,
  onAccountChange,
  busy = false,
}: AppHeaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef<ImportMode>('merge');

  function triggerImport(mode: ImportMode) {
    modeRef.current = mode;
    fileRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onImport(file, modeRef.current);
    event.target.value = '';
  }

  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="m-0 mb-1 text-[.78rem] font-bold uppercase tracking-[.08em] text-muted">
          Cartera en USD
        </p>
        <h1 className="m-0 mb-1 text-[clamp(1.35rem,1rem+1.4vw,1.75rem)] tracking-[-.01em]">
          Gastos e ingresos
        </h1>
        <p className="m-0 text-[.92rem] text-muted">
          Cargá en dólares o en bolívares con su tasa; el total siempre se muestra en USD.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={onExport} disabled={busy}>
          Exportar JSON
        </button>
        <button type="button" className="btn" onClick={() => triggerImport('merge')} disabled={busy}>
          Importar y fusionar
        </button>
        <button type="button" className="btn" onClick={() => triggerImport('replace')} disabled={busy}>
          Importar y reemplazar
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-label="Archivo JSON a importar"
          onChange={handleFileChange}
        />

        <div className="filter-field" role="group" aria-label="Filtro de cartera">
          <label htmlFor="filter-account">Cartera</label>
          <select
            id="filter-account"
            value={account === 'all' ? 'all' : String(account)}
            onChange={(event) =>
              onAccountChange(event.target.value === 'all' ? 'all' : Number(event.target.value))
            }
          >
            <option value="all">Todas</option>
            {accounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Navegación por mes">
          <button type="button" className="btn icon-btn" onClick={onPrev} aria-label="Mes anterior">
            &#8249;
          </button>
          <span className="min-w-40 text-center text-[1.02rem] font-bold capitalize">{monthLabel}</span>
          <button type="button" className="btn icon-btn" onClick={onNext} aria-label="Mes siguiente">
            &#8250;
          </button>
          <button type="button" className="btn btn-sm" onClick={onCurrentMonth}>
            Mes actual
          </button>
        </div>
      </div>
    </header>
  );
}
