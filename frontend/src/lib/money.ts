/**
 * Money helpers.
 *
 * All amounts are integer cents across state and transport. Nothing here ever
 * produces a float amount: only parsing (raw text -> cents) and formatting
 * (cents -> locale string) live in this module.
 */

/**
 * Parse a user-typed amount into integer cents.
 *
 * Accepts es-AR ("1.234,56") and US ("1234.56") shapes. Groups of exactly three
 * digits separated by "." or "," are read as thousands separators ("1.234" and
 * "1,234" both mean 1234). Ambiguous input such as "1.234.56" is invalid.
 *
 * @returns the amount in integer cents, or `NaN` when the input is not valid.
 */
export function toCents(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return NaN;

  let s = String(raw).trim();
  if (s === '') return NaN;

  // Keep only digits, separators and a leading minus sign.
  s = s.replace(/[^0-9.,-]/g, '');
  if (s === '' || s === '-') return NaN;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // es-AR: "." groups thousands, "," is the decimal separator.
      s = s.replace(/\./g, '').replace(/,/g, '.');
    } else {
      // US: "," groups thousands, "." is the decimal separator.
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    if (/^-?\d{1,3}(,\d{3})+$/.test(s)) {
      // Pure thousands grouping.
      s = s.replace(/,/g, '');
    } else {
      // Decimal comma.
      s = s.replace(/,/g, '.');
    }
  } else if (hasDot) {
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
      // Pure thousands grouping.
      s = s.replace(/\./g, '');
    }
    // Otherwise the dot stays as the decimal separator.
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

const MONEY_FORMATTER_OPTIONS: Intl.NumberFormatOptions = {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
};

let moneyFormatter: Intl.NumberFormat | null = null;

function getMoneyFormatter(): Intl.NumberFormat {
  if (!moneyFormatter) moneyFormatter = new Intl.NumberFormat('es-AR', MONEY_FORMATTER_OPTIONS);
  return moneyFormatter;
}

function fallbackMoney(value: number): string {
  const negative = value < 0;
  const fixed = (Math.round(Math.abs(value) * 100) / 100).toFixed(2);
  const [intPart, centsPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const body = centsPart === '00' ? grouped : `${grouped},${centsPart}`;
  return `${negative ? '-' : ''}$${body}`;
}

/** Format integer cents as ARS currency using es-AR locale. */
export function formatMoney(cents: number): string {
  const value = (Number(cents) || 0) / 100;
  try {
    return getMoneyFormatter().format(value);
  } catch {
    return fallbackMoney(value);
  }
}

/** Short money for chart labels, e.g. "$85k", "$1,2M". */
export function shortMoney(cents: number): string {
  const value = Math.abs(Number(cents) || 0) / 100;
  let out: string;
  if (value >= 1_000_000) {
    out = `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace('.', ',')}M`;
  } else if (value >= 1000) {
    out = `${Math.round(value / 1000)}k`;
  } else {
    out = String(Math.round(value));
  }
  return `$${out}`;
}

const percentFormatters = new Map<number, Intl.NumberFormat>();

/**
 * Format a fraction (0..1) as a percentage with at most `maxFractionDigits`
 * decimals. Values above 1 are allowed (e.g. an exceeded budget -> "110,4%").
 */
export function formatPercent(fraction: number, maxFractionDigits = 1): string {
  const value = Number.isFinite(fraction) ? fraction : 0;
  try {
    let formatter = percentFormatters.get(maxFractionDigits);
    if (!formatter) {
      formatter = new Intl.NumberFormat('es-AR', {
        style: 'percent',
        maximumFractionDigits: maxFractionDigits,
      });
      percentFormatters.set(maxFractionDigits, formatter);
    }
    return formatter.format(value);
  } catch {
    return `${(value * 100).toFixed(maxFractionDigits)}%`;
  }
}
