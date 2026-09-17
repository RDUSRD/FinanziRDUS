import type { StatsSummary } from '../api/types';
import { formatMoney, formatPercent } from '../lib/money';
import { isFutureMonth } from '../lib/month';

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

export function KpiSummary({ summary, month }: { summary: StatsSummary; month: string }) {
  const negative = summary.balance_cents < 0;

  return (
    <section className="card" aria-labelledby="kpi-title">
      <h2 id="kpi-title">Resumen del mes</h2>
      <div className="grid grid-cols-1 gap-3 min-[521px]:grid-cols-3">
        <div className="kpi">
          <span className="kpi-label">Ingresos del mes</span>
          <span className="kpi-value num">{formatMoney(summary.income_cents, 'USD')}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Gastos del mes</span>
          <span className="kpi-value num">{formatMoney(summary.expenses_cents, 'USD')}</span>
        </div>
        <div className={negative ? 'kpi negative' : 'kpi'}>
          <span className="kpi-label">Te queda</span>
          <span className="kpi-value num">{formatMoney(summary.balance_cents, 'USD')}</span>
        </div>
      </div>
      <p className="comparison">{comparisonText(summary, month)}</p>
    </section>
  );
}
