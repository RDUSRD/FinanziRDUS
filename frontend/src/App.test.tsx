import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { createFakeServer, type FakeServer } from './test/fakeServer';
import { renderAppTree } from './test/render';
import { MONTH, buildSeed, day, money } from './test/seed';
import { todayStr } from './lib/month';

let server: FakeServer;

beforeEach(() => {
  server = createFakeServer(buildSeed(MONTH));
  vi.stubGlobal('fetch', server.fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders the KPIs, charts, budgets and movements from the API', async () => {
    renderAppTree(<App />);

    const kpi = await screen.findByRole('region', { name: 'Los números del mes' });
    expect(within(kpi).getByText(money(138_000_000))).toBeInTheDocument();
    expect(within(kpi).getByText(money(44_700_000))).toBeInTheDocument();
    expect(within(kpi).getByText(money(93_300_000))).toBeInTheDocument();
    expect(
      within(kpi).getByText('Sin historial suficiente para comparar con los meses anteriores.'),
    ).toBeInTheDocument();

    const donut = screen.getByRole('region', { name: 'Gastos por categoría' });
    expect(within(donut).getByText('Supermercado')).toBeInTheDocument();
    expect(within(donut).getByText('Alquiler y servicios')).toBeInTheDocument();
    expect(within(donut).getByText('Transporte')).toBeInTheDocument();

    const budgets = screen.getByRole('region', { name: 'La lista · tope y gastado' });
    expect(within(budgets).getByText('excedido')).toBeInTheDocument();
    expect(within(budgets).getByText('cerca del tope')).toBeInTheDocument();

    const movements = await screen.findByRole('region', { name: /^El tablero/i });
    expect(within(movements).getByText('-$ 85.000')).toBeInTheDocument();
    expect(within(movements).getByText('(5)')).toBeInTheDocument();
  });

  it('shows an error state with retry when an endpoint fails, then recovers', async () => {
    let failOnce = true;
    const wrapped = vi.fn((input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (failOnce && url.includes('/api/movements') && method === 'GET') {
        failOnce = false;
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ detail: 'Falla temporal' }),
          text: async () => '{"detail":"Falla temporal"}',
        });
      }
      return server.fetchMock(input, init);
    });
    vi.stubGlobal('fetch', wrapped);

    const user = userEvent.setup();
    renderAppTree(<App />);

    expect(await screen.findByText('Falla temporal')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    const movements = await screen.findByRole('region', { name: /^El tablero/i });
    expect(within(movements).getByText('-$ 85.000')).toBeInTheDocument();
  });

  it('validates the form and creates a movement without reloading', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);

    await user.click(screen.getByRole('button', { name: /anotar movimiento/i }));
    const amount = await screen.findByLabelText('Monto en dólares');
    await user.type(amount, 'abc');
    await user.click(screen.getByRole('button', { name: 'Agregar movimiento' }));

    expect(await screen.findByText('Error: Ingresá un monto válido (por ejemplo 1.234,56).')).toBeInTheDocument();
    expect(server.db.movements).toHaveLength(5);

    await user.clear(amount);
    await user.type(amount, '1000');
    await user.click(screen.getByRole('button', { name: 'Agregar movimiento' }));

    await waitFor(() => expect(server.db.movements).toHaveLength(6));
    const kpi = await screen.findByRole('region', { name: 'Los números del mes' });
    await waitFor(() => expect(within(kpi).getByText(money(44_800_000))).toBeInTheDocument());
  });

  it('deletes a movement after confirmation', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);

    const movements = await screen.findByRole('region', { name: /^El tablero/i });
    await user.click(within(movements).getByRole('button', { name: /Borrar movimiento: Supermercado/ }));
    await user.click(screen.getByRole('button', { name: 'Borrar movimiento' }));

    await waitFor(() => expect(server.db.movements).toHaveLength(4));
    await waitFor(() => expect(within(movements).queryByText('-$ 85.000')).not.toBeInTheDocument());
  });

  it('filters the table by category', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);

    const board = await screen.findByRole('region', { name: /^El tablero/i });
    await user.selectOptions(within(board).getByLabelText('Filtrar por categoría'), 'transporte');

    // The filter selects live in the same region as the mosaic: the figures are
    // read from the mosaic so a category option never matches a text query.
    const mosaic = within(board).getByRole('list', { name: 'Días del mes' });
    await waitFor(() => expect(within(mosaic).queryByText('Supermercado')).not.toBeInTheDocument());
    expect(within(mosaic).getByText('Transporte')).toBeInTheDocument();
  });

  it('exports every movement in the JSON payload', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
    let downloadedName = '';
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadedName = this.download;
      });

    try {
      renderAppTree(<App />);
      await screen.findByRole('region', { name: /^El tablero/i });

      await user.click(screen.getByRole('button', { name: 'Exportar JSON' }));

      await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
      const blob = createObjectURL.mock.calls[0][0];
      const payload = JSON.parse(await blob.text()) as {
        version: number;
        accounts: Array<{ name: string; opening_balance_cents: number }>;
        movements: unknown[];
        budgets: Record<string, number>;
      };
      expect(payload.version).toBe(3);
      expect(payload.accounts).toEqual([{ name: 'Cartera USD', opening_balance_cents: 0 }]);
      expect(payload.movements).toHaveLength(5);
      expect(payload.movements[0]).toMatchObject({
        type: expect.any(String),
        category_id: expect.any(String),
        account_id: expect.any(Number),
        is_debt_payment: expect.any(Boolean),
        amount_cents: expect.any(Number),
        entry_currency: expect.any(String),
        entry_amount_cents: expect.any(Number),
        date: expect.any(String),
        note: expect.any(String),
      });
      expect(payload.budgets).toEqual({ supermercado: 5_000_000, transporte: 5_000_000 });
      expect(downloadedName).toBe(`financirdus-${todayStr()}.json`);
    } finally {
      clickSpy.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  it('shows the Bs amount and rate as secondary detail for a VES movement', async () => {
    server = createFakeServer({
      ...buildSeed(MONTH),
      movements: [
        {
          id: 1,
          type: 'gasto',
          category_id: 'supermercado',
          account_id: 1,
          account_name: 'Cartera USD',
          is_debt_payment: false,
          amount_cents: 10_000,
          entry_currency: 'VES',
          entry_amount_cents: 400_000,
          rate_micros: 40_000_000,
          date: day(MONTH, 3),
          note: 'En Bs',
          created_at: `${day(MONTH, 3)}T10:00:00-03:00`,
        },
      ],
    });
    vi.stubGlobal('fetch', server.fetchMock);

    renderAppTree(<App />);

    const movements = await screen.findByRole('region', { name: /^El tablero/i });
    // The amount column stays USD; the Bs + rate is a secondary line.
    expect(within(movements).getByText('-$ 100')).toBeInTheDocument();
    expect(within(movements).getByText('Bs 4.000,00 @ 40')).toBeInTheDocument();
  });
});
