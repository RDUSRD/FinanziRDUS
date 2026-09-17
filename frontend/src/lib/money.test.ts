import { describe, expect, it } from 'vitest';
import { formatBss, formatMoney, formatPercent, formatRate, shortMoney, toCents } from './money';

/** Remove the non-breaking spaces Intl inserts so assertions are portable. */
function plain(text: string): string {
  return text.replace(/\u00a0/g, ' ');
}

describe('toCents', () => {
  it('parses es-AR decimal comma with dot thousands', () => {
    expect(toCents('1.234,56')).toBe(123456);
    expect(toCents('1.234,5')).toBe(123450);
  });

  it('parses US decimal dot with comma thousands', () => {
    expect(toCents('1234.56')).toBe(123456);
    expect(toCents('1,234.56')).toBe(123456);
  });

  it('reads pure three-digit groups as thousands', () => {
    expect(toCents('1.234')).toBe(123400);
    expect(toCents('1,234')).toBe(123400);
    expect(toCents('12,345')).toBe(1234500);
  });

  it('accepts decimal comma without grouping', () => {
    expect(toCents('1234,5')).toBe(123450);
    expect(toCents('0,99')).toBe(99);
  });

  it('rejects ambiguous input', () => {
    expect(Number.isNaN(toCents('1.234.56'))).toBe(true);
    expect(Number.isNaN(toCents('1,234,56'))).toBe(true);
  });

  it('rejects empty, letters and lone signs', () => {
    expect(Number.isNaN(toCents(''))).toBe(true);
    expect(Number.isNaN(toCents('   '))).toBe(true);
    expect(Number.isNaN(toCents('abc'))).toBe(true);
    expect(Number.isNaN(toCents('-'))).toBe(true);
    expect(Number.isNaN(toCents(null))).toBe(true);
    expect(Number.isNaN(toCents(undefined))).toBe(true);
  });

  it('handles integers, surrounding text and zero', () => {
    expect(toCents('0')).toBe(0);
    expect(toCents('45000')).toBe(4500000);
    expect(toCents('$1.234,56')).toBe(123456);
    expect(toCents(' 1.234,5 ')).toBe(123450);
  });
});

describe('formatMoney', () => {
  it('formats USD cents with es-VE grouping and the "$" prefix', () => {
    expect(plain(formatMoney(123456))).toBe('$ 1.234,56');
    expect(plain(formatMoney(1234 * 100))).toBe('$ 1.234');
    expect(plain(formatMoney(0))).toBe('$ 0');
  });

  it('formats VES céntimos with the "Bs" prefix and two decimals', () => {
    expect(plain(formatMoney(400000, 'VES'))).toBe('Bs 4.000,00');
    expect(plain(formatMoney(123456, 'VES'))).toBe('Bs 1.234,56');
    expect(plain(formatBss(400000))).toBe('Bs 4.000,00');
  });

  it('formats negatives with a leading minus before the symbol', () => {
    expect(plain(formatMoney(-5000000))).toBe('-$ 50.000');
    expect(plain(formatMoney(-400000, 'VES'))).toBe('-Bs 4.000,00');
  });

  it('coerces non-finite input to zero', () => {
    expect(plain(formatMoney(Number.NaN))).toBe('$ 0');
    expect(plain(formatMoney(Number.NaN, 'VES'))).toBe('Bs 0,00');
  });
});

describe('shortMoney', () => {
  it('abbreviates thousands and millions', () => {
    expect(shortMoney(85000 * 100)).toBe('$85k');
    expect(shortMoney(1_200_000 * 100)).toBe('$1,2M');
    expect(shortMoney(15_000_000 * 100)).toBe('$15M');
    expect(shortMoney(900 * 100)).toBe('$900');
  });

  it('uses the per-currency symbol for VES', () => {
    expect(shortMoney(4_000_000_000, 'VES')).toBe('Bs40M');
    expect(shortMoney(85000 * 100, 'VES')).toBe('Bs85k');
  });
});

describe('formatRate', () => {
  it('renders Bs-per-USD micros as a plain number', () => {
    expect(formatRate(40_000_000)).toBe('40');
    expect(formatRate(36_500_000)).toBe('36,5');
  });

  it('returns an empty string for missing or invalid rates', () => {
    expect(formatRate(null)).toBe('');
    expect(formatRate(undefined)).toBe('');
    expect(formatRate(0)).toBe('');
  });
});

describe('formatPercent', () => {
  it('formats fractions with up to one decimal by default', () => {
    expect(formatPercent(0.419)).toBe('41,9%');
    expect(formatPercent(0.42)).toBe('42%');
  });

  it('keeps values above 100% for exceeded budgets', () => {
    expect(formatPercent(1.104)).toBe('110,4%');
  });

  it('supports rounding to whole percents', () => {
    expect(formatPercent(0.806, 0)).toBe('81%');
  });
});
