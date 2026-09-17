import type { MonthlyStat } from '../api/types';
import { formatMoney, shortMoney } from '../lib/money';
import { barColor, barStroke, barsLayout } from '../lib/chart';
import { monthAbbr, monthFullLabel } from '../lib/month';

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
    <>
      <div
        className="bars-host"
        tabIndex={0}
        role="region"
        aria-label="Gráfico de barras de los últimos 6 meses, con desplazamiento horizontal"
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          role="img"
          preserveAspectRatio="xMidYMid meet"
          aria-label={ariaLabel}
        >
          {gridFractions.map((fraction) => {
            const y = baseline - fraction * plotH;
            return (
              <g key={fraction}>
                <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="rgba(255,255,255,.07)" strokeWidth={1} />
                <text x={padL - 6} y={y + 4} textAnchor="end" fontSize={13} fill="#98a2b3">
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
                {rect.height > 0 && (
                  <rect
                    x={rect.x}
                    y={rect.y}
                    width={rect.width}
                    height={rect.height}
                    rx={6}
                    ry={6}
                    fill={barColor(rect.selected)}
                    stroke={barStroke(rect.selected)}
                    strokeWidth={rect.selected ? 1.5 : 0}
                  />
                )}
                {rect.value > 0 && (
                  <text
                    x={centerX}
                    y={rect.y - 8}
                    textAnchor="middle"
                    fontSize={14}
                    fill={rect.selected ? '#e6e9ee' : '#98a2b3'}
                  >
                    {shortMoney(rect.value, 'USD')}
                  </text>
                )}
                <text
                  x={centerX}
                  y={baseline + 22}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight={rect.selected ? 700 : 400}
                  fill={rect.selected ? '#e6e9ee' : '#98a2b3'}
                >
                  {monthText}
                </text>
                {rect.selected && (
                  <text x={centerX} y={baseline + 38} textAnchor="middle" fontSize={12} fill="hsl(188 68% 62%)">
                    actual
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
    </>
  );
}
