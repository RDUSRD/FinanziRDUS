import { describe, expect, it } from 'vitest';
import {
  currentMonthKey,
  formatDateDisplay,
  isFutureMonth,
  isSameMonth,
  isValidDateStr,
  isValidMonthKey,
  monthAbbr,
  monthFullLabel,
  monthKeyOf,
  parseMonthKey,
  shiftMonth,
  todayStr,
} from './month';

describe('parseMonthKey', () => {
  it('parses valid keys', () => {
    expect(parseMonthKey('2026-09')).toEqual({ year: 2026, month: 9 });
  });

  it('rejects malformed keys', () => {
    expect(parseMonthKey('2026-13')).toBeNull();
    expect(parseMonthKey('2026-00')).toBeNull();
    expect(parseMonthKey('2026-1')).toBeNull();
    expect(parseMonthKey('26-09')).toBeNull();
    expect(parseMonthKey('abc')).toBeNull();
    expect(parseMonthKey('')).toBeNull();
  });

  it('exposes an isValidMonthKey helper', () => {
    expect(isValidMonthKey('2026-09')).toBe(true);
    expect(isValidMonthKey('2026-99')).toBe(false);
  });
});

describe('shiftMonth', () => {
  it('shifts backwards across a year boundary', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('shifts forwards across a year boundary', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });

  it('keeps the same month for delta 0', () => {
    expect(shiftMonth('2026-06', 0)).toBe('2026-06');
  });

  it('handles multi-month shifts used by the 6-month window', () => {
    expect(shiftMonth('2026-03', -6)).toBe('2025-09');
    expect(shiftMonth('2026-03', -1)).toBe('2026-02');
  });

  it('returns the input untouched when it is not a valid key', () => {
    expect(shiftMonth('nope', 3)).toBe('nope');
  });
});

describe('monthKeyOf / isSameMonth', () => {
  it('derives the month from a date string', () => {
    expect(monthKeyOf('2026-09-04')).toBe('2026-09');
  });

  it('compares dates and months', () => {
    expect(isSameMonth('2026-09-04', '2026-09')).toBe(true);
    expect(isSameMonth('2026-08-31', '2026-09')).toBe(false);
  });
});

describe('isValidDateStr', () => {
  it('accepts real calendar dates', () => {
    expect(isValidDateStr('2026-09-04')).toBe(true);
    expect(isValidDateStr('2024-02-29')).toBe(true);
    expect(isValidDateStr('2024-04-30')).toBe(true);
  });

  it('rejects impossible dates', () => {
    expect(isValidDateStr('2023-02-29')).toBe(false);
    expect(isValidDateStr('2024-13-01')).toBe(false);
    expect(isValidDateStr('2024-04-31')).toBe(false);
    expect(isValidDateStr('2024-00-10')).toBe(false);
    expect(isValidDateStr('04/09/2026')).toBe(false);
  });
});

describe('today helpers', () => {
  it('produces a zero-padded local date', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(currentMonthKey()).toMatch(/^\d{4}-\d{2}$/);
  });

  it('formats labels for display', () => {
    expect(monthFullLabel('2026-09')).toBe('septiembre 2026');
    expect(monthAbbr('2026-09')).toBe('sep');
    expect(formatDateDisplay('2026-09-04')).toBe('04/09/2026');
  });
});

describe('isFutureMonth', () => {
  it('compares against a reference month', () => {
    expect(isFutureMonth('2026-10', '2026-09')).toBe(true);
    expect(isFutureMonth('2026-09', '2026-09')).toBe(false);
    expect(isFutureMonth('2026-08', '2026-09')).toBe(false);
  });

  it('returns false for invalid input', () => {
    expect(isFutureMonth('bad', '2026-09')).toBe(false);
  });
});
