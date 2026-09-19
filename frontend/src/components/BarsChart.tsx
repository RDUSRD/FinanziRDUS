import type { MonthlyStat } from '../api/types';
import { formatMoney, shortMoney } from '../lib/money';
import { barsLayout } from '../lib/chart';
import { monthAbbr, monthFullLabel } from '../lib/month';

/** Bars and rules are printed in the one ink token; only the role changes the opacity. */
const INK = 'var(--color-ink)';
const SELECTED_OPACITY = 0.9;
const IDLE_OPACITY = 0.2;
const IDLE_STROKE_OPACITY = 0.42;
const RULE_OPACITY = 0.16;
const BASELINE_OPACITY = 0.5;
const LABEL_OPACITY = 0.72;

/**
 * Printed bars on one fixed scale over a single baseline: every month is drawn
 * against the same maximum, so the six columns compare at a glance on the same
 * floor. The month in view is in full ink, the rest lighter; the rules are
 * hairlines in ink. The sr-only table stays the navigable equivalent.
 */
export function BarsChart({ data, selectedMonth }: { data: MonthlyStat[]; selectedMonth: string }) {
  const values = data.map((entry) => entry.expenses_cents);
  const max = values.reduce((acc, value) => Math.max(acc, value), 0);

  if (max === 0) {
    return <p className="empty-state">Sin gastos registrados en los últimos 6 meses.</p>;
  }

  const selectedIndex = data.findIndex((entry) => entry.month === selectedMonth);
  const layout = barsLayout(values, { selectedIndex });
  const { rects, baseline, plotH, width, height, padL, padR, max: layoutMax } = layout;

  const gridFractions = [0, 0.5, 1];
  // Short label: the sr-only table below is the single navigable equivalent,
  // so the image name must NOT repeat the per-month data (mirrors the donut).
  const ariaLabel = 'Gastos de los últimos 6 meses.';

  return (
    <div className="chartbox">
      <p className="chartlead">
        Gastos de cada mes sobre una misma escala, para comparar de un vistazo. El mes que estás
        mirando va en tinta llena.
      </p>

      <div
        className="bars-scroll"
        tabIndex={0}
        role="region"
        aria-label="Gráfico de barras de los últimos 6 meses, con desplazamiento horizontal"
      >
        <svg
          className="bars"
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          role="img"
          preserveAspectRatio="xMidYMid meet"
          aria-label={ariaLabel}
        >
          {gridFractions.map((fraction) => {
            const y = baseline - fraction * plotH;
            const isBaseline = fraction === 0;
            return (
              <g key={fraction}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke={INK}
                  strokeOpacity={isBaseline ? BASELINE_OPACITY : RULE_OPACITY}
                  strokeWidth={1}
                />
                <text
                  className="mono"
                  x={padL - 6}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={12}
                  fill={INK}
                  fillOpacity={LABEL_OPACITY}
                >
                  {shortMoney(layoutMax * fraction, 'USD')}
                </text>
              </g>
            );
          })}

          {rects.map((rect, index) => {
            const centerX = rect.x + rect.width / 2;
            const entry = data[index];
            const previousYear = index > 0 ? data[index - 1].month.slice(0, 4) : null;
            const thisYear = entry.month.slice(0, 4);
            let monthText = monthAbbr(entry.month);
            if (index === 0 || previousYear !== thisYear) monthText += ` '${thisYear.slice(2)}`;

            return (
              <g key={entry.month}>
                <rect
                  x={rect.x}
                  y={rect.y}
                  width={rect.width}
                  height={rect.height}
                  fill={INK}
                  fillOpacity={rect.selected ? SELECTED_OPACITY : IDLE_OPACITY}
                  stroke={rect.selected ? 'none' : INK}
                  strokeOpacity={rect.selected ? undefined : IDLE_STROKE_OPACITY}
                  strokeWidth={rect.selected ? 0 : 1.5}
                />
                {rect.value > 0 && (
                  <text
                    className="mono"
                    x={centerX}
                    y={rect.y - 8}
                    textAnchor="middle"
                    fontSize={12}
                    fill={INK}
                    fillOpacity={rect.selected ? 1 : LABEL_OPACITY}
                  >
                    {shortMoney(rect.value, 'USD')}
                  </text>
                )}
                <text
                  className="mono"
                  x={centerX}
                  y={baseline + 22}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={rect.selected ? 700 : 400}
                  fill={INK}
                  fillOpacity={rect.selected ? 1 : LABEL_OPACITY}
                >
                  {monthText}
                </text>
                {rect.selected && (
                  <text
                    className="mono"
                    x={centerX}
                    y={baseline + 38}
                    textAnchor="middle"
                    fontSize={11}
                    fill={INK}
                    fillOpacity={LABEL_OPACITY}
                  >
                    este mes
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <table className="sr-only">
        <caption>Gastos e ingresos de los últimos 6 meses</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col">Gastos</th>
            <th scope="col">Ingresos</th>
          </tr>
        </thead>
        <tbody>
          {data.map((entry) => (
            <tr key={entry.month}>
              <th scope="row">{monthFullLabel(entry.month)}</th>
              <td>{formatMoney(entry.expenses_cents, 'USD')}</td>
              <td>{formatMoney(entry.income_cents, 'USD')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
