/**
 * API types.
 *
 * These mirror the frozen contract in docs/api.md exactly: snake_case fields,
 * money as integer cents and months as "YYYY-MM" / dates as "YYYY-MM-DD".
 */

export type MovementType = 'gasto' | 'ingreso';

/**
 * Currency the movement was typed in. `amount_cents` is always the canonical
 * USD value; `entry_*` preserve what the user entered (USD cents or Bs céntimos).
 */
export type EntryCurrency = 'USD' | 'VES';

export type BudgetStatus = 'none' | 'ok' | 'warn' | 'over';

export type ComparisonDirection = 'above' | 'below' | 'equal' | 'na';

export interface Category {
  id: string;
  type: MovementType;
  label: string;
  sort_order: number;
  /** System categories ("Deudas") are hidden from manual selectors. */
  is_system: boolean;
}

/** A named USD wallet. A negative opening balance means the wallet holds a debt. */
export interface Account {
  id: number;
  name: string;
  /** Signed cents: negative means the wallet was opened with a debt. */
  opening_balance_cents: number;
  /** opening + income - expenses (non payments) + debt payments. */
  balance_cents: number;
  is_debt: boolean;
  /** Sum of the debt payments registered against this wallet. */
  paid_cents: number;
  /** Outstanding debt (0 for non-debt wallets). */
  remaining_cents: number;
  /** Fraction 0..1 of the opening debt already paid (0 without debt). */
  pct_paid: number;
}

export interface AccountsResponse {
  total_debt_cents: number;
  items: Account[];
}

export interface AccountInput {
  name: string;
  opening_balance_cents: number;
}

export interface AccountUpdateInput {
  name?: string;
  opening_balance_cents?: number;
}

/** Movement/stats filter: "all" (consolidated) or a specific wallet id. */
export type AccountFilter = number | 'all';

/** One product/service line of a movement's detail, in USD cents. */
export interface MovementItem {
  description: string;
  amount_cents: number;
}

export interface Movement {
  id: number;
  type: MovementType;
  category_id: string;
  account_id: number;
  /** Wallet name, resolved by the API. */
  account_name?: string;
  /** True for a debt payment (forced to category "deudas" and type "gasto"). */
  is_debt_payment: boolean;
  /** Canonical amount in USD cents. */
  amount_cents: number;
  /** Currency the movement was entered in. */
  entry_currency: EntryCurrency;
  /** Amount as typed, in its own currency minor units. */
  entry_amount_cents: number;
  /** Bs per 1 USD x 1e6; only present for `VES` entries. */
  rate_micros: number | null;
  date: string;
  note: string;
  /** Detail lines; empty when the movement has none. Their sum is `amount_cents`. */
  items: MovementItem[];
  created_at: string;
}

export interface MovementInput {
  type: MovementType;
  /**
   * Required for a regular movement. Must be omitted when `is_debt_payment`
   * is true: the backend forces the system "deudas" category and type "gasto".
   */
  category_id?: string;
  account_id: number;
  is_debt_payment?: boolean;
  entry_currency: EntryCurrency;
  entry_amount_cents: number;
  rate_micros: number | null;
  date: string;
  note?: string;
  /**
   * Detail lines. When sent they replace the whole list (`[]` clears it) and the
   * backend derives the USD total as their sum; only for USD movements.
   */
  items?: MovementItem[];
}

export type MovementPatch = Partial<MovementInput>;

export interface BudgetItem {
  category_id: string;
  label: string;
  cap_cents: number;
  spent_cents: number;
  /** Fraction 0..1 (can exceed 1); formatted on the frontend. */
  pct: number;
  status: BudgetStatus;
}

export interface BudgetsResponse {
  month: string;
  total_cap_cents: number;
  total_spent_cents: number;
  items: BudgetItem[];
}

export interface PutBudgetResponse {
  category_id: string;
  cap_cents: number;
}

/** A single money jar of the 25/15/50/10 plan. */
export interface Jar {
  jar_id: string;
  label: string;
  /** Share of the monthly income, as a whole percentage (25/15/50/10). */
  pct: number;
  /** Target for the month in USD cents (pct x income). */
  target_cents: number;
  spent_cents: number;
  remaining_cents: number;
  /** Fraction spent/target (0 when there is no target). */
  used: number;
  status: BudgetStatus;
  category_ids: string[];
}

export interface PlanResponse {
  month: string;
  income_cents: number;
  jars: Jar[];
}

export interface JarAssignInput {
  jar_id: string;
}

export interface JarAssignResponse {
  category_id: string;
  jar_id: string;
}

export interface AveragePrev {
  avg_cents: number;
  months_used: number;
}

export interface Comparison {
  /** Fraction; positive means the month spent more than the average. */
  pct: number;
  direction: ComparisonDirection;
}

export interface StatsSummary {
  month: string;
  income_cents: number;
  expenses_cents: number;
  balance_cents: number;
  average_prev: AveragePrev;
  comparison: Comparison;
}

export interface CategoryStat {
  category_id: string;
  label: string;
  cents: number;
  /** Fraction 0..1, sums to 1 (0 when the total is 0). */
  share: number;
}

export interface StatsByCategory {
  month: string;
  total_cents: number;
  items: CategoryStat[];
}

export interface MonthlyStat {
  month: string;
  expenses_cents: number;
  income_cents: number;
}

/** Wallet as carried by a v3 export (matched by name on import). */
export interface ExportAccount {
  name: string;
  opening_balance_cents: number;
}

export interface ExportMovement {
  type: MovementType;
  category_id: string;
  amount_cents: number;
  /** Entry fields (v2 exports); absent in v1 payloads. */
  entry_currency?: EntryCurrency;
  entry_amount_cents?: number;
  rate_micros?: number | null;
  /** Wallet fields (v3 exports); absent in v1/v2 payloads. */
  account_id?: number;
  is_debt_payment?: boolean;
  date: string;
  note: string;
  /** Detail lines (v4 exports); absent in v1-v3 payloads. */
  items?: MovementItem[];
}

export interface ExportPayload {
  version: number;
  exported_at?: string;
  /** Wallets (v3 exports only). */
  accounts?: ExportAccount[];
  movements: ExportMovement[];
  budgets: Record<string, number>;
  jar_categories?: Record<string, string>;
}

export type ImportMode = 'merge' | 'replace';

export interface ImportResult {
  mode: ImportMode;
  movements_imported: number;
  movements_skipped: number;
  budgets_imported: number;
  /** Wallets created/linked by the import (v3). */
  accounts_imported?: number;
}

export interface HealthResponse {
  status: string;
  db: string;
  version: string;
}
