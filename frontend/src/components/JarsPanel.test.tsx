import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JarsPanel } from './JarsPanel';
import { createFakeServer } from '../test/fakeServer';
import { renderWithProviders } from '../test/render';
import { formatMoney } from '../lib/money';
import type { PlanResponse } from '../api/types';

const DATA: PlanResponse = {
  month: '2026-09',
  income_cents: 100_000_000, // $1.000.000
  jars: [
    {
      jar_id: 'crecimiento',
      label: 'Crecimiento',
      pct: 25,
      target_cents: 25_000_000,
      spent_cents: 5_000_000,
      remaining_cents: 20_000_000,
      used: 0.2,
      status: 'ok',
      category_ids: ['ahorro'],
    },
    {
      jar_id: 'estabilidad',
      label: 'Estabilidad',
      pct: 15,
      target_cents: 15_000_000,
      spent_cents: 13_000_000,
      remaining_cents: 2_000_000,
      used: 0.8666,
      status: 'warn',
      category_ids: ['otros'],
    },
    {
      jar_id: 'esencial',
      label: 'Esencial',
      pct: 50,
      target_cents: 50_000_000,
      spent_cents: 55_000_000,
      remaining_cents: -5_000_000,
      used: 1.1,
      status: 'over',
      category_ids: ['supermercado', 'transporte'],
    },
    {
      jar_id: 'recompensas',
      label: 'Recompensas',
      pct: 10,
      target_cents: 10_000_000,
      spent_cents: 0,
      remaining_cents: 10_000_000,
      used: 0,
      status: 'ok',
      category_ids: ['ocio'],
    },
  ],
};

const LABELS: Record<string, string> = {
  ahorro: 'Ahorro',
  otros: 'Otros',
  supermercado: 'Supermercado',
  transporte: 'Transporte',
  ocio: 'Ocio',
};

const labelOf = (id: string) => LABELS[id] ?? id;

function progress(name: string): HTMLElement {
  return screen.getByRole('progressbar', { name: `${name}: gasto del mes contra el objetivo del frasco` });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('JarsPanel', () => {
  it('shows the target, spent, remaining and status of every jar', () => {
    renderWithProviders(<JarsPanel data={DATA} labelOf={labelOf} />);
    const region = screen.getByRole('region', { name: 'El plan 25/15/50/10' });

    expect(within(region).getByText('Crecimiento', { selector: 'span.nm' })).toBeInTheDocument();
    expect(within(region).getByText('25%')).toBeInTheDocument();
    expect(within(region).getByText('50%')).toBeInTheDocument();

    expect(within(region).getByText('Objetivo $ 500.000')).toBeInTheDocument();
    expect(within(region).getByText('Gastado $ 550.000')).toBeInTheDocument();
    expect(within(region).getByText('Restante -$ 50.000')).toBeInTheDocument();

    expect(within(region).getByText('cerca del objetivo')).toBeInTheDocument();
    expect(within(region).getByText('excedido')).toBeInTheDocument();
    expect(within(region).getAllByText('ok').length).toBeGreaterThan(0);
  });

  it('exposes the real percentage through aria-valuetext while clamping the bar', () => {
    renderWithProviders(<JarsPanel data={DATA} labelOf={labelOf} />);

    const ok = progress('Crecimiento');
    expect(ok).toHaveAttribute('aria-valuenow', '20');
    expect(ok.getAttribute('aria-valuetext')).toContain('20%');

    const warn = progress('Estabilidad');
    expect(warn).toHaveAttribute('aria-valuenow', '87'); // 86.66 rounds up
    expect(warn.closest('.j')).toHaveClass('warn');

    const over = progress('Esencial');
    expect(over).toHaveAttribute('aria-valuenow', '100'); // bar clamped...
    expect(over.getAttribute('aria-valuetext')).toContain('110%'); // ...text is not
    expect(over.getAttribute('aria-valuetext')).toContain('excedido');
    expect(over.closest('.j')).toHaveClass('over');
  });

  it('reassigns a category to another jar through the API', async () => {
    const server = createFakeServer();
    vi.stubGlobal('fetch', server.fetchMock);
    const user = userEvent.setup();

    renderWithProviders(<JarsPanel data={DATA} labelOf={labelOf} />);

    const select = screen.getByLabelText('Frasco de Supermercado');
    expect(select).toHaveValue('esencial');
    // The member caption reads "Supermercado" but the field's label is scoped to
    // the select, so it never competes with a budget cap field of that name.
    expect(screen.queryByLabelText('Supermercado')).not.toBeInTheDocument();
    await user.selectOptions(select, 'recompensas');

    await waitFor(() => expect(server.db.jarCategories.supermercado).toBe('recompensas'));
    const putCall = server.fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).includes('/api/plan/categories/supermercado') && (init?.method ?? 'GET') === 'PUT',
    );
    expect(putCall).toBeTruthy();
    expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({ jar_id: 'recompensas' });
  });

  it('shows an empty state when there is no income that month', () => {
    const empty: PlanResponse = {
      month: '2026-09',
      income_cents: 0,
      jars: DATA.jars.map((jar) => ({
        ...jar,
        target_cents: 0,
        spent_cents: 0,
        remaining_cents: 0,
        used: 0,
        status: 'none',
        category_ids: [],
      })),
    };
    renderWithProviders(<JarsPanel data={empty} labelOf={labelOf} />);

    expect(screen.getByText(/Sin ingresos este mes/)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('warns that paying the debt comes first when there is debt', () => {
    renderWithProviders(<JarsPanel data={DATA} labelOf={labelOf} totalDebtCents={70_000} />);
    expect(screen.getByText(`Tenés ${formatMoney(70_000, 'USD')} de deuda.`)).toBeInTheDocument();
    expect(screen.getByText('Pagarla es la prioridad antes de asignar a los frascos.')).toBeInTheDocument();
  });

  it('does not warn when there is no debt', () => {
    renderWithProviders(<JarsPanel data={DATA} labelOf={labelOf} totalDebtCents={0} />);
    expect(screen.queryByText(/de deuda\./)).not.toBeInTheDocument();
  });
});
