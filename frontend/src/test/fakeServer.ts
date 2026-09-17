import { vi } from 'vitest';
import type {
  BudgetsResponse,
  Category,
  ExportPayload,
  ImportMode,
  MonthlyStat,
  Movement,
  StatsByCategory,
  StatsSummary,
} from '../api/types';

/** The 14 catalogue categories from docs/data-model.md. */
export const CATEGORIES: Category[] = [
  { id: 'supermercado', type: 'gasto', label: 'Supermercado', sort_order: 1 },
  { id: 'comidas-afuera', type: 'gasto', label: 'Comidas afuera', sort_order: 2 },
  { id: 'transporte', type: 'gasto', label: 'Transporte', sort_order: 3 },
  { id: 'alquiler-servicios', type: 'gasto', label: 'Alquiler y servicios', sort_order: 4 },
  { id: 'salud', type: 'gasto', label: 'Salud', sort_order: 5 },
  { id: 'suscripciones', type: 'gasto', label: 'Suscripciones', sort_order: 6 },
  { id: 'ropa', type: 'gasto', label: 'Ropa', sort_order: 7 },
  { id: 'ocio', type: 'gasto', label: 'Ocio', sort_order: 8 },
  { id: 'ahorro', type: 'gasto', label: 'Ahorro', sort_order: 9 },
  { id: 'otros', type: 'gasto', label: 'Otros', sort_order: 10 },
  { id: 'sueldo', type: 'ingreso', label: 'Sueldo', sort_order: 11 },
  { id: 'freelance', type: 'ingreso', label: 'Freelance', sort_order: 12 },
  { id: 'inversiones', type: 'ingreso', label: 'Inversiones', sort_order: 13 },
  { id: 'otros-ingresos', type: 'ingreso', label: 'Otros', sort_order: 14 },
];

export interface FakeDb {
  categories: Category[];
  movements: Movement[];
  budgets: Record<string, number>;
  nextId: number;
}

/* ------------------------------------------------------------------ *
 * Minimal Response shim: only the surface the client actually uses.
 * ------------------------------------------------------------------ */
interface FakeResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

function json(body: unknown, status = 200): FakeResponse {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(text) as unknown,
    text: async () => text,
  };
}

function noContent(): FakeResponse {
  return { ok: true, status: 204, json: async () => ({}), text: async () => '' };
}

/* ------------------------------------------------------------------ *
 * Server-derived computations (mirror the backend contract).
 * ------------------------------------------------------------------ */
