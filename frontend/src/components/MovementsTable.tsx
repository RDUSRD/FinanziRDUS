import { useMemo } from 'react';
import type { Movement } from '../api/types';
import { formatMoney } from '../lib/money';
import { formatDateDisplay } from '../lib/month';

interface MovementsTableProps {
  movements: Movement[];
  labelOf: (categoryId: string) => string;
  filter: string;
  onFilterChange: (value: string) => void;
  onEdit: (movement: Movement) => void;
  onDelete: (movement: Movement) => void;
}

export function MovementsTable({
  movements,
  labelOf,
  filter,
  onFilterChange,
  onEdit,
  onDelete,
}: MovementsTableProps) {
  const filterOptions = useMemo(() => {
    const ids = Array.from(new Set(movements.map((movement) => movement.category_id)));
    ids.sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
    return ids;
  }, [movements, labelOf]);

  // If the current filter no longer exists in the month, fall back to "all".
  const activeFilter = filter !== 'all' && filterOptions.includes(filter) ? filter : 'all';

  const visible = useMemo(() => {
    const list = activeFilter === 'all' ? movements : movements.filter((m) => m.category_id === activeFilter);
    return [...list].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [movements, activeFilter]);

  const emptyMessage =
    activeFilter !== 'all'
      ? 'No hay movimientos con esa categoría este mes.'
      : 'Todavía no cargaste movimientos este mes.';

  return (
    <section className="card" aria-labelledby="movements-title">
      <div className="movements-head">
        <h2 id="movements-title">
          Movimientos <span className="muted">({visible.length})</span>
        </h2>
        <div className="filter-field">
          <label htmlFor="filter-category">Filtrar por categoría</label>
          <select id="filter-category" value={activeFilter} onChange={(event) => onFilterChange(event.target.value)}>
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
        className="table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Tabla de movimientos del mes, con desplazamiento horizontal"
      >
        <table>
          <caption className="sr-only">Movimientos del mes seleccionado, ordenados por fecha descendente</caption>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Tipo</th>
              <th scope="col">Categoría</th>
              <th scope="col">Nota</th>
              <th scope="col" className="col-amount">
                Monto
              </th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visible.map((movement) => {
                const isIncome = movement.type === 'ingreso';
                const sign = isIncome ? '+' : '-';
                const label = labelOf(movement.category_id);
                const spoken = `${label}, ${formatMoney(movement.amount_cents)}, ${formatDateDisplay(movement.date)}`;
                return (
                  <tr key={movement.id}>
                    <td className="num">{formatDateDisplay(movement.date)}</td>
                    <td>
                      <span className={isIncome ? 'badge badge-ingreso' : 'badge'}>
                        {isIncome ? 'Ingreso' : 'Gasto'}
                      </span>
                    </td>
                    <td>{label}</td>
                    <td className="note-cell" title={movement.note || ''}>
                      {movement.note || '—'}
                    </td>
                    <td className={isIncome ? 'col-amount amount amount-income' : 'col-amount amount amount-gasto'}>
                      {sign}
                      {formatMoney(movement.amount_cents)}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          aria-label={`Editar movimiento: ${spoken}`}
                          onClick={() => onEdit(movement)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          aria-label={`Borrar movimiento: ${spoken}`}
                          onClick={() => onDelete(movement)}
                        >
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
