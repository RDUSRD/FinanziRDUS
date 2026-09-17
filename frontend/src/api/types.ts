/**
 * API types.
 *
 * These mirror the frozen contract in docs/api.md exactly: snake_case fields,
 * money as integer cents and months as "YYYY-MM" / dates as "YYYY-MM-DD".
 */

export type MovementType = 'gasto' | 'ingreso';

export type BudgetStatus = 'none' | 'ok' | 'warn' | 'over';

export type ComparisonDirection = 'above' | 'below' | 'equal' | 'na';

export interface Category {
  id: string;
  type: MovementType;
  label: string;
  sort_order: number;
}

export interface Movement {
  id: number;
  type: MovementType;
  category_id: string;
  amount_cents: number;
  date: string;
  note: string;
  created_at: string;
}

export interface MovementInput {
  type: MovementType;
  category_id: string;
  amount_cents: number;
  date: string;
  note?: string;
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

export interface ExportMovement {
  type: MovementType;
  category_id: string;
  amount_cents: number;
  date: string;
  note: string;
}

export interface ExportPayload {
  version: number;
  exported_at?: string;
  movements: ExportMovement[];
  budgets: Record<string, number>;
}

export type ImportMode = 'merge' | 'replace';

export interface ImportResult {
  mode: ImportMode;
  movements_imported: number;
  movements_skipped: number;
  budgets_imported: number;
}

export interface HealthResponse {
  status: string;
  db: string;
  version: string;
}
