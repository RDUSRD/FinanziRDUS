import type {
  BudgetsResponse,
  Category,
  ExportPayload,
  HealthResponse,
  ImportMode,
  ImportResult,
  MonthlyStat,
  Movement,
  MovementInput,
  MovementPatch,
  MovementType,
  PutBudgetResponse,
  StatsByCategory,
  StatsSummary,
} from './types';

/** Base URL, configurable through VITE_API_BASE (defaults to "/api"). */
const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/+$/, '');

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface PydanticIssue {
  loc?: Array<string | number>;
  msg?: string;
}

/** Turn the API `detail` (string or Pydantic list) into a Spanish message. */
function detailToMessage(detail: unknown, status: number): string {
  if (typeof detail === 'string' && detail.trim() !== '') return detail;
  if (Array.isArray(detail)) {
    const parts = (detail as PydanticIssue[]).map((issue) => {
      const where = Array.isArray(issue.loc)
        ? issue.loc.filter((piece) => piece !== 'body' && piece !== 'query').join('.')
        : '';
      const text = issue.msg ?? 'valor inválido';
      return where ? `${where}: ${text}` : text;
    });
    if (parts.length > 0) return parts.join('; ');
  }
  return `No se pudo completar la operación (error ${status}).`;
}

function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const init: RequestInit = { method: options.method ?? 'GET' };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { 'Content-Type': 'application/json' };
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Verificá que la API esté en ejecución.', 0);
  }

  if (!response.ok) {
    let detail: unknown;
    try {
      const data = (await response.json()) as { detail?: unknown };
      detail = data?.detail;
    } catch {
      detail = undefined;
    }
    throw new ApiError(detailToMessage(detail, response.status), response.status);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Raw text download (used for the JSON export endpoint). */
async function requestText(path: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`);
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Verificá que la API esté en ejecución.', 0);
  }
  if (!response.ok) {
    let detail: unknown;
    try {
      const data = (await response.json()) as { detail?: unknown };
      detail = data?.detail;
    } catch {
      detail = undefined;
    }
    throw new ApiError(detailToMessage(detail, response.status), response.status);
  }
  return response.text();
}

export const api = {
  health: () => request<HealthResponse>('/health'),

  categories: () => request<Category[]>('/categories'),

  movements: (params: { month?: string; category?: string; type?: MovementType } = {}) =>
    request<Movement[]>(`/movements${toQuery(params)}`),
  createMovement: (input: MovementInput) =>
    request<Movement>('/movements', { method: 'POST', body: input }),
  updateMovement: (id: number, patch: MovementPatch) =>
    request<Movement>(`/movements/${id}`, { method: 'PATCH', body: patch }),
  deleteMovement: (id: number) => request<void>(`/movements/${id}`, { method: 'DELETE' }),

  budgets: (month?: string) => request<BudgetsResponse>(`/budgets${toQuery({ month })}`),
  setBudget: (categoryId: string, capCents: number) =>
    request<PutBudgetResponse>(`/budgets/${encodeURIComponent(categoryId)}`, {
      method: 'PUT',
      body: { cap_cents: capCents },
    }),
  deleteBudget: (categoryId: string) =>
    request<void>(`/budgets/${encodeURIComponent(categoryId)}`, { method: 'DELETE' }),

  summary: (month?: string) => request<StatsSummary>(`/stats/summary${toQuery({ month })}`),
  byCategory: (month?: string) => request<StatsByCategory>(`/stats/by-category${toQuery({ month })}`),
  monthly: (params: { end?: string; months?: number } = {}) =>
    request<MonthlyStat[]>(`/stats/monthly${toQuery(params)}`),

  exportData: () => requestText('/data/export'),
  importData: (mode: ImportMode, payload: ExportPayload | unknown) =>
    request<ImportResult>(`/data/import${toQuery({ mode })}`, { method: 'POST', body: payload }),
};

/** Convert any thrown value into a short Spanish message for the UI. */
export function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Ocurrió un error inesperado.';
}
