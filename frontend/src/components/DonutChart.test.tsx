import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DonutChart } from './DonutChart';
import { donutCircumference } from '../lib/chart';
import { money } from '../test/seed';
import type { StatsByCategory } from '../api/types';

const DATA: StatsByCategory = {
  month: '2026-09',
  total_cents: 100_000,
  items: [
    { category_id: 'supermercado', label: 'Supermercado', cents: 50_000, share: 0.5 },
    { category_id: 'transporte', label: 'Transporte', cents: 30_000, share: 0.3 },
    { category_id: 'ocio', label: 'Ocio', cents: 20_000, share: 0.2 },
  ],
};

/** The arc circles are the ones with a dasharray (the background ring has none). */
function arcs(): SVGCircleElement[] {
  const svg = screen.getByRole('img');
  return Array.from(svg.querySelectorAll('circle')).filter((circle) =>
    circle.hasAttribute('stroke-dasharray'),
  ) as SVGCircleElement[];
}

function arcLength(arc: SVGCircleElement): number {
  return Number(arc.getAttribute('stroke-dasharray')?.split(' ')[0] ?? '0');
}

function arcOffset(arc: SVGCircleElement): number {
  return -Number(arc.getAttribute('stroke-dashoffset') ?? '0');
}

describe('DonutChart', () => {
  it('draws one arc per slice', () => {
    render(<DonutChart data={DATA} />);
    expect(arcs()).toHaveLength(DATA.items.length);
  });

  it('lays the arcs contiguously without overlaps', () => {
    render(<DonutChart data={DATA} />);
    const circumference = donutCircumference();
    let cumulative = 0;
    for (const arc of arcs()) {
      expect(arcOffset(arc)).toBeCloseTo(cumulative, 1);
      expect(arcLength(arc)).toBeGreaterThan(0);
      cumulative += arcLength(arc);
    }
    // Contiguous arcs together span the ring minus the 2-unit gaps between slices.
    expect(cumulative).toBeLessThanOrEqual(circumference + 0.01);
    expect(cumulative).toBeCloseTo(circumference - DATA.items.length * 2, 1);
  });

  it('shows a center total equal to the sum of the legend', () => {
    render(<DonutChart data={DATA} />);
    const total = DATA.items.reduce((acc, item) => acc + item.cents, 0);
    expect(screen.getByText(money(total))).toBeInTheDocument();
    for (const item of DATA.items) {
      expect(screen.getByText(money(item.cents))).toBeInTheDocument();
    }
  });

  it('never draws a zero-length arc when the share is > 0', () => {
    const tiny: StatsByCategory = {
      month: '2026-09',
      total_cents: 100_000,
      items: [
        { category_id: 'a', label: 'A', cents: 99_900, share: 0.999 },
        { category_id: 'b', label: 'B', cents: 100, share: 0.001 },
        { category_id: 'c', label: 'C', cents: 0, share: 0 },
      ],
    };
    render(<DonutChart data={tiny} />);
    const rendered = arcs();
    expect(rendered).toHaveLength(2); // the zero-share slice draws nothing
    for (const arc of rendered) expect(arcLength(arc)).toBeGreaterThan(0);
  });

  it('falls back to the empty state when the total is zero', () => {
    render(<DonutChart data={{ month: '2026-09', total_cents: 0, items: [] }} />);
    expect(screen.getByRole('img', { name: 'Sin gastos este mes.' })).toBeInTheDocument();
    expect(screen.getByText('Sin gastos este mes.')).toBeInTheDocument();
    expect(arcs()).toHaveLength(0);
  });
});
