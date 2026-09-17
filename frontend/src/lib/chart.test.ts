import { describe, expect, it } from 'vitest';
import {
  BARS,
  barColor,
  barStroke,
  barsLayout,
  DONUT,
  donutSegments,
  paletteFor,
} from './chart';

const close = (a: number, b: number, epsilon = 1e-6) => Math.abs(a - b) <= epsilon;

describe('paletteFor', () => {
  it('returns an empty palette for n <= 0', () => {
    expect(paletteFor(0)).toEqual([]);
    expect(paletteFor(-3)).toEqual([]);
  });

  it('returns the neutral single color for n === 1', () => {
    expect(paletteFor(1)).toEqual(['hsl(188 60% 60%)']);
  });

  it('stays on a single hue and yields distinct colors', () => {
    const palette = paletteFor(6);
    expect(palette).toHaveLength(6);
    expect(new Set(palette).size).toBe(6);
    for (const color of palette) expect(color.startsWith('hsl(188 ')).toBe(true);
  });

  it('goes from lightest to darkest', () => {
    const palette = paletteFor(3);
    const lightness = palette.map((c) => Number(/hsl\(188 \d+% (\d+)%\)/.exec(c)?.[1] ?? '0'));
    expect(lightness[0]).toBeGreaterThan(lightness[1]);
    expect(lightness[1]).toBeGreaterThan(lightness[2]);
  });
});

describe('donutSegments', () => {
  it('renders a single full ring with no gap', () => {
    const circumference = 2 * Math.PI * DONUT.r;
    const [seg] = donutSegments([1]);
    expect(seg.length).toBeCloseTo(circumference, 4);
    expect(seg.offset).toBe(0);
  });

  it('produces contiguous arcs without overlaps', () => {
    const segments = donutSegments([0.5, 0.3, 0.2]);
    for (let i = 1; i < segments.length; i++) {
      expect(close(segments[i].offset, segments[i - 1].offset + segments[i - 1].length)).toBe(true);
    }
    const circumference = 2 * Math.PI * DONUT.r;
    const last = segments[segments.length - 1];
    expect(last.offset + last.length).toBeLessThanOrEqual(circumference + 1e-6);
  });

  it('never yields a zero length when share > 0 (minimum visible)', () => {
    const segments = donutSegments([0.99, 0.001, 0]);
    expect(segments[0].length).toBeGreaterThan(0);
    expect(segments[1].length).toBeGreaterThanOrEqual(3);
    expect(segments[2].length).toBe(0);
  });

  it('rescales proportionally when the sum exceeds the circumference', () => {
    const many = Array.from({ length: 200 }, () => 1 / 200);
    const segments = donutSegments(many);
    const circumference = 2 * Math.PI * DONUT.r;
    const total = segments.reduce((acc, seg) => acc + seg.length, 0);
    expect(total).toBeLessThanOrEqual(circumference + 1e-6);
    expect(total).toBeCloseTo(circumference, 4);
  });
});

describe('barsLayout', () => {
  const values = [100, 200, 300, 0, 150, 250];

  it('creates one rect per value', () => {
    const layout = barsLayout(values);
    expect(layout.rects).toHaveLength(values.length);
    expect(layout.max).toBe(300);
  });

  it('scales the tallest bar to the plot height and zero to nothing', () => {
    const layout = barsLayout(values);
    const tallest = layout.rects[2];
    expect(tallest.height).toBeCloseTo(layout.plotH, 6);
    expect(layout.rects[3].height).toBe(0);
  });

  it('keeps the baseline at padT + plotH and spaces bars by slot', () => {
    const layout = barsLayout(values);
    expect(layout.baseline).toBeCloseTo(BARS.padT + layout.plotH, 6);
    const dx = layout.rects[1].x - layout.rects[0].x;
    const dx2 = layout.rects[2].x - layout.rects[1].x;
    expect(close(dx, dx2)).toBe(true);
    expect(close(dx, layout.slot)).toBe(true);
  });

  it('flags the selected month and colors it differently', () => {
    const layout = barsLayout(values, { selectedIndex: 4 });
    expect(layout.rects[4].selected).toBe(true);
    expect(layout.rects.filter((r) => r.selected)).toHaveLength(1);
    expect(barColor(true)).not.toBe(barColor(false));
    expect(barStroke(true)).not.toBe('none');
    expect(barStroke(false)).toBe('none');
  });

  it('never divides by zero when every value is zero', () => {
    const layout = barsLayout([0, 0, 0]);
    expect(layout.scaleMax).toBe(1);
    for (const rect of layout.rects) expect(rect.height).toBe(0);
  });
});
