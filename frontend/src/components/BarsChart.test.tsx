import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BarsChart } from './BarsChart';
import { monthFullLabel } from '../lib/month';
import type { MonthlyStat } from '../api/types';

const DATA: MonthlyStat[] = [
  { month: '2026-04', expenses_cents: 10_000, income_cents: 0 },
  { month: '2026-05', expenses_cents: 20_000, income_cents: 0 },
  { month: '2026-06', expenses_cents: 30_000, income_cents: 0 },
  { month: '2026-07', expenses_cents: 40_000, income_cents: 0 },
  { month: '2026-08', expenses_cents: 50_000, income_cents: 0 },
  { month: '2026-09', expenses_cents: 60_000, income_cents: 0 },
];

// Intentionally NOT the tallest bar, to prove selection is by month, not value.
const SELECTED = '2026-07';

// The chart is printed with a single-family ink ramp driven by one token: the
// selected bar is the only full one (opacity .9), the rest are outlined (opacity .2).
const INK = 'var(--color-ink)';
const SELECTED_OPACITY = '0.9';
const IDLE_OPACITY = '0.2';

function renderChart(data: MonthlyStat[] = DATA, selectedMonth: string = SELECTED) {
  return render(<BarsChart data={data} selectedMonth={selectedMonth} />);
}

describe('BarsChart', () => {
  it('draws exactly one bar per month', () => {
    renderChart();
    const svg = screen.getByRole('img', { name: 'Gastos de los últimos 6 meses.' });
    expect(svg.querySelectorAll('rect')).toHaveLength(6);
  });

  it('highlights the selected month and tags it as the current one', () => {
    renderChart();
    const svg = screen.getByRole('img', { name: 'Gastos de los últimos 6 meses.' });
    const rects = Array.from(svg.querySelectorAll('rect'));

    // Every bar is the ink token; only the selected one is full (opacity .9).
    expect(rects.every((rect) => rect.getAttribute('fill') === INK)).toBe(true);
    const solid = rects.filter((rect) => rect.getAttribute('fill-opacity') === SELECTED_OPACITY);
    expect(solid).toHaveLength(1);
    expect(solid[0]).toBe(rects[3]);
    expect(rects.filter((rect) => rect.getAttribute('fill-opacity') === IDLE_OPACITY)).toHaveLength(5);

    // The current-month tag appears once, anchored to the selected month's label.
    expect(screen.getAllByText('este mes')).toHaveLength(1);
  });

  it('exposes a short image label and a single navigable table equivalent', () => {
    renderChart();
    const svg = screen.getByRole('img', { name: 'Gastos de los últimos 6 meses.' });
    // The image name must NOT repeat the per-month data (no currency text).
    expect(svg.getAttribute('aria-label')).toBe('Gastos de los últimos 6 meses.');
    expect(svg.getAttribute('aria-label')).not.toContain('$');

    const table = screen.getByRole('table', { name: 'Gastos e ingresos de los últimos 6 meses' });
    expect(within(table).getAllByRole('row')).toHaveLength(7); // header + 6 months
    for (const entry of DATA) {
      expect(within(table).getByRole('rowheader', { name: monthFullLabel(entry.month) })).toBeInTheDocument();
    }
  });

  it('shows an empty state instead of a chart when every month is zero', () => {
    renderChart(DATA.map((entry) => ({ ...entry, expenses_cents: 0 })));
    expect(screen.getByText('Sin gastos registrados en los últimos 6 meses.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
