import type { StatsByCategory } from '../api/types';
import { formatMoney, formatPercent, shortMoney } from '../lib/money';
import { DONUT, donutSegments, paletteFor } from '../lib/chart';

export function DonutChart({ data }: { data: StatsByCategory }) {
  const { items, total_cents: totalCents } = data;
  const palette = paletteFor(items.length);
  const segments = donutSegments(items.map((item) => item.share));
  const circumference = 2 * Math.PI * DONUT.r;

  const centerText = formatMoney(totalCents, 'USD');
  const centerValue = centerText.length > 9 ? shortMoney(totalCents, 'USD') : centerText;

  const ariaLabel =
    totalCents > 0
      ? `Gastos por categoría. Total ${formatMoney(totalCents, 'USD')}. El detalle está en la lista que sigue.`
      : 'Sin gastos este mes.';

  return (
    <div className="flex flex-wrap items-center gap-[18px]">
      <div className="flex-none">
        <svg
          viewBox={`0 0 ${DONUT.viewBox} ${DONUT.viewBox}`}
          width={190}
          height={190}
          role="img"
          aria-label={ariaLabel}
          className="donut-svg"
        >
          <circle
            cx={DONUT.cx}
            cy={DONUT.cy}
            r={DONUT.r}
            fill="none"
            stroke={totalCents > 0 ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.12)'}
            strokeWidth={DONUT.stroke}
          />
          {totalCents > 0 &&
            segments.map((segment, index) =>
              segment.length > 0 ? (
                <circle
                  key={items[index].category_id}
                  cx={DONUT.cx}
                  cy={DONUT.cy}
                  r={DONUT.r}
                  fill="none"
                  stroke={palette[index]}
                  strokeWidth={DONUT.stroke}
                  strokeDasharray={`${segment.length.toFixed(2)} ${(circumference - segment.length).toFixed(2)}`}
                  strokeDashoffset={(-segment.offset).toFixed(2)}
                  transform={`rotate(-90 ${DONUT.cx} ${DONUT.cy})`}
                />
              ) : null,
            )}
          <text
            x={DONUT.cx}
            y={DONUT.cy - 6}
            textAnchor="middle"
            fontSize={14}
            className="donut-center-label"
          >
            Gastos
          </text>
          <text
            x={DONUT.cx}
            y={DONUT.cy + 20}
            textAnchor="middle"
            fontSize={22}
            fontWeight={700}
            className="donut-center-value"
          >
            {centerValue}
          </text>
        </svg>
      </div>

      <ul className="legend">
        {items.length === 0 ? (
          <li className="muted">Sin gastos este mes.</li>
        ) : (
          items.map((item, index) => (
            <li key={item.category_id}>
              <span className="dot" aria-hidden="true" style={{ background: palette[index] }} />
              <span className="lg-name">{item.label}</span>
              <span className="lg-amt num">{formatMoney(item.cents, 'USD')}</span>
              <span className="lg-pct num">{formatPercent(item.share)}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
