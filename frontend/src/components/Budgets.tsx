import { useEffect, useRef } from 'react';
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

function BudgetRow({
  item,
  onSet,
  onClear,
  busy,
}: {
  item: BudgetItem;
  onSet: (categoryId: string, capCents: number) => void;
  onClear: (categoryId: string) => void;
  busy: boolean;
}) {
  const { category_id: categoryId, label, cap_cents: capCents, spent_cents: spentCents, pct, status } = item;
  const hasCap = capCents > 0;
  const inputId = `budget-${categoryId}`;
  const widthPct = hasCap ? Math.min(100, pct * 100) : 0;
  const progressClass = status === 'warn' ? 'progress warn' : status === 'over' ? 'progress over' : 'progress';
  const statusClass = status === 'warn' || status === 'over' ? `b-status ${status}` : 'b-status';

  const inputRef = useRef<HTMLInputElement>(null);
  // After a commit the server value comes back as a new prop, which remounts the
  // input (its key is the cap); focus is restored once that settled render lands.
  const shouldRefocus = useRef(false);

  useEffect(() => {
    if (!shouldRefocus.current) return;
    shouldRefocus.current = false;
    inputRef.current?.focus();
  }, [capCents]);

  const valueText = hasCap
    ? `${label}: ${formatMoney(spentCents, 'USD')} de ${formatMoney(capCents, 'USD')}, ${formatPercent(pct)}${
        status === 'over' ? ', excedido' : ''
      }`
    : `${label}: ${formatMoney(spentCents, 'USD')}, sin tope definido`;

  const metaText = hasCap
    ? `${formatMoney(spentCents, 'USD')} de ${formatMoney(capCents, 'USD')} — ${formatPercent(pct)}`
    : `${formatMoney(spentCents, 'USD')} — sin tope`;

  function commit(raw: string) {
    const cents = toCents(raw);
    if (Number.isNaN(cents) || cents <= 0) {
      if (hasCap) {
        shouldRefocus.current = true;
        onClear(categoryId);
      } else {
        inputRef.current?.focus();
      }
      return;
    }
    if (cents === capCents) {
      inputRef.current?.focus();
      return;
    }
    shouldRefocus.current = true;
    onSet(categoryId, cents);
  }

  return (
    <div className="budget-row">
      <label htmlFor={inputId}>{label}</label>
      <input
        key={capCents}
        ref={inputRef}
        id={inputId}
        className="budget-input"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="sin tope"
        defaultValue={hasCap ? String(capCents / 100) : ''}
        disabled={busy}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <div
        className={progressClass}
        role="progressbar"
        aria-label={`${label}: gasto del mes contra el tope mensual`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(100, pct * 100))}
        aria-valuetext={valueText}
      >
        <span style={{ width: `${widthPct.toFixed(1)}%` }} />
      </div>
      <div className="budget-meta">
        <span className="num">{metaText}</span>
        <span className={statusClass}>{statusLabel(status)}</span>
      </div>
    </div>
  );
}

export function Budgets({ data, onSet, onClear, busy = false }: BudgetsProps) {
  return (
    <section className="card" aria-labelledby="budgets-title">
      <h2 id="budgets-title">Presupuestos por categoría</h2>
      <p className="hint-note">Tope mensual de gasto. Vacío significa sin tope.</p>
      <div>
        {data.items.map((item) => (
          <BudgetRow key={item.category_id} item={item} onSet={onSet} onClear={onClear} busy={busy} />
        ))}
      </div>
    </section>
  );
}
