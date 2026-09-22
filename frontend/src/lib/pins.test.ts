import { beforeEach, describe, expect, it } from 'vitest';
import { parsePins, pinsKey, readPins, togglePin, writePins } from './pins';

beforeEach(() => {
  window.localStorage.clear();
});

describe('parsePins', () => {
  it('returns an empty list for missing, malformed or non-array payloads', () => {
    expect(parsePins(null)).toEqual([]);
    expect(parsePins('')).toEqual([]);
    expect(parsePins('{')).toEqual([]);
    expect(parsePins('{"a":1}')).toEqual([]);
    expect(parsePins('"7"')).toEqual([]);
  });

  it('keeps whole numbers only', () => {
    expect(parsePins('[3,1,2]')).toEqual([3, 1, 2]);
    expect(parsePins('[3,"1",2.5,null,true]')).toEqual([3]);
  });
});

describe('togglePin', () => {
  it('appends an unpinned id and removes a pinned one', () => {
    expect(togglePin([], 4)).toEqual([4]);
    expect(togglePin([4, 9], 2)).toEqual([4, 9, 2]);
    expect(togglePin([4, 9, 2], 9)).toEqual([4, 2]);
  });
});

describe('readPins / writePins', () => {
  it('round-trips through localStorage, one list per month', () => {
    writePins('2026-09', [7, 3]);
    writePins('2026-10', [12]);

    expect(readPins('2026-09')).toEqual([7, 3]);
    expect(readPins('2026-10')).toEqual([12]);
    expect(readPins('2026-11')).toEqual([]);
    expect(window.localStorage.getItem(pinsKey('2026-09'))).toBe('[7,3]');
  });
});
