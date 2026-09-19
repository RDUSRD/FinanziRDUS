import type { StatsByCategory } from '../api/types';
import { formatMoney, formatPercent, shortMoney } from '../lib/money';
import { DONUT, donutCircumference, donutSegments } from '../lib/chart';

/** The engraving is cut in the one ink token; only the slice family changes the opacity. */
const INK = 'var(--color-ink)';

/**
 * A single-family ramp of ink opacities (never a rainbow): the largest slice is
 * the darkest ink, the smallest the faintest. The geometry comes from
 * `donutSegments` unchanged.
 */
function inkRamp(n: number): number[] {
  if (!(n > 0)) return [];
  if (n === 1) return [0.92];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const alpha = 0.92 - t * (0.92 - 0.22);
    out.push(Number(alpha.toFixed(2)));
  }
  return out;
}

/** An engraved ring: the month's spending by category, cut in ink. */
export function DonutChart({ data }: { data: StatsByCategory }) {
  const { items, total_cents: totalCents } = data;
  const circumference = donutCircumference();
  const segments = donutSegments(items.map((item) => item.share));
  const ramp = inkRamp(items.length);

  const centerText = formatMoney(totalCents, 'USD');
  const centerValue = centerText.length > 9 ? shortMoney(totalCents, 'USD') : centerText;

  const ariaLabel =
    totalCents > 0
      ? `Gastos por categoría. Total ${centerText}. El detalle está en la lista que sigue.`
      : 'Sin gastos este mes.';

  // The engraved band's outer and inner edges, drawn as hairlines.
  const outerR = DONUT.r + DONUT.stroke / 2;
  const innerR = DONUT.r - DONUT.stroke / 2;

  return (
    <div className="chartbox">
      {items.length > 0 && (
        <p className="chartlead">
          El gasto del mes abierto por categoría: cada cuña es una categoría y su parte del total.
        </p>
      )}

      <svg
        className="donut"
        viewBox={`0 0 ${DONUT.viewBox} ${DONUT.viewBox}`}
        width={188}
        height={188}
        role="img"
        aria-label={ariaLabel}
      >
        <circle
          cx={DONUT.cx}
          cy={DONUT.cy}
          r={DONUT.r}
          fill="none"
          stroke={INK}
          strokeOpacity={totalCents > 0 ? 0.08 : 0.12}
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
                stroke={INK}
                strokeOpacity={ramp[index]}
                strokeWidth={DONUT.stroke}
                strokeDasharray={`${segment.length.toFixed(2)} ${(circumference - segment.length).toFixed(2)}`}
                strokeDashoffset={(-segment.offset).toFixed(2)}
                transform={`rotate(-90 ${DONUT.cx} ${DONUT.cy})`}
              />
            ) : null,
          )}
        <circle
          cx={DONUT.cx}
          cy={DONUT.cy}
          r={outerR}
          fill="none"
          stroke={INK}
          strokeOpacity={0.28}
          strokeWidth={1}
        />
        <circle
          cx={DONUT.cx}
          cy={DONUT.cy}
          r={innerR}
          fill="none"
          stroke={INK}
          strokeOpacity={0.28}
          strokeWidth={1}
        />
        <text
          className="mono"
          x={DONUT.cx}
          y={DONUT.cy - 8}
          textAnchor="middle"
          fontSize={11}
          letterSpacing={2}
          fill={INK}
          fillOpacity={0.72}
        >
          GASTOS
        </text>
        <text
          className="mono"
          x={DONUT.cx}
          y={DONUT.cy + 24}
          textAnchor="middle"
          fontSize={24}
          fontWeight={900}
          fill={INK}
        >
          {centerValue}
        </text>
      </svg>

      <ul className="list">
        {items.length === 0 ? (
          <li className="row">
            <span className="nm">Sin gastos este mes.</span>
          </li>
        ) : (
          items.map((item) => (
            <li className="row" key={item.category_id}>
              <span className="nm">{item.label}</span>
              <span>
                <span className="amt">{formatMoney(item.cents, 'USD')}</span>{' '}
                <span className="cap">{formatPercent(item.share)}</span>
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
