/**
 * Chart math (hand-written SVG, no chart library).
 *
 * This module holds the exact geometry of the donut and the bars, kept pure
 * and unit-tested so the rendering components only place the results.
 */

/* ------------------------------------------------------------------ *
 * Palette
 * ------------------------------------------------------------------ */

/**
 * Sequential single-hue palette. Hue is fixed at 188 (teal/cyan), lightness
 * goes from 86% (lightest, largest slice) down to 38% and saturation from
 * 72% down to 42%. `n === 1` returns the neutral single color; `n <= 0` -> [].
 */
export function paletteFor(n: number): string[] {
  if (!(n > 0)) return [];
  if (n === 1) return ['hsl(188 60% 60%)'];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); // 0..1
    const l = 86 - t * (86 - 38); // 86% -> 38%
    const s = 72 - t * (72 - 42); // 72% -> 42%
    out.push(`hsl(188 ${s.toFixed(0)}% ${l.toFixed(0)}%)`);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Donut
 * ------------------------------------------------------------------ */

export interface DonutConfig {
  viewBox: number;
  cx: number;
  cy: number;
  r: number;
  stroke: number;
}

export const DONUT: DonutConfig = {
  viewBox: 200,
  cx: 100,
  cy: 100,
  r: 68,
  stroke: 26,
};

export function donutCircumference(r: number = DONUT.r): number {
  return 2 * Math.PI * r;
}

export interface DonutSegment {
  /** Arc length in SVG user units (stroke-dasharray first value). */
  length: number;
  /** Cumulative offset of the segment start (stroke-dashoffset uses -offset). */
  offset: number;
}

export interface DonutOptions {
  r?: number;
  /** Gap reserved between slices; defaults to 2 when more than one slice. */
  gap?: number;
  /** Minimum visible arc length; defaults to 3. */
  minLength?: number;
}

/**
 * Compute arc lengths and offsets for a donut.
 *
 * `L_i = share_i > 0 ? max(minLength, share_i * C - gap) : 0`
 * If the total exceeds the circumference (many tiny minimum slices) every
 * length is rescaled proportionally so the arcs never overlap.
 */
export function donutSegments(shares: number[], options: DonutOptions = {}): DonutSegment[] {
  const r = options.r ?? DONUT.r;
  const circumference = 2 * Math.PI * r;
  const count = shares.length;
  const gap = options.gap ?? (count > 1 ? 2 : 0);
  const minLength = options.minLength ?? 3;

  const lengths = shares.map((share) =>
    share > 0 ? Math.max(minLength, share * circumference - gap) : 0,
  );

  const total = lengths.reduce((acc, value) => acc + value, 0);
  if (total > circumference && total > 0) {
    const scale = circumference / total;
    for (let i = 0; i < lengths.length; i++) lengths[i] *= scale;
  }

  const segments: DonutSegment[] = [];
  let offset = 0;
  for (const length of lengths) {
    segments.push({ length, offset });
    offset += length;
  }
  return segments;
}

/* ------------------------------------------------------------------ *
 * Bars
 * ------------------------------------------------------------------ */

export interface BarsConfig {
  width: number;
  height: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
}

export const BARS: BarsConfig = {
  width: 520,
  height: 260,
  padL: 46,
  padR: 10,
  padT: 30,
  padB: 46,
};

export interface BarRect {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
  selected: boolean;
}

export interface BarsLayout extends BarsConfig {
  plotW: number;
  plotH: number;
  baseline: number;
  slot: number;
  barW: number;
  max: number;
  scaleMax: number;
  rects: BarRect[];
}

export interface BarsOptions extends Partial<BarsConfig> {
  selectedIndex?: number;
  maxBarWidth?: number;
}

/**
 * Lay out vertical bars inside the given viewBox. Bar width is
 * `min(maxBarWidth, slot * 0.56)` and height is proportional to the largest
 * value (a value of 0 yields a 0-height rect).
 */
export function barsLayout(values: number[], options: BarsOptions = {}): BarsLayout {
  const width = options.width ?? BARS.width;
  const height = options.height ?? BARS.height;
  const padL = options.padL ?? BARS.padL;
  const padR = options.padR ?? BARS.padR;
  const padT = options.padT ?? BARS.padT;
  const padB = options.padB ?? BARS.padB;

  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const baseline = padT + plotH;
  const max = values.reduce((acc, value) => Math.max(acc, value), 0);
  const scaleMax = max > 0 ? max : 1;
  const count = values.length || 1;
  const slot = plotW / count;
  const barW = Math.min(options.maxBarWidth ?? 56, slot * 0.56);

  const rects: BarRect[] = values.map((value, index) => {
    const barHeight = (value / scaleMax) * plotH;
    const x = padL + index * slot + (slot - barW) / 2;
    const y = baseline - barHeight;
    return {
      index,
      x,
      y,
      width: barW,
      height: barHeight,
      value,
      selected: index === options.selectedIndex,
    };
  });

  return { width, height, padL, padR, padT, padB, plotW, plotH, baseline, slot, barW, max, scaleMax, rects };
}

/** Fill color for a bar: the selected month stands out. */
export function barColor(selected: boolean): string {
  return selected ? 'hsl(188 62% 58%)' : 'hsl(188 38% 40%)';
}

/** Outline color for the selected bar (empty string when not selected). */
export function barStroke(selected: boolean): string {
  return selected ? 'hsl(188 75% 70%)' : 'none';
}
