/**
 * Month helpers.
 *
 * Months are plain "YYYY-MM" strings handled with integer arithmetic only.
 * `Date` is never built from a partial string and `toISOString` is never used
 * for business logic; only the local `getFullYear`/`getMonth`/`getDate` are
 * used to derive "today".
 */

export interface MonthParts {
  year: number;
  month: number;
}

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

const MONTHS_ABBR = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

/** Parse a "YYYY-MM" key. Returns `null` for anything invalid. */
export function parseMonthKey(key: string): MonthParts | null {
  if (typeof key !== 'string') return null;
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function isValidMonthKey(key: string): boolean {
  return parseMonthKey(key) !== null;
}

/** Shift a "YYYY-MM" key by `delta` months using integer arithmetic only. */
export function shiftMonth(key: string, delta: number): string {
  const parts = parseMonthKey(key);
  if (!parts) return key;
  const total = parts.year * 12 + (parts.month - 1) + delta;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12 + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" -> "YYYY-MM". */
export function monthKeyOf(dateStr: string): string {
  if (typeof dateStr !== 'string') return '';
  return dateStr.slice(0, 7);
}

export function isSameMonth(dateStr: string, monthKey: string): boolean {
  return monthKeyOf(dateStr) === monthKey;
}

/** Current local date as "YYYY-MM-DD" (no `new Date(string)`, no `toISOString`). */
export function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Current local month as "YYYY-MM". */
export function currentMonthKey(): string {
  return monthKeyOf(todayStr());
}

/** "2026-09" -> "septiembre 2026" (CSS capitalizes it where needed). */
export function monthFullLabel(key: string): string {
  const parts = parseMonthKey(key);
  if (!parts) return key;
  return `${MONTHS_ES[parts.month - 1]} ${parts.year}`;
}

/** "2026-09" -> "sep". */
export function monthAbbr(key: string): string {
  const parts = parseMonthKey(key);
  if (!parts) return key;
  return MONTHS_ABBR[parts.month - 1];
}

/**
 * True when `key` is strictly after `reference`. Zero-padded "YYYY-MM" keys
 * compare correctly with plain string ordering.
 */
export function isFutureMonth(key: string, reference: string = currentMonthKey()): boolean {
  if (!isValidMonthKey(key) || !isValidMonthKey(reference)) return false;
  return key > reference;
}

/** Validate a "YYYY-MM-DD" string against the real calendar (leap years included). */
export function isValidDateStr(s: string): boolean {
  if (typeof s !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= daysInMonth;
}

/** "2026-09-04" -> "04/09/2026". */
export function formatDateDisplay(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
