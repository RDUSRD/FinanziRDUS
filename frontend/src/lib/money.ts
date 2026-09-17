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

/** The app's canonical currency plus the bolívar entry currency. */
export type MoneyCurrency = 'USD' | 'VES';

/**
 * Explicit per-currency symbols. We never rely on the symbol the runtime ICU
 * data injects (it drifts across Node/browser builds), so the prefix is ours.
 */
const MONEY_SYMBOLS: Record<MoneyCurrency, string> = {
  USD: '$',
  VES: 'Bs',
};

/**
 * Grouping/decimals are locale-based ("es-VE": "." thousands, "," decimals).
 * USD is the canonical wallet and usually holds whole amounts, so the trailing
 * ",00" is dropped. The bolívar is quoted with its céntimos, which keeps the
 * Bs figure readable next to its USD equivalent.
 */
const MONEY_NUMBER_OPTIONS: Record<MoneyCurrency, Intl.NumberFormatOptions> = {
  USD: { minimumFractionDigits: 0, maximumFractionDigits: 2 },
  VES: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
};

const moneyFormatters = new Map<MoneyCurrency, Intl.NumberFormat>();

function getMoneyFormatter(currency: MoneyCurrency): Intl.NumberFormat {
  let formatter = moneyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('es-VE', MONEY_NUMBER_OPTIONS[currency]);
    moneyFormatters.set(currency, formatter);
  }
  return formatter;
}

/** Manual grouping fallback ("1.234,56") used when Intl is unavailable. */
function fallbackNumber(value: number, currency: MoneyCurrency): string {
  const fixed = (Math.round(Math.abs(value) * 100) / 100).toFixed(2);
  const [intPart, centsPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const body = currency === 'VES' || centsPart !== '00' ? `${grouped},${centsPart}` : grouped;
  return body;
}

/**
 * Format integer cents as a currency amount, e.g. "$ 1.234,56" or
 * "Bs 4.000,00". Negative values get a leading minus before the symbol.
 */
export function formatMoney(cents: number, currency: MoneyCurrency = 'USD'): string {
  const value = (Number(cents) || 0) / 100;
  const negative = value < 0;
  const symbol = MONEY_SYMBOLS[currency] ?? MONEY_SYMBOLS.USD;
  let body: string;
  try {
    body = getMoneyFormatter(currency).format(Math.abs(value));
  } catch {
    body = fallbackNumber(value, currency);
  }
  return `${negative ? '-' : ''}${symbol} ${body}`;
}

/** Format integer céntimos as bolívares. Shortcut for `formatMoney(cents, 'VES')`. */
export function formatBss(cents: number): string {
  return formatMoney(cents, 'VES');
}

/** Short money for chart labels, e.g. "$85k", "$1,2M", "Bs40M". */
export function shortMoney(cents: number, currency: MoneyCurrency = 'USD'): string {
  const value = Math.abs(Number(cents) || 0) / 100;
  let out: string;
  if (value >= 1_000_000) {
    out = `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace('.', ',')}M`;
  } else if (value >= 1000) {
    out = `${Math.round(value / 1000)}k`;
  } else {
    out = String(Math.round(value));
  }
  return `${MONEY_SYMBOLS[currency] ?? MONEY_SYMBOLS.USD}${out}`;
}

/**
 * Rate in "Bs per 1 USD" as a plain number. `rate_micros` is Bs/USD x 1e6, so
 * `40_000_000` renders as "40" and `36_500_000` as "36,5". Empty when absent.
 */
export function formatRate(rateMicros: number | null | undefined): string {
  if (!rateMicros || rateMicros <= 0) return '';
  const value = rateMicros / 1_000_000;
  return (Math.round(value * 100) / 100).toString().replace('.', ',');
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
      formatter = new Intl.NumberFormat('es-VE', {
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
