import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth/AuthContext';
import { LiveRegionProvider } from '../components/LiveRegion';

/** Render any element inside the app providers with a throwaway QueryClient. */
export function renderWithProviders(ui: ReactElement): RenderResult {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/**
 * Render the full provider tree used by the real app (App is passed in). The
 * session provider goes inside the QueryClient one: it reads the cookie through
 * `/api/auth/me` and clears the cache on logout.
 */
export function renderAppTree(ui: ReactElement): RenderResult {
  return renderWithProviders(
    <LiveRegionProvider>
      <AuthProvider>{ui}</AuthProvider>
    </LiveRegionProvider>,
  );
}
