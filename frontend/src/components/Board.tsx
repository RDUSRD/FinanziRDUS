import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Movement } from '../api/types';
import { formatBss, formatMoney, formatRate } from '../lib/money';
import { dayLabel, formatDateDisplay } from '../lib/month';
import { readPins, togglePin, writePins } from '../lib/pins';
import { PinIcon } from './Icons';
import { useAnnounce } from './LiveRegion';

type TypeFilter = 'all' | 'gasto' | 'ingreso';

/** Day blocks per page: the month is read in tandas, never one long scroll. */
const DAYS_PER_PAGE = 6;

/** Lowercase and strip diacritics so «alquiler» matches «Alquiler». */
function normalizeText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * The month's pinned ids, kept in this browser (see `lib/pins`); there is no
 * field for them in the frozen API contract.
 */
function usePins(month: string): [number[], (id: number) => void] {
  const [pins, setPins] = useState<number[]>([]);

  useEffect(() => {
    setPins(readPins(month));
  }, [month]);

  const toggle = useCallback(
    (id: number) => {
      setPins((current) => {
        const next = togglePin(current, id);
        writePins(month, next);
        return next;
      });
    },
    [month],
  );

  return [pins, toggle];
}

/** One day of the month and the facturitas that landed on it. */
interface DayGroup {
  date: string;
  movements: Movement[];
}

/** Split the already sorted list into consecutive days. */
function groupByDay(movements: Movement[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const movement of movements) {
    const last = groups[groups.length - 1];
    if (last && last.date === movement.date) last.movements.push(movement);
    else groups.push({ date: movement.date, movements: [movement] });
  }
  return groups;
}

interface FacturaProps {
  movement: Movement;
  /** Correlative number of the facturita within the month on screen. */
  number: number;
  labelOf: (categoryId: string) => string;
  accountNameOf: (movement: Movement) => string;
  pinned: boolean;
  onTogglePin: (movement: Movement) => void;
  onEdit: (movement: Movement) => void;
  onDelete: (movement: Movement) => void;
}

/**
 * One facturita: a printed rectangle with its correlative number and its amount
 * on the header line, then the concept, the wallet and the note, and its actions
 * below the tear line. The amount is the largest figure on it; a VES entry keeps
 * its original bolívar amount in the pen underneath.
 */
