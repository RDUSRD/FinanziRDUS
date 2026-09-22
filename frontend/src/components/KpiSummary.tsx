import type { StatsSummary } from '../api/types';
import { formatMoney, formatPercent } from '../lib/money';
import { isFutureMonth } from '../lib/month';

interface KpiSummaryProps {
  summary: StatsSummary;
  month: string;
  /** Outstanding debt across every wallet; when > 0 it is the month's priority. */
  totalDebtCents?: number;
  /** Bumped by App after a save or a month change: replays the ink-dry wipe. */
  repaintKey?: number;
}

function comparisonText(summary: StatsSummary, month: string): string {
  if (summary.expenses_cents === 0) {
    return isFutureMonth(month)
      ? 'Mes futuro: todavía no hay gastos para comparar con los meses anteriores.'
      : 'Sin gastos este mes para comparar con los meses anteriores.';
  }

  if (summary.comparison.direction === 'na') {
    return 'Sin historial suficiente para comparar con los meses anteriores.';
  }

  const months = summary.average_prev.months_used;
  const monthWord = months === 1 ? 'mes' : 'meses';
  const suffix = `(promedio: ${formatMoney(summary.average_prev.avg_cents, 'USD')}, basado en ${months} ${monthWord}).`;

  if (summary.comparison.direction === 'equal') {
    return `Este mes gastaste lo mismo que el promedio de los 6 meses anteriores ${suffix}`;
  }

  const direction = summary.comparison.direction === 'above' ? 'más' : 'menos';
  // `comparison.pct` is signed; the phrase already carries the direction.
  return `Este mes gastaste ${formatPercent(Math.abs(summary.comparison.pct))} ${direction} que el promedio de los 6 meses anteriores ${suffix}`;
}

/**
 * The month's three figures, printed as one subtotal band: each `.sub-line`
 * carries its label, a dot leader and its value; the closing figure takes
 * `.sub-line total` and turns red through `.neg` when the month closes negative.
 * `repaintKey` is the only authored motion — it remounts each value span so the
 * ink-dry wipe replays.
 */
export function KpiSummary({
  summary,
  month,
  totalDebtCents = 0,
  repaintKey = 0,
}: KpiSummaryProps) {
  const negative = summary.balance_cents < 0;

  return (
    <section aria-labelledby="subtotals-title">
      <div className="sect">
        <h2 id="subtotals-title">Los números del mes</h2>
      </div>

      <div className="subtotals">
        <div className="sub-line">
          <span className="lab">Ingresos</span>
          <span className="val num repaint" key={repaintKey}>
            {formatMoney(summary.income_cents, 'USD')}
          </span>
        </div>
        <div className="sub-line">
          <span className="lab">Gastos</span>
          <span className="val num repaint" key={repaintKey}>
            {formatMoney(summary.expenses_cents, 'USD')}
          </span>
        </div>
        <div className={negative ? 'sub-line total neg' : 'sub-line total'}>
          <span className="lab">Te queda</span>
          <span className="val num repaint" key={repaintKey}>
            {formatMoney(summary.balance_cents, 'USD')}
          </span>
        </div>
      </div>

      <p className="legend-note">Los gastos incluyen los pagos de deuda.</p>

      {totalDebtCents > 0 && (
        <p className="compare debtline">
          Deuda pendiente {formatMoney(totalDebtCents, 'USD')}: pagarla es la prioridad antes de
          repartir los frascos.
        </p>
      )}

      <p className="compare">{comparisonText(summary, month)}</p>
    </section>
  );
}
