import { vi } from 'vitest';
import type {
  Account,
  AccountInput,
  AccountsResponse,
  BudgetsResponse,
  Category,
  EntryCurrency,
  ExportPayload,
  ImportMode,
  MonthlyStat,
  Movement,
  MovementInput,
  MovementItem,
  PlanResponse,
  StatsByCategory,
  StatsSummary,
} from '../api/types';

/** The 15 catalogue categories from docs/data-model.md (11 expense, "deudas" is system). */
export const CATEGORIES: Category[] = [
  { id: 'supermercado', type: 'gasto', label: 'Supermercado', sort_order: 1, is_system: false },
  { id: 'comidas-afuera', type: 'gasto', label: 'Comidas afuera', sort_order: 2, is_system: false },
  { id: 'transporte', type: 'gasto', label: 'Transporte', sort_order: 3, is_system: false },
  { id: 'alquiler-servicios', type: 'gasto', label: 'Alquiler y servicios', sort_order: 4, is_system: false },
  { id: 'salud', type: 'gasto', label: 'Salud', sort_order: 5, is_system: false },
  { id: 'suscripciones', type: 'gasto', label: 'Suscripciones', sort_order: 6, is_system: false },
  { id: 'ropa', type: 'gasto', label: 'Ropa', sort_order: 7, is_system: false },
  { id: 'ocio', type: 'gasto', label: 'Ocio', sort_order: 8, is_system: false },
  { id: 'ahorro', type: 'gasto', label: 'Ahorro', sort_order: 9, is_system: false },
  { id: 'otros', type: 'gasto', label: 'Otros', sort_order: 10, is_system: false },
  { id: 'deudas', type: 'gasto', label: 'Deudas', sort_order: 11, is_system: true },
  { id: 'sueldo', type: 'ingreso', label: 'Sueldo', sort_order: 11, is_system: false },
  { id: 'freelance', type: 'ingreso', label: 'Freelance', sort_order: 12, is_system: false },
  { id: 'inversiones', type: 'ingreso', label: 'Inversiones', sort_order: 13, is_system: false },
  { id: 'otros-ingresos', type: 'ingreso', label: 'Otros', sort_order: 14, is_system: false },
];

/** Stored wallet (the API adds the derived balance/debt fields). */
export interface StoredAccount {
  id: number;
  name: string;
  opening_balance_cents: number;
  sort_order: number;
}

export interface FakeDb {
  categories: Category[];
  accounts: StoredAccount[];
  movements: Movement[];
  budgets: Record<string, number>;
  /** category_id -> jar_id (plan 25/15/50/10). */
  jarCategories: Record<string, string>;
  nextId: number;
  nextAccountId: number;
}

/** The wallet created for a fresh database (mirrors the migration seed). */
export const DEFAULT_ACCOUNTS: StoredAccount[] = [
  { id: 1, name: 'Cartera USD', opening_balance_cents: 0, sort_order: 1 },
];

/** The four money jars (id / label / pct / order), mirroring JAR_SEED. */
export const JARS = [
  { jar_id: 'crecimiento', label: 'Crecimiento', pct: 25 },
  { jar_id: 'estabilidad', label: 'Estabilidad', pct: 15 },
  { jar_id: 'esencial', label: 'Esencial', pct: 50 },
  { jar_id: 'recompensas', label: 'Recompensas', pct: 10 },
] as const;

/** Default category -> jar mapping (mirrors JAR_CATEGORY_SEED). */
export const DEFAULT_JAR_CATEGORIES: Record<string, string> = {
  supermercado: 'esencial',
  'comidas-afuera': 'recompensas',
  transporte: 'esencial',
  'alquiler-servicios': 'esencial',
  salud: 'esencial',
  suscripciones: 'esencial',
  ropa: 'recompensas',
  ocio: 'recompensas',
  ahorro: 'crecimiento',
  otros: 'estabilidad',
};

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

/** null means "all wallets" (consolidated). */
type AccountParam = number | null;

