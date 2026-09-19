import { useEffect, useState } from 'react';
import type { BudgetItem, BudgetsResponse } from '../api/types';
import { formatMoney, formatPercent, toCents } from '../lib/money';

interface BudgetsProps {
  data: BudgetsResponse;
  onSet: (categoryId: string, capCents: number) => void;
  onClear: (categoryId: string) => void;
  busy?: boolean;
}

function statusLabel(status: BudgetItem['status']): string {
  if (status === 'over') return 'excedido';
  if (status === 'warn') return 'cerca del tope';
  if (status === 'ok') return 'ok';
  return 'sin tope';
}

interface BudgetRowProps {
  item: BudgetItem;
  onSet: (categoryId: string, capCents: number) => void;
  onClear: (categoryId: string) => void;
  busy: boolean;
}

function BudgetRow({ item, onSet, onClear, busy }: BudgetRowProps) {
  const { category_id: categoryId, label, cap_cents: capCents, spent_cents: spentCents, pct, status } = item;
  const hasCap = capCents > 0;
  const inputId = `budget-${categoryId}`;
  const widthPct = hasCap ? Math.min(100, pct * 100) : 0;
  const over = status === 'over';
  const warn = status === 'warn';
  const rowClass = `row${warn ? ' warn' : ''}${over ? ' over' : ''}`;
  // The cap is the row's own number: a highlighter stroke rests behind it from
  // 80%, and once exceeded it is struck so the spent can be written again red.
  const capTone = over ? 'struck' : warn ? 'mark' : undefined;

  // The cap is a controlled field with its own draft text: it never remounts,
  // so blur never needs to steal focus back and nothing can recapture it.
  const [draft, setDraft] = useState(() => (hasCap ? String(capCents / 100) : ''));

  // Resync the draft only when the server value changes from the outside; a
  // commit that already matches the draft keeps the user's own text.
  useEffect(() => {
    setDraft((current) => (toCents(current) === capCents ? current : capCents > 0 ? String(capCents / 100) : ''));
  }, [capCents]);

  const valueText = hasCap
    ? `${label}: ${formatMoney(spentCents, 'USD')} de ${formatMoney(capCents, 'USD')}, ${formatPercent(pct)}${
        over ? ', excedido' : ''
      }`
    : `${label}: ${formatMoney(spentCents, 'USD')}, sin tope definido`;

  function commit(raw: string) {
    const cents = toCents(raw);
    if (Number.isNaN(cents) || cents <= 0) {
      // Empty/invalid: only a row that actually carries a cap is cleared.
      if (hasCap) onClear(categoryId);
      return;
    }
    if (cents === capCents) return;
    onSet(categoryId, cents);
  }

  return (
    <div className={rowClass}>
      <label className="nm" htmlFor={inputId}>
        {label}
      </label>

      <span className={over ? 'amt fix' : 'amt'}>{formatMoney(spentCents, 'USD')}</span>

      <div
        className="bar"
        role="progressbar"
        aria-label={`${label}: gasto del mes contra el tope mensual`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(100, pct * 100))}
        aria-valuetext={valueText}
      >
        <i style={{ width: `${widthPct.toFixed(1)}%` }} />
      </div>

      <span className="cap">
        <span className={capTone}>
          <input
            id={inputId}
            className="capfield"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="sin tope"
            value={draft}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => commit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        </span>
        <span aria-hidden="true"> tope</span>
      </span>

      <span className="sr-only">{statusLabel(status)}</span>
    </div>
  );
}

/**
 * The concepts list: each row is a category's name, the spent figure and the
 * editable cap, over the ruled progress bar. A cap at or above 80% carries the
 * highlighter behind its number; an exceeded cap is struck and its spent figure
 * is rewritten red, with the 45° stripe on that row alone. The inline cap edit
 * stays a controlled field that keeps its own draft text: it commits on
 * blur/Enter, clears when emptied (only when a cap exists) and never moves
 * focus on its own, so Tab and a click elsewhere always leave the field.
 */
export function Budgets({ data, onSet, onClear, busy = false }: BudgetsProps) {
  return (
    <section aria-labelledby="budgets-title">
      <div className="sect">
        <h2 id="budgets-title">La lista · tope y gastado</h2>
      </div>

      <div className="list">
        {data.items.map((item) => (
          <BudgetRow key={item.category_id} item={item} onSet={onSet} onClear={onClear} busy={busy} />
        ))}
      </div>

      <p className="legend-note">
        El tope tachado y el precio reescrito en rojo marcan lo que se pasó de la raya. La franja a
        45° es sólo para el tope excedido.
      </p>
    </section>
  );
}
