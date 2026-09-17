import { useState } from 'react';
import type { BudgetStatus, Jar, PlanResponse } from '../api/types';
import { useAssignJar } from '../api/queries';
import { readableError } from '../api/client';
import { formatMoney, formatPercent } from '../lib/money';

interface JarsPanelProps {
  data: PlanResponse;
  labelOf: (categoryId: string) => string;
  /** Outstanding debt across every wallet; when > 0 it is the month's priority. */
  totalDebtCents?: number;
}

function statusLabel(status: BudgetStatus): string {
  if (status === 'over') return 'excedido';
  if (status === 'warn') return 'cerca del objetivo';
  if (status === 'ok') return 'ok';
  return 'sin ingreso';
}

interface JarRowProps {
  jar: Jar;
  jars: Jar[];
  labelOf: (categoryId: string) => string;
  disabled: boolean;
  onAssign: (categoryId: string, jarId: string) => void;
}

function JarRow({ jar, jars, labelOf, disabled, onAssign }: JarRowProps) {
  const { label, pct, target_cents: targetCents, spent_cents: spentCents, remaining_cents: remainingCents, used, status, category_ids: categoryIds } = jar;

  const widthPct = Math.min(100, Math.max(0, used * 100));
  const progressClass = status === 'warn' ? 'progress warn' : status === 'over' ? 'progress over' : 'progress';
  const statusClass = status === 'warn' || status === 'over' ? `b-status ${status}` : 'b-status';
  const hasTarget = targetCents > 0;

  const valueText = hasTarget
    ? `${label}: gastado ${formatMoney(spentCents, 'USD')} de objetivo ${formatMoney(targetCents, 'USD')}, ${formatPercent(used)}${
        status === 'over' ? ', excedido' : ''
      }`
    : `${label}: sin ingreso asignado este mes`;

  return (
    <div className="jar-row">
      <div className="jar-head">
        <span className="jar-name">{label}</span>
        <span className="badge">{formatPercent(pct / 100, 0)}</span>
        <span className={statusClass}>{statusLabel(status)}</span>
      </div>
      <div
        className={progressClass}
        role="progressbar"
        aria-label={`${label}: gasto del mes contra el objetivo del frasco`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(100, used * 100))}
        aria-valuetext={valueText}
      >
        <span style={{ width: `${widthPct.toFixed(1)}%` }} />
      </div>
      <div className="jar-meta">
        <span className="num">Objetivo {formatMoney(targetCents, 'USD')}</span>
        <span className="num">Gastado {formatMoney(spentCents, 'USD')}</span>
        <span className="num">Restante {formatMoney(remainingCents, 'USD')}</span>
      </div>
      {categoryIds.length > 0 && (
        <ul className="jar-cats">
          {categoryIds.map((categoryId) => (
            <li key={categoryId}>
              <span className="jar-cat-name">{labelOf(categoryId)}</span>
              <select
                value={jar.jar_id}
                disabled={disabled}
                aria-label={`Frasco de ${labelOf(categoryId)}`}
                onChange={(event) => onAssign(categoryId, event.target.value)}
              >
                {jars.map((option) => (
                  <option key={option.jar_id} value={option.jar_id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function JarsPanel({ data, labelOf, totalDebtCents = 0 }: JarsPanelProps) {
  const assignJar = useAssignJar();
  const [error, setError] = useState('');

  const hasIncome = data.income_cents > 0 && data.jars.length > 0;

  function handleAssign(categoryId: string, jarId: string) {
    setError('');
    assignJar.mutate(
      { categoryId, jarId },
      { onError: (mutationError) => setError(readableError(mutationError)) },
    );
  }

  return (
    <section className="card" aria-labelledby="jars-title">
      <h2 id="jars-title">Plan 25/15/50/10</h2>
      {totalDebtCents > 0 && (
        <div className="debt-warning">
          <strong>Tenés {formatMoney(totalDebtCents, 'USD')} de deuda.</strong>
          <span>Pagarla es la prioridad antes de asignar a los frascos.</span>
        </div>
      )}
      {hasIncome ? (
        <>
          <p className="hint-note">
            Ingreso del mes {formatMoney(data.income_cents, 'USD')} repartido en cuatro frascos. Reasigná una
            categoría para moverla de frasco.
          </p>
          <div>
            {data.jars.map((jar) => (
              <JarRow
                key={jar.jar_id}
                jar={jar}
                jars={data.jars}
                labelOf={labelOf}
                disabled={assignJar.isPending}
                onAssign={handleAssign}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="empty-state">
          Sin ingresos este mes. Cargá un ingreso para repartir el plan 25/15/50/10.
        </p>
      )}
      {error && <p className="error-msg">{error}</p>}
    </section>
  );
}
