import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  ExportPayload,
  ImportMode,
  ImportResult,
  MovementInput,
  MovementPatch,
  Movement,
  PutBudgetResponse,
} from './types';

/** Centralised query keys. */
export const queryKeys = {
  categories: ['categories'] as const,
  movements: (month: string) => ['movements', month] as const,
  budgets: (month: string) => ['budgets', month] as const,
  summary: (month: string) => ['stats', 'summary', month] as const,
  byCategory: (month: string) => ['stats', 'by-category', month] as const,
  monthly: (month: string, months: number) => ['stats', 'monthly', month, months] as const,
};

/**
 * Invalidate every server-derived view that a movement/budget change can affect.
 * The totals are recomputed by the API, so the frontend only refetches.
 */
function invalidateDerived(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: ['movements'] });
  void client.invalidateQueries({ queryKey: ['budgets'] });
  void client.invalidateQueries({ queryKey: ['stats'] });
}

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => api.categories(),
    staleTime: Infinity,
  });
}

export function useMovements(month: string) {
  return useQuery({
    queryKey: queryKeys.movements(month),
    queryFn: () => api.movements({ month }),
  });
}

export function useBudgets(month: string) {
  return useQuery({
    queryKey: queryKeys.budgets(month),
    queryFn: () => api.budgets(month),
  });
}

export function useSummary(month: string) {
  return useQuery({
    queryKey: queryKeys.summary(month),
    queryFn: () => api.summary(month),
  });
}

export function useByCategory(month: string) {
  return useQuery({
    queryKey: queryKeys.byCategory(month),
    queryFn: () => api.byCategory(month),
  });
}

export function useMonthly(month: string, months = 6) {
  return useQuery({
    queryKey: queryKeys.monthly(month, months),
    queryFn: () => api.monthly({ end: month, months }),
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

export function useImportData() {
  const client = useQueryClient();
  return useMutation<ImportResult, Error, { mode: ImportMode; payload: ExportPayload | unknown }>({
    mutationFn: ({ mode, payload }) => api.importData(mode, payload),
    onSuccess: () => invalidateDerived(client),
  });
}
