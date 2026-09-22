import type { Movement } from '../api/types';
import { CATEGORIES, DEFAULT_ACCOUNTS, type FakeDb } from './fakeServer';
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
  return formatMoney(cents, 'USD').replace(/\u00a0/g, ' ');
}

/** The default fixture: one wallet, five movements and two caps in the given month. */
export function buildSeed(month: string): Partial<FakeDb> {
  const movements: Movement[] = [
    { id: 1, type: 'gasto', category_id: 'supermercado', account_id: 1, account_name: 'Cartera USD', is_debt_payment: false, amount_cents: 8_500_000, entry_currency: 'USD', entry_amount_cents: 8_500_000, rate_micros: null, date: day(month, 3), note: 'Compra', items: [], created_at: `${day(month, 3)}T10:00:00-03:00` },
    { id: 2, type: 'gasto', category_id: 'transporte', account_id: 1, account_name: 'Cartera USD', is_debt_payment: false, amount_cents: 4_200_000, entry_currency: 'USD', entry_amount_cents: 4_200_000, rate_micros: null, date: day(month, 4), note: 'SUBE', items: [], created_at: `${day(month, 4)}T10:00:00-03:00` },
    { id: 3, type: 'gasto', category_id: 'alquiler-servicios', account_id: 1, account_name: 'Cartera USD', is_debt_payment: false, amount_cents: 32_000_000, entry_currency: 'USD', entry_amount_cents: 32_000_000, rate_micros: null, date: day(month, 2), note: 'Alquiler', items: [], created_at: `${day(month, 2)}T10:00:00-03:00` },
    { id: 4, type: 'ingreso', category_id: 'sueldo', account_id: 1, account_name: 'Cartera USD', is_debt_payment: false, amount_cents: 120_000_000, entry_currency: 'USD', entry_amount_cents: 120_000_000, rate_micros: null, date: day(month, 1), note: 'Sueldo', items: [], created_at: `${day(month, 1)}T10:00:00-03:00` },
    { id: 5, type: 'ingreso', category_id: 'freelance', account_id: 1, account_name: 'Cartera USD', is_debt_payment: false, amount_cents: 18_000_000, entry_currency: 'USD', entry_amount_cents: 18_000_000, rate_micros: null, date: day(month, 5), note: 'Proyecto', items: [], created_at: `${day(month, 5)}T10:00:00-03:00` },
  ];
  return {
    categories: CATEGORIES,
    accounts: DEFAULT_ACCOUNTS,
    movements,
    budgets: { supermercado: 5_000_000, transporte: 5_000_000 },
    nextId: 6,
    nextAccountId: 2,
  };
}

/**
 * The default fixture plus one movement whose USD total is the sum of its
 * detail lines, so the facturita breakdown has something to render.
 */
export function buildSeedWithItems(month: string): Partial<FakeDb> {
  const base = buildSeed(month);
  const withItems: Movement = {
    id: 6,
    type: 'gasto',
    category_id: 'supermercado',
    account_id: 1,
    account_name: 'Cartera USD',
    is_debt_payment: false,
    amount_cents: 3_000_000,
    entry_currency: 'USD',
    entry_amount_cents: 3_000_000,
    rate_micros: null,
    date: day(month, 6),
    note: 'Compra con detalle',
    items: [
      { description: 'Leche', amount_cents: 1_200_000 },
      { description: 'Pan', amount_cents: 800_000 },
      { description: 'Café', amount_cents: 1_000_000 },
    ],
    created_at: `${day(month, 6)}T10:00:00-03:00`,
  };
  return { ...base, movements: [...(base.movements ?? []), withItems], nextId: 7 };
}
