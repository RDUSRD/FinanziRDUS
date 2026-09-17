import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { createFakeServer, type FakeServer } from './test/fakeServer';
import { renderAppTree } from './test/render';
import { MONTH, buildSeed, money } from './test/seed';
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

    const kpi = await screen.findByRole('region', { name: 'Resumen del mes' });
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

    const budgets = screen.getByRole('region', { name: 'Presupuestos por categoría' });
    expect(within(budgets).getByText('excedido')).toBeInTheDocument();
    expect(within(budgets).getByText('cerca del tope')).toBeInTheDocument();

    const movements = await screen.findByRole('region', { name: /Movimientos/ });
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

    const movements = await screen.findByRole('region', { name: /Movimientos/ });
    expect(within(movements).getByText('-$ 85.000')).toBeInTheDocument();
  });

  it('validates the form and creates a movement without reloading', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);

    const amount = await screen.findByLabelText('Monto en pesos');
    await user.type(amount, 'abc');
    await user.click(screen.getByRole('button', { name: 'Agregar movimiento' }));

    expect(await screen.findByText('Error: Ingresá un monto válido (por ejemplo 1.234,56).')).toBeInTheDocument();
    expect(server.db.movements).toHaveLength(5);

    await user.clear(amount);
    await user.type(amount, '1000');
    await user.click(screen.getByRole('button', { name: 'Agregar movimiento' }));

    await waitFor(() => expect(server.db.movements).toHaveLength(6));
    const kpi = await screen.findByRole('region', { name: 'Resumen del mes' });
    await waitFor(() => expect(within(kpi).getByText(money(44_800_000))).toBeInTheDocument());
  });

  it('deletes a movement after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderAppTree(<App />);

    const movements = await screen.findByRole('region', { name: /Movimientos/ });
    await user.click(within(movements).getByRole('button', { name: /Borrar movimiento: Supermercado/ }));

    await waitFor(() => expect(server.db.movements).toHaveLength(4));
    await waitFor(() => expect(within(movements).queryByText('-$ 85.000')).not.toBeInTheDocument());
  });

  it('filters the table by category', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);

    const movements = await screen.findByRole('region', { name: /Movimientos/ });
    await user.selectOptions(within(movements).getByLabelText('Filtrar por categoría'), 'transporte');

    const table = within(movements).getByRole('table');
    await waitFor(() => expect(within(table).queryByText('Supermercado')).not.toBeInTheDocument());
    expect(within(table).getByText('Transporte')).toBeInTheDocument();
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
      await screen.findByRole('region', { name: /Movimientos/ });

      await user.click(screen.getByRole('button', { name: 'Exportar JSON' }));

      await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
      const blob = createObjectURL.mock.calls[0][0];
      const payload = JSON.parse(await blob.text()) as {
        version: number;
        movements: unknown[];
        budgets: Record<string, number>;
      };
      expect(payload.version).toBe(1);
      expect(payload.movements).toHaveLength(5);
      expect(payload.movements[0]).toMatchObject({
        type: expect.any(String),
        category_id: expect.any(String),
        amount_cents: expect.any(Number),
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
});