function shift(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const total = year * 12 + (month - 1) + delta;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String(((total % 12) + 12) % 12 + 1).padStart(2, '0')}`;
}

function monthOf(date: string): string {
  return date.slice(0, 7);
}

function sumByType(db: FakeDb, type: string, month: string): number {
  return db.movements
    .filter((movement) => movement.type === type && monthOf(movement.date) === month)
    .reduce((acc, movement) => acc + movement.amount_cents, 0);
}

function labelOf(db: FakeDb, id: string): string {
  return db.categories.find((category) => category.id === id)?.label ?? id;
}

function budgetStatus(spent: number, cap: number): 'none' | 'ok' | 'warn' | 'over' {
  if (!(cap > 0)) return 'none';
  if (spent > cap) return 'over';
  if (spent >= 0.8 * cap) return 'warn';
  return 'ok';
}

function expensesByCategory(db: FakeDb, month: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const movement of db.movements) {
    if (movement.type !== 'gasto' || monthOf(movement.date) !== month || movement.amount_cents <= 0) continue;
    out[movement.category_id] = (out[movement.category_id] ?? 0) + movement.amount_cents;
  }
  return out;
}

function summary(db: FakeDb, month: string): StatsSummary {
  const income = sumByType(db, 'ingreso', month);
  const expenses = sumByType(db, 'gasto', month);
  let total = 0;
  let monthsUsed = 0;
  for (let back = 1; back <= 6; back++) {
    const value = sumByType(db, 'gasto', shift(month, -back));
    if (value > 0) {
      total += value;
      monthsUsed++;
    }
  }
  const avg = monthsUsed > 0 ? Math.round(total / monthsUsed) : 0;
  let direction: StatsSummary['comparison']['direction'] = 'na';
  let pct = 0;
  if (avg > 0) {
    const diff = expenses - avg;
    direction = diff > 0 ? 'above' : diff < 0 ? 'below' : 'equal';
    pct = diff / avg;
  }
  return {
    month,
    income_cents: income,
    expenses_cents: expenses,
    balance_cents: income - expenses,
    average_prev: { avg_cents: avg, months_used: monthsUsed },
    comparison: { pct, direction },
  };
}

function byCategory(db: FakeDb, month: string): StatsByCategory {
  const groups = expensesByCategory(db, month);
  const total = Object.values(groups).reduce((acc, value) => acc + value, 0);
  const items = Object.entries(groups)
    .map(([categoryId, cents]) => ({
      category_id: categoryId,
      label: labelOf(db, categoryId),
      cents,
      share: total > 0 ? cents / total : 0,
    }))
    .sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label));
  return { month, total_cents: total, items };
}

function monthly(db: FakeDb, end: string, months: number): MonthlyStat[] {
  const out: MonthlyStat[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const month = shift(end, -i);
    out.push({
      month,
      expenses_cents: sumByType(db, 'gasto', month),
      income_cents: sumByType(db, 'ingreso', month),
    });
  }
  return out;
}

function budgets(db: FakeDb, month: string): BudgetsResponse {
  const groups = expensesByCategory(db, month);
  let totalCap = 0;
  let totalSpent = 0;
  const items = db.categories
    .filter((category) => category.type === 'gasto')
    .map((category) => {
      const cap = db.budgets[category.id] ?? 0;
      const spent = groups[category.id] ?? 0;
      totalCap += cap;
      // Contract: total_spent_cents sums the spending of every expense
      // category (whether or not it has a cap), mirroring get_budgets and the
      // monthly expenses KPI. It is NOT limited to capped categories.
      totalSpent += spent;
      return {
        category_id: category.id,
        label: category.label,
        cap_cents: cap,
        spent_cents: spent,
        pct: cap > 0 ? spent / cap : 0,
        status: budgetStatus(spent, cap),
      };
    });
  return { month, total_cap_cents: totalCap, total_spent_cents: totalSpent, items };
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ *
 * Fetch mock
 * ------------------------------------------------------------------ */
export interface FakeServer {
  db: FakeDb;
  fetchMock: ReturnType<typeof vi.fn>;
}

export function createFakeServer(seed: Partial<FakeDb> = {}): FakeServer {
  const db: FakeDb = {
    categories: CATEGORIES,
    movements: [],
    budgets: {},
    nextId: 1,
    ...seed,
  };

  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit): Promise<FakeResponse> => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input);
    const url = new URL(raw, 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname;
    const month = url.searchParams.get('month') ?? currentMonth();

    if (method === 'GET' && path === '/api/categories') return json(db.categories);

    if (path === '/api/movements' && method === 'GET') {
      const list = db.movements
        .filter((movement) => !url.searchParams.get('month') || monthOf(movement.date) === month)
        .sort((a, b) => (a.date === b.date ? b.created_at.localeCompare(a.created_at) : a.date < b.date ? 1 : -1));
      return json(list);
    }

    if (path === '/api/movements' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as Partial<Movement>;
      const created: Movement = {
        id: db.nextId++,
        type: body.type ?? 'gasto',
        category_id: body.category_id ?? '',
        amount_cents: body.amount_cents ?? 0,
        date: body.date ?? '',
        note: body.note ?? '',
        created_at: new Date().toISOString(),
      };
      db.movements.push(created);
      return json(created, 201);
    }

    const movementId = /^\/api\/movements\/(\d+)$/.exec(path);
    if (movementId) {
      const id = Number(movementId[1]);
      const index = db.movements.findIndex((movement) => movement.id === id);
      if (method === 'DELETE') {
        if (index >= 0) db.movements.splice(index, 1);
        return noContent();
      }
      if (method === 'PATCH') {
        if (index < 0) return json({ detail: 'El movimiento no existe.' }, 404);
        const patch = JSON.parse(String(init?.body ?? '{}')) as Partial<Movement>;
        db.movements[index] = { ...db.movements[index], ...patch };
        return json(db.movements[index]);
      }
    }

    const budgetId = /^\/api\/budgets\/([^/]+)$/.exec(path);
    if (budgetId) {
      const categoryId = decodeURIComponent(budgetId[1]);
      if (method === 'PUT') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { cap_cents?: number };
        const cap = body.cap_cents ?? 0;
        if (cap <= 0) return json({ detail: 'El tope debe ser mayor a cero.' }, 422);
        db.budgets[categoryId] = cap;
        return json({ category_id: categoryId, cap_cents: cap });
      }
      if (method === 'DELETE') {
        delete db.budgets[categoryId];
        return noContent();
      }
    }

    if (method === 'GET' && path === '/api/budgets') return json(budgets(db, month));
    if (method === 'GET' && path === '/api/stats/summary') return json(summary(db, month));
    if (method === 'GET' && path === '/api/stats/by-category') return json(byCategory(db, month));
    if (method === 'GET' && path === '/api/stats/monthly') {
      const end = url.searchParams.get('end') ?? currentMonth();
      const months = Number(url.searchParams.get('months') ?? 6);
      return json(monthly(db, end, months));
    }

    if (method === 'GET' && path === '/api/data/export') {
      const movements = [...db.movements]
        .sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))
        .map((movement) => ({
          type: movement.type,
          category_id: movement.category_id,
          amount_cents: movement.amount_cents,
          date: movement.date,
          note: movement.note,
        }));
      return json({ version: 1, exported_at: new Date().toISOString(), movements, budgets: db.budgets });
    }

    if (method === 'POST' && path === '/api/data/import') {
      const mode = (url.searchParams.get('mode') ?? 'merge') as ImportMode;
      const payload = JSON.parse(String(init?.body ?? '{}')) as Partial<ExportPayload>;
      const incoming = Array.isArray(payload.movements) ? payload.movements : [];
      const budgetsPayload =
        payload.budgets && typeof payload.budgets === 'object' ? payload.budgets : {};
      const imported: Movement[] = incoming.map((entry) => ({
        id: db.nextId++,
        type: entry.type ?? 'gasto',
        category_id: entry.category_id ?? '',
        amount_cents: entry.amount_cents ?? 0,
        date: entry.date ?? '',
        note: entry.note ?? '',
        created_at: new Date().toISOString(),
      }));
      if (mode === 'replace') {
        db.movements = imported;
        db.budgets = { ...budgetsPayload };
      } else {
        db.movements.push(...imported);
        db.budgets = { ...db.budgets, ...budgetsPayload };
      }
      return json({
        mode,
        movements_imported: imported.length,
        movements_skipped: 0,
        budgets_imported: Object.keys(budgetsPayload).length,
      });
    }

    return json({ detail: `No route for ${method} ${path}` }, 404);
  });

  return { db, fetchMock };
}
