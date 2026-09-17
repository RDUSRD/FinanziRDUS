import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  Account,
  AccountFilter,
  AccountInput,
  AccountsResponse,
  AccountUpdateInput,
  ExportPayload,
  ImportMode,
  ImportResult,
  JarAssignResponse,
  MovementInput,
  MovementPatch,
  Movement,
  PlanResponse,
  PutBudgetResponse,
} from './types';

/** Centralised query keys. */
export const queryKeys = {
  categories: ['categories'] as const,
  accounts: ['accounts'] as const,
  movements: (month: string, account: AccountFilter) => ['movements', month, account] as const,
  budgets: (month: string) => ['budgets', month] as const,
  plan: (month: string) => ['plan', month] as const,
  summary: (month: string, account: AccountFilter) => ['stats', 'summary', month, account] as const,
  byCategory: (month: string, account: AccountFilter) => ['stats', 'by-category', month, account] as const,
  monthly: (month: string, months: number, account: AccountFilter) =>
    ['stats', 'monthly', month, months, account] as const,
};

/**
 * Invalidate every server-derived view that a movement/budget/plan change can
 * affect. The totals are recomputed by the API, so the frontend only refetches.
 * Wallets are derived from their movements, so they refresh here too.
 */
function invalidateDerived(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ['movements'] });
  void client.invalidateQueries({ queryKey: ['budgets'] });
  void client.invalidateQueries({ queryKey: ['plan'] });
  void client.invalidateQueries({ queryKey: ['stats'] });
  void client.invalidateQueries({ queryKey: ['accounts'] });
}

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => api.categories(),
    staleTime: Infinity,
  });
}

export function useAccounts() {
  return useQuery<AccountsResponse>({
    queryKey: queryKeys.accounts,
    queryFn: () => api.accounts(),
  });
}

export function useMovements(month: string, account: AccountFilter = 'all') {
  return useQuery({
    queryKey: queryKeys.movements(month, account),
    queryFn: () => api.movements({ month, account }),
  });
}

export function useBudgets(month: string) {
  return useQuery({
    queryKey: queryKeys.budgets(month),
    queryFn: () => api.budgets(month),
  });
}

export function usePlan(month: string) {
  return useQuery<PlanResponse>({
    queryKey: queryKeys.plan(month),
    queryFn: () => api.plan(month),
  });
}

export function useSummary(month: string, account: AccountFilter = 'all') {
  return useQuery({
    queryKey: queryKeys.summary(month, account),
    queryFn: () => api.summary(month, account),
  });
}

export function useByCategory(month: string, account: AccountFilter = 'all') {
  return useQuery({
    queryKey: queryKeys.byCategory(month, account),
    queryFn: () => api.byCategory(month, account),
  });
}

export function useMonthly(month: string, months = 6, account: AccountFilter = 'all') {
  return useQuery({
    queryKey: queryKeys.monthly(month, months, account),
    queryFn: () => api.monthly({ end: month, months, account }),
  });
}

export function useCreateAccount() {
  const client = useQueryClient();
  return useMutation<Account, Error, AccountInput>({
    mutationFn: (input) => api.createAccount(input),
    onSuccess: () => invalidateDerived(client),
  });
}

export function useUpdateAccount() {
  const client = useQueryClient();
  return useMutation<Account, Error, { id: number; patch: AccountUpdateInput }>({
    mutationFn: ({ id, patch }) => api.updateAccount(id, patch),
    onSuccess: () => invalidateDerived(client),
  });
}

export function useDeleteAccount() {
  const client = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) => api.deleteAccount(id),
    onSuccess: () => invalidateDerived(client),
  });
}

export function useCreateMovement() {
  const client = useQueryClient();
  return useMutation<Movement, Error, MovementInput>({
    mutationFn: (input) => api.createMovement(input),
    onSuccess: () => invalidateDerived(client),
  });
}

export function useUpdateMovement() {
  const client = useQueryClient();
  return useMutation<Movement, Error, { id: number; patch: MovementPatch }>({
    mutationFn: ({ id, patch }) => api.updateMovement(id, patch),
    onSuccess: () => invalidateDerived(client),
  });
}

export function useDeleteMovement() {
  const client = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) => api.deleteMovement(id),
    onSuccess: () => invalidateDerived(client),
  });
}

export function useSetBudget() {
  const client = useQueryClient();
  return useMutation<PutBudgetResponse, Error, { categoryId: string; capCents: number }>({
    mutationFn: ({ categoryId, capCents }) => api.setBudget(categoryId, capCents),
    onSuccess: () => invalidateDerived(client),
  });
}

export function useDeleteBudget() {
  const client = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (categoryId) => api.deleteBudget(categoryId),
    onSuccess: () => invalidateDerived(client),
  });
}

export function useAssignJar() {
  const client = useQueryClient();
  return useMutation<JarAssignResponse, Error, { categoryId: string; jarId: string }>({
    mutationFn: ({ categoryId, jarId }) => api.assignJar(categoryId, jarId),
    onSuccess: () => invalidateDerived(client),
  });
}

export function useImportData() {
  const client = useQueryClient();
  return useMutation<ImportResult, Error, { mode: ImportMode; payload: ExportPayload | unknown }>({
    mutationFn: ({ mode, payload }) => api.importData(mode, payload),
    onSuccess: () => invalidateDerived(client),
  });
}
