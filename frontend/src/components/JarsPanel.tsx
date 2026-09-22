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
  index: number;
  jars: Jar[];
  labelOf: (categoryId: string) => string;
  disabled: boolean;
  /** The one jar the plan is currently standing on (the step that is marked). */
  active: boolean;
  onAssign: (categoryId: string, jarId: string) => void;
}

function JarRow({ jar, index, jars, labelOf, disabled, active, onAssign }: JarRowProps) {
  const {
    label,
    pct,
    target_cents: targetCents,
    spent_cents: spentCents,
    remaining_cents: remainingCents,
    used,
    status,
    category_ids: categoryIds,
  } = jar;

  const widthPct = Math.min(100, Math.max(0, used * 100));
  const over = status === 'over';
  const warn = status === 'warn';
  const jarClass = `j${warn ? ' warn' : ''}${over ? ' over' : ''}`;
  const barClass = `wbar${over ? ' over' : warn ? ' warn' : ''}`;
  const hasTarget = targetCents > 0;

  const valueText = hasTarget
    ? `${label}: gastado ${formatMoney(spentCents, 'USD')} de objetivo ${formatMoney(targetCents, 'USD')}, ${formatPercent(used)}${
        over ? ', excedido' : ''
      }`
    : `${label}: sin ingreso asignado este mes`;

  return (
    <li className={jarClass} aria-current={active ? 'step' : undefined}>
      <span className="no">{index + 1}</span>
      <span className="nm">{label}</span>
      <span className="pc">{formatPercent(pct / 100, 0)}</span>

      <div
        className={barClass}
        role="progressbar"
        aria-label={`${label}: gasto del mes contra el objetivo del frasco`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(100, used * 100))}
        aria-valuetext={valueText}
      >
        <i style={{ width: `${widthPct.toFixed(1)}%` }} />
      </div>

      {/* The rest of the margin entry drops below the ruled span of the bar. */}
      <div className="jar-meta">
        <p className="hint">
          <span className="tag">{statusLabel(status)}</span>
        </p>

        <div className="jar-figs">
          <div className="jar-fig">
            <span className="lbl">Objetivo</span>
            <span className="mono">{formatMoney(targetCents, 'USD')}</span>
          </div>
          <div className="jar-fig">
            <span className="lbl">Gastado</span>
            <span className="mono">{formatMoney(spentCents, 'USD')}</span>
          </div>
          <div className="jar-fig">
            <span className="lbl">Restante</span>
            <span className="mono">{formatMoney(remainingCents, 'USD')}</span>
          </div>
        </div>

        {categoryIds.map((categoryId) => {
          const selectId = `jar-of-${categoryId}`;
          return (
            <div className="field" key={categoryId}>
              <label htmlFor={selectId}>
                <span className="sr-only">Frasco de </span>
                {labelOf(categoryId)}
              </label>
              <select
                id={selectId}
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
            </div>
          );
        })}
      </div>
    </li>
  );
}

/**
 * The 25/15/50/10 plan as the numbered margin column: one `<li class="j">` per
 * jar carrying its step number, name, target percentage and ruled progress bar,
 * then the status line, target/spent/remaining and the per-category reassignment
 * select inside its own field. `useAssignJar` and its error handling are
 * unchanged.
 */
export function JarsPanel({ data, labelOf, totalDebtCents = 0 }: JarsPanelProps) {
  const assignJar = useAssignJar();
  const [error, setError] = useState('');

  const hasIncome = data.income_cents > 0 && data.jars.length > 0;

  // The plan stands on a single step: the first jar that is exceeded, else the
  // first one merely near its target, else the plan's opening step. Every other
  // jar keeps its own state.
  const overIndex = data.jars.findIndex((jar) => jar.status === 'over');
  const warnIndex = data.jars.findIndex((jar) => jar.status === 'warn');
  const activeStep = overIndex >= 0 ? overIndex : warnIndex >= 0 ? warnIndex : 0;

  function handleAssign(categoryId: string, jarId: string) {
    setError('');
    assignJar.mutate(
      { categoryId, jarId },
      { onError: (mutationError) => setError(readableError(mutationError)) },
    );
  }

  return (
    <section aria-labelledby="jars-title">
      <div className="sect">
        <h2 id="jars-title">El plan 25/15/50/10</h2>
      </div>

      {totalDebtCents > 0 && (
        <div className="debtline">
          <strong>Tenés {formatMoney(totalDebtCents, 'USD')} de deuda.</strong>
          <span>Pagarla es la prioridad antes de asignar a los frascos.</span>
        </div>
      )}

      {hasIncome ? (
        <>
          <p className="chartlead">
            Ingreso del mes <b>{formatMoney(data.income_cents, 'USD')}</b> repartido en cuatro frascos.
            Reasigná una categoría para moverla de frasco.
          </p>
          <ul className="margin-col">
            {data.jars.map((jar, index) => (
              <JarRow
                key={jar.jar_id}
                jar={jar}
                index={index}
                jars={data.jars}
                labelOf={labelOf}
                disabled={assignJar.isPending}
                active={index === activeStep}
                onAssign={handleAssign}
              />
            ))}
          </ul>
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
