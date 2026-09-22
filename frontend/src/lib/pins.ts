/**
 * El alfiler.
 *
 * Pinning a facturita to the top of the board is a property of this browser,
 * not of the record: the API contract is frozen and has no place to store it,
 * so the month's pinned ids live in `localStorage`, one list per month.
 */

const PIN_KEY_PREFIX = 'financirdus.pins.';

/** The storage key that holds one month's pinned ids. */
export function pinsKey(month: string): string {
  return `${PIN_KEY_PREFIX}${month}`;
}

/** Parse a stored payload into ids, discarding anything malformed. */
export function parsePins(raw: string | null | undefined): number[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((value): value is number => Number.isInteger(value));
}

/** Add the id, or remove it when it is already pinned. */
export function togglePin(pins: number[], id: number): number[] {
  return pins.includes(id) ? pins.filter((value) => value !== id) : [...pins, id];
}

/** The month's pinned ids. Empty when storage is unavailable or holds junk. */
export function readPins(month: string): number[] {
  try {
    return parsePins(window.localStorage.getItem(pinsKey(month)));
  } catch {
    return [];
  }
}

/** Persist the month's pinned ids; silently gives up when storage refuses. */
export function writePins(month: string, pins: number[]): void {
  try {
    window.localStorage.setItem(pinsKey(month), JSON.stringify(pins));
  } catch {
    // Private mode and quota errors are not worth interrupting the board for.
  }
}
