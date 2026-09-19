import { useEffect, useMemo, useState } from 'react';
import type { Movement } from '../api/types';
import { formatBss, formatMoney, formatRate } from '../lib/money';
import { formatDateDisplay } from '../lib/month';

type TypeFilter = 'all' | 'gasto' | 'ingreso';

/** Rows shown per ledger page. */
const PAGE_SIZE = 10;

/** Lowercase and strip diacritics so «alquiler» matches «Alquiler». */
function normalizeText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

interface MovementsTableProps {
  movements: Movement[];
  labelOf: (categoryId: string) => string;
  accountNameOf: (movement: Movement) => string;
  filter: string;
  onFilterChange: (value: string) => void;
  onEdit: (movement: Movement) => void;
  onDelete: (movement: Movement) => void;
  /** Id of the movement just written: its row gets one brief highlight. */
  flashId?: number | null;
}

/**
 * The ledger: the numbered line items of the month. Each row carries its line
 * number, the date, a structured description (category, wallet, note), the
 * amount in mono and its row actions. The search is general over every visible
 * field of a row; the category and type filters narrow it down further, and the
 * result is paged 10 rows at a time. Everything here is client-side presentation
 * over the month already loaded — no business figure is ever recomputed.
 */
export function MovementsTable({
  movements,
  labelOf,
  accountNameOf,
  filter,
  onFilterChange,
  onEdit,
  onDelete,
  flashId = null,
}: MovementsTableProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [page, setPage] = useState(1);

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
        // General search: match ANY field a row shows, normalised so accents
        // and casing never get in the way. The amount is matched as its decimal
        // text ("250.00"), never as raw cents, so searching "250" cannot match
        // a $ 25 row through its 2500 cents.
        const haystack = [
          formatDateDisplay(movement.date),
          movement.date,
          movement.type,
          accountNameOf(movement),
          labelOf(movement.category_id),
          movement.note,
          formatMoney(movement.amount_cents, 'USD'),
          (movement.amount_cents / 100).toFixed(2),
          movement.entry_currency === 'VES' ? formatBss(movement.entry_amount_cents) : '',
          movement.entry_currency === 'VES' ? formatRate(movement.rate_micros) : '',
        ].join(' ');
        return normalizeText(haystack).includes(query);
      });
    return [...list].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [movements, activeFilter, typeFilter, search, labelOf, accountNameOf]);

  // A new search or filter always starts back at the first page.
  useEffect(() => {
    setPage(1);
  }, [search, activeFilter, typeFilter]);

  // When the filtered result shrinks (month switch, deletion, filter), clamp
  // the page to the last one that actually exists.
  useEffect(() => {
    setPage((current) => {
      const lastPage = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
      return current > lastPage ? lastPage : current;
    });
  }, [visible.length]);

  const total = visible.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = visible.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeStart = total === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + PAGE_SIZE, total);

  const emptyMessage =
    movements.length === 0
      ? 'Todavía no cargaste movimientos este mes.'
      : 'Ningún movimiento coincide con los filtros.';

  return (
    <section aria-labelledby="movements-title">
      <div className="sect">
        <h2 id="movements-title">
          El libro · movimientos <span className="mono">({total})</span>
        </h2>
      </div>

      <div className="filters">
        <div className="field">
          <label htmlFor="ledger-search">Buscar</label>
          <input
            id="ledger-search"
            type="text"
            autoComplete="off"
            placeholder="Buscar en todo el libro"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="ledger-type">Tipo</label>
          <select
            id="ledger-type"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
          >
            <option value="all">Todos</option>
            <option value="gasto">Gastos</option>
            <option value="ingreso">Ingresos</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ledger-category">Filtrar por categoría</label>
          <select
            id="ledger-category"
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

      <div
        tabIndex={0}
        role="region"
        aria-label="Tabla del libro de movimientos, con desplazamiento horizontal"
        className="table-scroll"
      >
        <table className="book">
          <caption className="sr-only">
            Movimientos del mes seleccionado, ordenados por fecha descendente
          </caption>
          <thead>
            <tr>
              <th scope="col" className="ln-head" aria-hidden="true" />
              <th scope="col">Fecha</th>
              <th scope="col">Concepto</th>
              <th scope="col" className="right">
                Monto
              </th>
              <th scope="col" className="right">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-state">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pageRows.map((movement, index) => {
                const isIncome = movement.type === 'ingreso';
                const sign = isIncome ? '+' : '-';
                const label = labelOf(movement.category_id);
                const isVes = movement.entry_currency === 'VES';
                const rateText = formatRate(movement.rate_micros);
                // VES entries keep their original Bs amount + rate as secondary detail.
                const entryDetail = isVes
                  ? `${formatBss(movement.entry_amount_cents)}${rateText ? ` @ ${rateText}` : ''}`
                  : '';
                const spoken = `${label}, ${formatMoney(movement.amount_cents, 'USD')}${
                  entryDetail ? `, ${entryDetail}` : ''
                }, ${formatDateDisplay(movement.date)}`;
                return (
                  <tr key={movement.id} className={movement.id === flashId ? 'flash' : undefined}>
                    <td className="ln" aria-hidden="true">
                      {pageStart + index + 1}
                    </td>
                    <td className="num">{formatDateDisplay(movement.date)}</td>
                    <td className="desc">
                      <span className="who">
                        <span className="tag">{isIncome ? 'Ingreso' : 'Gasto'}</span>{' '}
                        <span>{label}</span>
                        {movement.is_debt_payment && (
                          <>
                            {' '}
                            <span className="tag">Pago de deuda</span>
                          </>
                        )}
                      </span>
                      <span className="what">{accountNameOf(movement)}</span>
                      <span className="note">{movement.note || '—'}</span>
                    </td>
                    <td className={isIncome ? 'amt right income' : 'amt right expense'}>
                      <span>
                        {sign}
                        {formatMoney(movement.amount_cents, 'USD')}
                      </span>
                      {entryDetail ? <span className="pen">{entryDetail}</span> : null}
                    </td>
                    <td className="acts">
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
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <span className="pager-state">
          Página {currentPage} de {pageCount}
        </span>
        <span className="pager-range">
          {rangeStart}–{rangeEnd} de {total}
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
    </section>
  );
}
