import type { Movement } from '../api/types';
import { CATEGORIES, type FakeDb } from './fakeServer';
import { formatMoney } from '../lib/money';

/** Current local month as "YYYY-MM" (mirrors lib/month.currentMonthKey). */
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** The month the app opens on when tests render it. */
export const MONTH = currentMonth();

/** "YYYY-MM" + day number -> "YYYY-MM-DD". */
export function day(month: string, value: number): string {
  return `${month}-${String(value).padStart(2, '0')}`;
}

/** Currency text uses NBSP; testing-library matches against a normalized space. */
export function money(cents: number): string {
  return formatMoney(cents).replace(/\u00a0/g, ' ');
}

/** The default fixture: five movements and two caps in the given month. */
export function buildSeed(month: string): Partial<FakeDb> {
  const movements: Movement[] = [
    { id: 1, type: 'gasto', category_id: 'supermercado', amount_cents: 8_500_000, date: day(month, 3), note: 'Compra', created_at: `${day(month, 3)}T10:00:00-03:00` },
    { id: 2, type: 'gasto', category_id: 'transporte', amount_cents: 4_200_000, date: day(month, 4), note: 'SUBE', created_at: `${day(month, 4)}T10:00:00-03:00` },
    { id: 3, type: 'gasto', category_id: 'alquiler-servicios', amount_cents: 32_000_000, date: day(month, 2), note: 'Alquiler', created_at: `${day(month, 2)}T10:00:00-03:00` },
    { id: 4, type: 'ingreso', category_id: 'sueldo', amount_cents: 120_000_000, date: day(month, 1), note: 'Sueldo', created_at: `${day(month, 1)}T10:00:00-03:00` },
    { id: 5, type: 'ingreso', category_id: 'freelance', amount_cents: 18_000_000, date: day(month, 5), note: 'Proyecto', created_at: `${day(month, 5)}T10:00:00-03:00` },
  ];
  return {
    categories: CATEGORIES,
    movements,
    budgets: { supermercado: 5_000_000, transporte: 5_000_000 },
    nextId: 6,
  };
}
