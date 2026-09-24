import type { Account, AccountFilter } from '../api/types';
import { formatRate } from '../lib/money';
import { formatDateDisplay } from '../lib/month';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons';

interface AppHeaderProps {
  monthLabel: string;
  /** Current month as the app's "YYYY-MM" key, for the month jump field. */
  month: string;
  onPrev: () => void;
  onNext: () => void;
  onCurrentMonth: () => void;
  onMonthChange: (month: string) => void;
  onExport: () => void;
  onImport: () => void;
  onNewMovement: () => void;
  /** Opens the admin panel (password and active sessions). */
  onOpenAdmin: () => void;
  /** Ends the session and returns to the login screen. */
  onLogout: () => void;
  accounts: Account[];
  account: AccountFilter;
  onAccountChange: (value: AccountFilter) => void;
  busy?: boolean;
  /** Rate (Bs per USD x 1e6) of the user's last VES movement, or null. */
  lastRateMicros?: number | null;
}

/**
 * The document letterhead (`Nº YYYY-MM`, closed by the double rule): the house
 * name and its tag line at the left, the correlative number and the document's
 * date at the right. The month is the document's own date, so its navigation
 * lives here, together with the wallet filter, the last-rate plaque and the
 * single saturated action plate.
 *
 * The rate plaque is explicitly the USER'S last loaded rate — never a global or
 * automatic one: the product has no such feature.
 */
export function AppHeader({
  monthLabel,
  month,
  onPrev,
  onNext,
  onCurrentMonth,
  onMonthChange,
  onExport,
  onImport,
  onNewMovement,
  onOpenAdmin,
  onLogout,
  accounts,
  account,
  onAccountChange,
  busy = false,
  lastRateMicros = null,
}: AppHeaderProps) {
  const docDate = formatDateDisplay(`${month}-01`);

  return (
    <header className="membrete">
      <div className="brand">
        <h1 className="house">FinanciRDUS</h1>
        <span className="tag-line">Cuentas de la casa · cartera en dólares</span>
      </div>

      <div className="doc-no">
        <div>
          Nº <b>{month}</b>
        </div>
        <div>{docDate}</div>
      </div>

      <div className="monthnav">
        <div className="monthnav-main">
          <button type="button" className="mnav-btn" onClick={onPrev} aria-label="Mes anterior">
            <ChevronLeftIcon size={20} />
          </button>
          <span className="m">{monthLabel}</span>
          <button type="button" className="mnav-btn" onClick={onNext} aria-label="Mes siguiente">
            <ChevronRightIcon size={20} />
          </button>
        </div>

        <div className="monthnav-tools">
          <button type="button" className="pbtn" onClick={onCurrentMonth}>
            Mes actual
          </button>
          <div className="monthjump">
            <label htmlFor="month-jump">Ir a un mes</label>
            <input
              id="month-jump"
              type="month"
              value={month}
              onChange={(event) => onMonthChange(event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="sect-actions">
        <div className="field" role="group" aria-label="Filtro de cartera">
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

        <div className="rate">
          <span>Última tasa cargada</span>
          {lastRateMicros ? (
            <>
              <b>{formatRate(lastRateMicros)} Bs/USD</b>
              <span>el último entre los movimientos en bolívares que estás viendo</span>
            </>
          ) : (
            <span>sin movimientos en bolívares entre los que estás viendo</span>
          )}
        </div>

        <button type="button" className="plate" onClick={onNewMovement}>
          Anotar movimiento
        </button>
        <button
          type="button"
          className="pbtn"
          onClick={onExport}
          disabled={busy}
          aria-label="Exportar JSON"
        >
          Exportar
        </button>
        <button type="button" className="pbtn" onClick={onImport} disabled={busy}>
          Importar
        </button>
        <button type="button" className="pbtn" onClick={onOpenAdmin} disabled={busy}>
          Admin
        </button>
        <button type="button" className="linkb" onClick={onLogout}>
          Salir
        </button>
      </div>
    </header>
  );
}