function Factura({
  movement,
  number,
  labelOf,
  accountNameOf,
  pinned,
  onTogglePin,
  onEdit,
  onDelete,
}: FacturaProps) {
  const isIncome = movement.type === 'ingreso';
  const label = labelOf(movement.category_id);
  const isVes = movement.entry_currency === 'VES';
  const rateText = formatRate(movement.rate_micros);
  const entryDetail = isVes
    ? `${formatBss(movement.entry_amount_cents)}${rateText ? ` @ ${rateText}` : ''}`
    : '';
  const spoken = `${label}, ${formatMoney(movement.amount_cents, 'USD')}${
    entryDetail ? `, ${entryDetail}` : ''
  }, ${formatDateDisplay(movement.date)}`;

  return (
    <article className={pinned ? 'fact pinned' : 'fact'}>
      <div className="fact-top">
        <span className="fact-no mono" aria-hidden="true">
          Nº {String(number).padStart(2, '0')}
        </span>
        <span className="fact-date mono">{formatDateDisplay(movement.date)}</span>
        <span className={isIncome ? 'fact-amt num income' : 'fact-amt num expense'}>
          {isIncome ? '+' : '-'}
          {formatMoney(movement.amount_cents, 'USD')}
        </span>
      </div>

      <div className="fact-body">
        <p className="fact-who">
          <span className="tag">{isIncome ? 'Ingreso' : 'Gasto'}</span>{' '}
          <span className="fact-cat">{label}</span>
          {movement.is_debt_payment && (
            <>
              {' '}
              <span className="tag">Pago de deuda</span>
            </>
          )}
        </p>
        <p className="fact-what">{accountNameOf(movement) || '—'}</p>
        <p className="fact-note">{movement.note || '—'}</p>
        {entryDetail ? <p className="pen">{entryDetail}</p> : null}
      </div>

      {movement.items.length > 0 ? (
        <ul className="fact-items">
          {movement.items.map((item, index) => (
            <li className="fact-item" key={index}>
              <span className="fact-item-desc">{item.description}</span>
              <span className="fact-item-amt mono">
                {isVes ? formatBss(item.amount_cents) : formatMoney(item.amount_cents, 'USD')}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="fact-acts">
        <button
          type="button"
          className="pinb"
          aria-label={`${pinned ? 'Soltar del tablero' : 'Fijar en el tablero'}: ${spoken}`}
          onClick={() => onTogglePin(movement)}
        >
          <PinIcon />
          <span>{pinned ? 'soltar' : 'fijar'}</span>
        </button>
        {!movement.is_debt_payment ? (
          <button
            type="button"
            className="linkb"
            aria-label={`Editar movimiento: ${spoken}`}
            onClick={() => onEdit(movement)}
          >
            editar
          </button>
        ) : (
          <span className="tag">desde carteras</span>
        )}
        <button
          type="button"
          className="linkb"
          aria-label={`Borrar movimiento: ${spoken}`}
          onClick={() => onDelete(movement)}
        >
          borrar
        </button>
      </div>
    </article>
  );
}

interface BoardProps {
  month: string;
  movements: Movement[];
  labelOf: (categoryId: string) => string;
  accountNameOf: (movement: Movement) => string;
  filter: string;
  onFilterChange: (value: string) => void;
  onEdit: (movement: Movement) => void;
  onDelete: (movement: Movement) => void;
  /** Id of the movement just written: its facturita gets one brief highlight. */
  flashId?: number | null;
}

/**
 * El tablero: the month's movements as facturitas, one per record, grouped into
 * ruled day blocks and laid out in a mosaic. Pinning lifts a facturita out of its
 * day into the strip at the top, where it stays while the rest is paged. The
 * search is general over every field of a facturita; the type and category
 * filters narrow it down further. Everything here is client-side presentation
 * over the month already loaded — no business figure is ever recomputed.
 */
export function Board({
  month,
  movements,
  labelOf,
  accountNameOf,
  filter,
  onFilterChange,
  onEdit,
  onDelete,
  flashId = null,
}: BoardProps) {
  const announce = useAnnounce();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [page, setPage] = useState(1);
  const [pins, togglePinId] = usePins(month);

  const filterOptions = useMemo(() => {
    const ids = Array.from(new Set(movements.map((movement) => movement.category_id)));
    ids.sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
    return ids;
  }, [movements, labelOf]);

  // If the current filter no longer exists in the month, fall back to "all".
  const activeFilter = filter !== 'all' && filterOptions.includes(filter) ? filter : 'all';

  const visible = useMemo(() => {
    const query = normalizeText(search.trim());
    const list = movements
      .filter((movement) => activeFilter === 'all' || movement.category_id === activeFilter)
      .filter((movement) => typeFilter === 'all' || movement.type === typeFilter)
      .filter((movement) => {
        if (query === '') return true;
        // General search: match ANY field a facturita shows, normalised so
        // accents and casing never get in the way. The amount is matched as its
        // decimal text ("250.00"), never as raw cents, so searching "250" cannot
        // match a $ 25 factura through its 2500 cents.
        const haystack = [
          formatDateDisplay(movement.date),
          dayLabel(movement.date),
          movement.date,
          movement.type,
          accountNameOf(movement),
          labelOf(movement.category_id),
          movement.note,
          formatMoney(movement.amount_cents, 'USD'),
          (movement.amount_cents / 100).toFixed(2),
          movement.entry_currency === 'VES' ? formatBss(movement.entry_amount_cents) : '',
          movement.entry_currency === 'VES' ? formatRate(movement.rate_micros) : '',
          ...movement.items.map((item) => item.description),
        ].join(' ');
        return normalizeText(haystack).includes(query);
      });
    return [...list].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [movements, activeFilter, typeFilter, search, labelOf, accountNameOf]);

  // The correlative number travels with the facturita, even once it is pinned.
  const numberOf = useMemo(
    () => new Map(visible.map((movement, index) => [movement.id, index + 1])),
    [visible],
  );

  // Pinning lifts the facturita out of its day; the mosaic holds the rest.
  const pinned = visible.filter((movement) => pins.includes(movement.id));
  const days = useMemo(
    () => groupByDay(visible.filter((movement) => !pins.includes(movement.id))),
    [visible, pins],
  );

  // A new search or filter always starts back at the first page.
  useEffect(() => {
    setPage(1);
  }, [search, activeFilter, typeFilter]);

  // When the result shrinks (month switch, deletion, pinning), clamp the page to
  // the last one that actually exists.
  useEffect(() => {
    setPage((current) => {
      const lastPage = Math.max(1, Math.ceil(days.length / DAYS_PER_PAGE));
      return current > lastPage ? lastPage : current;
    });
  }, [days.length]);

  const pageCount = Math.max(1, Math.ceil(days.length / DAYS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * DAYS_PER_PAGE;
  const pageDays = days.slice(pageStart, pageStart + DAYS_PER_PAGE);
  const total = visible.length;
  const emptyMessage =
    movements.length === 0
      ? 'Todavía no cargaste movimientos este mes.'
      : 'Ningún movimiento coincide con los filtros.';

  function handleTogglePin(movement: Movement) {
    const willPin = !pins.includes(movement.id);
    togglePinId(movement.id);
    const what = `la factura de ${labelOf(movement.category_id)} del ${formatDateDisplay(movement.date)}`;
    announce(willPin ? `Fijada ${what}.` : `Soltada ${what}.`);
  }

  function facturaProps(movement: Movement) {
    return {
      movement,
      number: numberOf.get(movement.id) ?? 0,
      labelOf,
      accountNameOf,
      pinned: pins.includes(movement.id),
      onTogglePin: handleTogglePin,
      onEdit,
      onDelete,
    };
  }

  return (
    <>
      <section className="pinned" aria-labelledby="pinned-title">
        <div className="sect">
          <h2 id="pinned-title">
            Fijadas <span className="mono">({pinned.length})</span>
          </h2>
          <span className="sect-note">El alfiler no las suelta cuando pasás la página</span>
        </div>

        {pinned.length === 0 ? (
          <p className="pin-empty">
            Todavía no fijaste ninguna factura. El alfiler de cada una la clava acá arriba.
          </p>
        ) : (
          <ul className="pin-row">
            {pinned.map((movement) => (
              <li key={movement.id} className={movement.id === flashId ? 'flash' : undefined}>
                <Factura {...facturaProps(movement)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="board-title">
        <div className="sect">
          <h2 id="board-title">
            El tablero · facturas del mes <span className="mono">({total})</span>
          </h2>
        </div>

        <div className="filters">
          <div className="field">
            <label htmlFor="board-search">Buscar</label>
            <input
              id="board-search"
              type="search"
              autoComplete="off"
              placeholder="Buscar en todo el tablero"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="board-type">Tipo</label>
            <select
              id="board-type"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
            >
              <option value="all">Todos</option>
              <option value="gasto">Gastos</option>
              <option value="ingreso">Ingresos</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="board-category">Filtrar por categoría</label>
            <select
              id="board-category"
              value={activeFilter}
              onChange={(event) => onFilterChange(event.target.value)}
            >
              <option value="all">Todas las categorías</option>
              {filterOptions.map((id) => (
                <option key={id} value={id}>
                  {labelOf(id)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {total === 0 ? (
          <div className="empty-state">
            <p>{emptyMessage}</p>
          </div>
        ) : (
          <>
            <ul className="mosaic" aria-label="Días del mes">
              {pageDays.map((group) => (
                <li className="day" key={group.date}>
                  <div className="day-head">
                    <h3 className="day-name">{dayLabel(group.date)}</h3>
                    <span className="day-count mono">
                      {group.movements.length}
                      {group.movements.length === 1 ? ' factura' : ' facturas'}
                    </span>
                  </div>
                  <ul className="tickets">
                    {group.movements.map((movement) => (
                      <li
                        key={movement.id}
                        className={movement.id === flashId ? 'flash' : undefined}
                      >
                        <Factura {...facturaProps(movement)} />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>

            <div className="pager">
              <span className="pager-state">
                Página {currentPage} de {pageCount}
              </span>
              <span className="pager-range">
                Tandas {pageStart + 1}–{Math.min(pageStart + DAYS_PER_PAGE, days.length)} de{' '}
                {days.length}
              </span>
              <div className="pages">
                <button
                  type="button"
                  className="pbtn"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage <= 1}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="pbtn"
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                  disabled={currentPage >= pageCount}
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