function inAccount(movement: Movement, account: AccountParam): boolean {
  return account === null || movement.account_id === account;
}

/** Parse the `account` query param ("all"/absent -> null, otherwise the id). */
function parseAccount(raw: string | null, db: FakeDb): AccountParam {
  if (raw === null || raw === '' || raw === 'all') return null;
  const id = Number(raw);
  return Number.isFinite(id) && db.accounts.some((account) => account.id === id) ? id : null;
}

function sumByType(db: FakeDb, type: string, month: string, account: AccountParam): number {
  return db.movements
    .filter((movement) => movement.type === type && monthOf(movement.date) === month && inAccount(movement, account))
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

function expensesByCategory(db: FakeDb, month: string, account: AccountParam): Record<string, number> {
  const out: Record<string, number> = {};
  for (const movement of db.movements) {
    if (
      movement.type !== 'gasto' ||
      monthOf(movement.date) !== month ||
      movement.amount_cents <= 0 ||
      !inAccount(movement, account)
    )
      continue;
    out[movement.category_id] = (out[movement.category_id] ?? 0) + movement.amount_cents;
  }
  return out;
}

function summary(db: FakeDb, month: string, account: AccountParam): StatsSummary {
  const income = sumByType(db, 'ingreso', month, account);
  const expenses = sumByType(db, 'gasto', month, account);
  let total = 0;
  let monthsUsed = 0;
  for (let back = 1; back <= 6; back++) {
    const value = sumByType(db, 'gasto', shift(month, -back), account);
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

function byCategory(db: FakeDb, month: string, account: AccountParam): StatsByCategory {
  const groups = expensesByCategory(db, month, account);
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

function monthly(db: FakeDb, end: string, months: number, account: AccountParam): MonthlyStat[] {
  const out: MonthlyStat[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const month = shift(end, -i);
    out.push({
      month,
      expenses_cents: sumByType(db, 'gasto', month, account),
      income_cents: sumByType(db, 'ingreso', month, account),
    });
  }
  return out;
}

function budgets(db: FakeDb, month: string): BudgetsResponse {
  const groups = expensesByCategory(db, month, null);
  let totalCap = 0;
  let totalSpent = 0;
  const items = db.categories
    .filter((category) => category.type === 'gasto' && !category.is_system)
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

/* ------------------------------------------------------------------ *
 * Wallets: balance and debt are derived from the stored movements.
 * ------------------------------------------------------------------ */
function accountBalance(opening: number, movements: Movement[]): number {
  let balance = opening;
  for (const movement of movements) {
    // Debt payments add to the balance (they reduce a negative debt); plain
    // expenses subtract; income adds.
    if (movement.type === 'ingreso' || movement.is_debt_payment) balance += movement.amount_cents;
    else balance -= movement.amount_cents;
  }
  return balance;
}

function accountView(db: FakeDb, stored: StoredAccount): Account {
  const movements = db.movements.filter((movement) => movement.account_id === stored.id);
  const balance = accountBalance(stored.opening_balance_cents, movements);
  const isDebt = stored.opening_balance_cents < 0;
  const paid = movements.filter((movement) => movement.is_debt_payment).reduce((acc, m) => acc + m.amount_cents, 0);
  return {
    id: stored.id,
    name: stored.name,
    opening_balance_cents: stored.opening_balance_cents,
    balance_cents: balance,
    is_debt: isDebt,
    paid_cents: paid,
    remaining_cents: isDebt ? -balance : 0,
    pct_paid: isDebt ? paid / -stored.opening_balance_cents : 0,
  };
}

function accountsResponse(db: FakeDb): AccountsResponse {
  const items = db.accounts.map((stored) => accountView(db, stored));
  const totalDebt = items
    .filter((item) => item.balance_cents < 0)
    .reduce((acc, item) => acc + -item.balance_cents, 0);
  return { total_debt_cents: totalDebt, items };
}

/** Split the monthly income across the four jars (last jar absorbs the rest). */
function jarTargets(income: number): Record<string, number> {
  const targets: Record<string, number> = {};
  let allocated = 0;
  JARS.forEach((jar, index) => {
    const isLast = index === JARS.length - 1;
    const target = isLast ? income - allocated : Math.round((income * jar.pct) / 100);
    targets[jar.jar_id] = target;
    if (!isLast) allocated += target;
  });
  return targets;
}

function plan(db: FakeDb, month: string): PlanResponse {
  const income = sumByType(db, 'ingreso', month, null);
  const targets = jarTargets(income);
  const groups = expensesByCategory(db, month, null);
  const jars = JARS.map((jar) => {
    const categoryIds = db.categories
      .filter(
        (category) =>
          category.type === 'gasto' && !category.is_system && db.jarCategories[category.id] === jar.jar_id,
      )
      .map((category) => category.id);
    const spent = categoryIds.reduce((acc, id) => acc + (groups[id] ?? 0), 0);
    const target = targets[jar.jar_id] ?? 0;
    return {
      jar_id: jar.jar_id,
      label: jar.label,
      pct: jar.pct,
      target_cents: target,
      spent_cents: spent,
      remaining_cents: target - spent,
      used: target > 0 ? spent / target : 0,
      status: budgetStatus(spent, target),
      category_ids: categoryIds,
    };
  });
  return { month, income_cents: income, jars };
}

/* ------------------------------------------------------------------ *
 * Detail lines (optional invoice items), mirroring domain.validate_items
 * and domain.resolve_movement_amount.
 * ------------------------------------------------------------------ */
const MAX_MOVEMENT_ITEMS = 100;
const MAX_ITEM_DESC_LEN = 120;
const MAX_CENTS = 2_147_483_647;

/** A validation failure the routes turn into a 422, like the domain error. */
class FakeDomainError extends Error {}

/**
 * Normalize and validate the optional detail lines. Returns `[]` for a missing
 * or empty list; throws {@link FakeDomainError} with the API's Spanish message
 * otherwise.
 */
function validateItems(raw: unknown): MovementItem[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new FakeDomainError('Las líneas del movimiento deben ser una lista.');
  if (raw.length > MAX_MOVEMENT_ITEMS) {
    throw new FakeDomainError(`Máximo ${MAX_MOVEMENT_ITEMS} líneas por movimiento.`);
  }
  return raw.map((entry) => {
    const line = (entry ?? {}) as { description?: unknown; amount_cents?: unknown };
    const description = typeof line.description === 'string' ? line.description.trim() : '';
    if (description.length === 0 || description.length > MAX_ITEM_DESC_LEN) {
      throw new FakeDomainError(
        `Cada línea necesita una descripción de hasta ${MAX_ITEM_DESC_LEN} caracteres.`,
      );
    }
    const amount = line.amount_cents;
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > MAX_CENTS) {
      throw new FakeDomainError('El precio de una línea debe ser mayor a cero.');
    }
    return { description, amount_cents: amount };
  });
}

/** Round half up (matches the domain's rule for a positive quotient). */
function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

/**
 * Resolve the canonical amount triplet. With lines the movement may be in USD or
 * VES: a line's `amount_cents` is in the entry currency, `entry_amount_cents` is
 * their sum, and a VES entry converts that sum once with its rate. Without lines
 * the canonical amount comes from the entry fields as before.
 */
function resolveMovementAmount(
  entryCurrency: EntryCurrency,
  entryAmountCents: number,
  rateMicros: number | null,
  items: MovementItem[],
): { amountCents: number; entryAmountCents: number; currency: EntryCurrency; rateMicros: number | null } {
  if (items.length > 0) {
    if (entryCurrency !== 'USD' && entryCurrency !== 'VES') {
      throw new FakeDomainError('La moneda debe ser USD o VES.');
    }
    const total = items.reduce((acc, item) => acc + item.amount_cents, 0);
    if (entryCurrency === 'VES') {
      const rate = rateMicros;
      if (rate === null || !Number.isFinite(rate) || rate <= 0) {
        throw new FakeDomainError('Un movimiento en bolívares necesita una tasa válida.');
      }
      return {
        amountCents: roundHalfUp((total * 1_000_000) / rate),
        entryAmountCents: total,
        currency: 'VES',
        rateMicros: rate,
      };
    }
    return { amountCents: total, entryAmountCents: total, currency: 'USD', rateMicros: null };
  }
  const rate = entryCurrency === 'VES' ? rateMicros : null;
  const amountCents =
    entryCurrency === 'VES' && rate ? Math.round((entryAmountCents * 1_000_000) / rate) : entryAmountCents;
  return { amountCents, entryAmountCents, currency: entryCurrency, rateMicros: rate };
}

/** Build a movement, deriving the canonical USD cents from the entry fields or lines. */
function buildMovement(
  db: FakeDb,
  id: number,
  body: Partial<MovementInput>,
  createdAt: string,
  items: MovementItem[] = [],
): Movement {
  const resolved = resolveMovementAmount(
    body.entry_currency ?? 'USD',
    body.entry_amount_cents ?? 0,
    body.rate_micros ?? null,
    items,
  );
  // A debt payment always lands in the system "deudas" category as an expense.
  const isDebtPayment = body.is_debt_payment === true;
  const accountId = body.account_id ?? db.accounts[0]?.id ?? 0;
  const accountName = db.accounts.find((account) => account.id === accountId)?.name;
  return {
    id,
    type: isDebtPayment ? 'gasto' : body.type ?? 'gasto',
    category_id: isDebtPayment ? 'deudas' : body.category_id ?? '',
    account_id: accountId,
    account_name: accountName,
    is_debt_payment: isDebtPayment,
    amount_cents: resolved.amountCents,
    entry_currency: resolved.currency,
    entry_amount_cents: resolved.entryAmountCents,
    rate_micros: resolved.rateMicros,
    date: body.date ?? '',
    note: body.note ?? '',
    items,
    created_at: createdAt,
  };
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
    accounts: DEFAULT_ACCOUNTS,
    movements: [],
    budgets: {},
    jarCategories: { ...DEFAULT_JAR_CATEGORIES },
    nextId: 1,
    nextAccountId: 2,
    ...seed,
  };
  // Clone the stored wallets so mutations never leak into the caller's fixture.
  db.accounts = db.accounts.map((account) => ({ ...account }));
  if (seed.nextAccountId === undefined) {
    db.nextAccountId = db.accounts.reduce((max, account) => Math.max(max, account.id), 0) + 1;
  }

  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit): Promise<FakeResponse> => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input);
    const url = new URL(raw, 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname;
    const month = url.searchParams.get('month') ?? currentMonth();
    const accountParam = parseAccount(url.searchParams.get('account'), db);

    if (method === 'GET' && path === '/api/categories') return json(db.categories);

    if (path === '/api/accounts') {
      if (method === 'GET') return json(accountsResponse(db));
      if (method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as Partial<AccountInput>;
        const name = String(body.name ?? '').trim();
        if (name.length === 0) return json({ detail: 'El nombre es obligatorio.' }, 422);
        if (db.accounts.some((account) => account.name === name)) {
          return json({ detail: 'Ya existe una cartera con ese nombre.' }, 422);
        }
        const opening = Number(body.opening_balance_cents ?? 0);
        const stored: StoredAccount = {
          id: db.nextAccountId++,
          name,
          opening_balance_cents: Number.isFinite(opening) ? opening : 0,
          sort_order: db.accounts.length + 1,
        };
        db.accounts.push(stored);
        return json(accountView(db, stored), 201);
      }
    }

    const accountId = /^\/api\/accounts\/(\d+)$/.exec(path);
    if (accountId) {
      const id = Number(accountId[1]);
      const index = db.accounts.findIndex((account) => account.id === id);
      if (index < 0) return json({ detail: 'La cartera no existe.' }, 404);
      if (method === 'DELETE') {
        const hasMovements = db.movements.some((movement) => movement.account_id === id);
        if (hasMovements) return json({ detail: 'La cartera tiene movimientos.' }, 409);
        if (db.accounts.length <= 1) return json({ detail: 'No podés borrar la última cartera.' }, 409);
        db.accounts.splice(index, 1);
        return noContent();
      }
      if (method === 'PATCH') {
        const patch = JSON.parse(String(init?.body ?? '{}')) as Partial<AccountInput>;
        const current = db.accounts[index];
        if (patch.name !== undefined) {
          const name = String(patch.name).trim();
          if (name.length === 0) return json({ detail: 'El nombre es obligatorio.' }, 422);
          if (db.accounts.some((account) => account.id !== id && account.name === name)) {
            return json({ detail: 'Ya existe una cartera con ese nombre.' }, 422);
          }
          current.name = name;
        }
        if (patch.opening_balance_cents !== undefined) {
          current.opening_balance_cents = Number(patch.opening_balance_cents);
        }
        return json(accountView(db, current));
      }
    }

    if (path === '/api/movements' && method === 'GET') {
      const list = db.movements
        .filter((movement) => !url.searchParams.get('month') || monthOf(movement.date) === month)
        .filter((movement) => inAccount(movement, accountParam))
        .sort((a, b) => (a.date === b.date ? b.created_at.localeCompare(a.created_at) : a.date < b.date ? 1 : -1));
      return json(list);
    }

    if (path === '/api/movements' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as Partial<MovementInput>;
      let created: Movement;
      try {
        const items = validateItems(body.items);
        if (body.is_debt_payment === true) {
          if (items.length > 0) throw new FakeDomainError('Un pago de deuda no lleva líneas de detalle.');
          const target = db.accounts.find((account) => account.id === body.account_id);
          if (!target || target.opening_balance_cents >= 0) {
            throw new FakeDomainError('La cartera no tiene deuda.');
          }
        }
        created = buildMovement(db, db.nextId++, body, new Date().toISOString(), items);
      } catch (error) {
        return json({ detail: (error as Error).message }, 422);
      }
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
        const patch = JSON.parse(String(init?.body ?? '{}')) as Partial<MovementInput>;
        const current = db.movements[index];
        let updated: Movement;
        try {
          // An explicit "items" replaces the whole list (an empty one clears it);
          // omitting the key keeps the stored lines.
          const items = 'items' in patch ? validateItems(patch.items) : current.items;
          const isDebtPayment = patch.is_debt_payment ?? current.is_debt_payment;
          if (isDebtPayment && items.length > 0) {
            throw new FakeDomainError('Un pago de deuda no lleva líneas de detalle.');
          }
          updated = buildMovement(db, current.id, { ...current, ...patch }, current.created_at, items);
        } catch (error) {
          return json({ detail: (error as Error).message }, 422);
        }
        db.movements[index] = updated;
        return json(updated);
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

    const planCategoryId = /^\/api\/plan\/categories\/([^/]+)$/.exec(path);
    if (planCategoryId) {
      const categoryId = decodeURIComponent(planCategoryId[1]);
      if (method === 'PUT') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { jar_id?: string };
        const jarId = body.jar_id ?? '';
        if (!JARS.some((jar) => jar.jar_id === jarId)) {
          return json({ detail: 'El frasco no existe.' }, 422);
        }
        const category = db.categories.find((item) => item.id === categoryId);
        if (!category || category.type !== 'gasto') {
          return json({ detail: 'La categoría no es de gasto.' }, 422);
        }
        db.jarCategories[categoryId] = jarId;
        return json({ category_id: categoryId, jar_id: jarId });
      }
    }

    if (method === 'GET' && path === '/api/budgets') return json(budgets(db, month));
    if (method === 'GET' && path === '/api/plan') return json(plan(db, month));
    if (method === 'GET' && path === '/api/stats/summary') return json(summary(db, month, accountParam));
    if (method === 'GET' && path === '/api/stats/by-category') return json(byCategory(db, month, accountParam));
    if (method === 'GET' && path === '/api/stats/monthly') {
      const end = url.searchParams.get('end') ?? currentMonth();
      const months = Number(url.searchParams.get('months') ?? 6);
      return json(monthly(db, end, months, accountParam));
    }

    if (method === 'GET' && path === '/api/data/export') {
      const movements = [...db.movements]
        .sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))
        .map((movement) => ({
          type: movement.type,
          category_id: movement.category_id,
          account_id: movement.account_id,
          is_debt_payment: movement.is_debt_payment,
          amount_cents: movement.amount_cents,
          entry_currency: movement.entry_currency,
          entry_amount_cents: movement.entry_amount_cents,
          rate_micros: movement.rate_micros,
          date: movement.date,
          note: movement.note,
          items: movement.items,
        }));
      return json({
        version: 4,
        exported_at: new Date().toISOString(),
        accounts: db.accounts.map((account) => ({
          name: account.name,
          opening_balance_cents: account.opening_balance_cents,
        })),
        movements,
        budgets: db.budgets,
        jar_categories: db.jarCategories,
      });
    }

    if (method === 'POST' && path === '/api/data/import') {
      const mode = (url.searchParams.get('mode') ?? 'merge') as ImportMode;
      const payload = JSON.parse(String(init?.body ?? '{}')) as Partial<ExportPayload>;
      const incoming = Array.isArray(payload.movements) ? payload.movements : [];
      const budgetsPayload =
        payload.budgets && typeof payload.budgets === 'object' ? payload.budgets : {};
      const accountsPayload = Array.isArray(payload.accounts) ? payload.accounts : null;

      let accountsImported = 0;
      const ensureAccount = (name: string, opening: number): StoredAccount => {
        let account = db.accounts.find((item) => item.name === name);
        if (!account) {
          account = {
            id: db.nextAccountId++,
            name,
            opening_balance_cents: Number.isFinite(opening) ? opening : 0,
            sort_order: db.accounts.length + 1,
          };
          db.accounts.push(account);
          accountsImported++;
        }
        return account;
      };

      if (mode === 'replace' && accountsPayload) {
        const names = accountsPayload.map((entry) => String(entry.name));
        db.accounts = db.accounts.filter((account) => names.includes(account.name));
      }
      if (accountsPayload) {
        for (const entry of accountsPayload) {
          ensureAccount(String(entry.name), Number(entry.opening_balance_cents ?? 0));
        }
      }

      const defaultAccount = (): StoredAccount => ensureAccount(db.accounts[0]?.name ?? 'Cartera USD', 0);

      let imported: Movement[];
      try {
        imported = incoming.map((entry) => {
          // v4 carries the detail lines; v1-v3 payloads have none.
          const items = validateItems(entry.items);
          // v3 maps the movement to a named wallet; v1/v2 fall back to the default.
          let accountId: number | undefined;
          if (entry.account_id !== undefined && accountsPayload) {
            const named = accountsPayload[entry.account_id - 1];
            if (named) accountId = ensureAccount(String(named.name), Number(named.opening_balance_cents ?? 0)).id;
          }
          return buildMovement(
            db,
            db.nextId++,
            {
              type: entry.type,
              category_id: entry.category_id,
              account_id: accountId ?? defaultAccount().id,
              is_debt_payment: entry.is_debt_payment === true,
              entry_currency: entry.entry_currency ?? 'USD',
              entry_amount_cents: entry.entry_amount_cents ?? entry.amount_cents ?? 0,
              rate_micros: entry.rate_micros ?? null,
              date: entry.date,
              note: entry.note,
            },
            new Date().toISOString(),
            items,
          );
        });
      } catch (error) {
        return json({ detail: (error as Error).message }, 422);
      }
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
        accounts_imported: accountsImported,
      });
    }

    return json({ detail: `No route for ${method} ${path}` }, 404);
  });

  return { db, fetchMock };
}
