import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { CATEGORIES, createFakeServer, type FakeServer } from './test/fakeServer';
import { renderAppTree } from './test/render';
import { MONTH, day, money } from './test/seed';
import { monthFullLabel, shiftMonth } from './lib/month';
import type { Movement } from './api/types';

let server: FakeServer;

afterEach(() => {
  vi.unstubAllGlobals();
});

function movement(
  id: number,
  type: Movement['type'],
  categoryId: string,
  cents: number,
  date: string,
): Movement {
  return {
    id,
    type,
    category_id: categoryId,
    account_id: 1,
    account_name: 'Cartera USD',
    is_debt_payment: false,
    amount_cents: cents,
    entry_currency: 'USD',
    entry_amount_cents: cents,
    rate_micros: null,
    date,
    note: '',
    created_at: `${date}T10:00:00-03:00`,
  };
}

function mount(movements: Movement[]): void {
  server = createFakeServer({ categories: CATEGORIES, movements, budgets: {}, nextId: movements.length + 1 });
  vi.stubGlobal('fetch', server.fetchMock);
  renderAppTree(<App />);
}

/** Did any request hit a URL containing `substring`? */
function requested(substring: string): boolean {
  return server.fetchMock.mock.calls.some((call) => String(call[0]).includes(substring));
}

function liveStatusText(): string {
  return (screen.getByRole('status').textContent ?? '').replace(/\u00a0/g, ' ');
}

describe('App comparison states', () => {
  it('reports "above" when the month spent more than the average', async () => {
    mount([
      movement(1, 'gasto', 'otros', 30_000_000, day(MONTH, 5)),
      movement(2, 'gasto', 'otros', 10_000_000, day(shiftMonth(MONTH, -1), 5)),
    ]);
    const kpi = await screen.findByRole('region', { name: 'Los números del mes' });
    expect(
      within(kpi).getByText(
        `Este mes gastaste 200% más que el promedio de los 6 meses anteriores (promedio: ${money(
          10_000_000,
        )}, basado en 1 mes).`,
      ),
    ).toBeInTheDocument();
  });

  it('reports "below" when the month spent less than the average', async () => {
    mount([
      movement(1, 'gasto', 'otros', 10_000_000, day(MONTH, 5)),
      movement(2, 'gasto', 'otros', 20_000_000, day(shiftMonth(MONTH, -1), 5)),
    ]);
    const kpi = await screen.findByRole('region', { name: 'Los números del mes' });
    expect(
      within(kpi).getByText(
        `Este mes gastaste 50% menos que el promedio de los 6 meses anteriores (promedio: ${money(
          20_000_000,
        )}, basado en 1 mes).`,
      ),
    ).toBeInTheDocument();
  });

  it('reports "equal" when the month matches the average', async () => {
    mount([
      movement(1, 'gasto', 'otros', 10_000_000, day(MONTH, 5)),
      movement(2, 'gasto', 'otros', 10_000_000, day(shiftMonth(MONTH, -1), 5)),
    ]);
    const kpi = await screen.findByRole('region', { name: 'Los números del mes' });
    expect(
      within(kpi).getByText(
        `Este mes gastaste lo mismo que el promedio de los 6 meses anteriores (promedio: ${money(
          10_000_000,
        )}, basado en 1 mes).`,
      ),
    ).toBeInTheDocument();
  });

  it('reports "na" when there is no previous history', async () => {
    mount([movement(1, 'gasto', 'otros', 10_000_000, day(MONTH, 5))]);
    expect(
      await screen.findByText('Sin historial suficiente para comparar con los meses anteriores.'),
    ).toBeInTheDocument();
  });

  it('reports "no expenses" for a past month without spending', async () => {
    mount([movement(1, 'gasto', 'otros', 10_000_000, day(shiftMonth(MONTH, -1), 5))]);
    expect(
      await screen.findByText('Sin gastos este mes para comparar con los meses anteriores.'),
    ).toBeInTheDocument();
  });

  it('reports a future month and swaps to the empty month panels', async () => {
    mount([movement(1, 'gasto', 'otros', 10_000_000, day(MONTH, 5))]);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Mes siguiente' }));

    expect(
      await screen.findByText('Mes futuro: todavía no hay gastos para comparar con los meses anteriores.'),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByText(monthFullLabel(shiftMonth(MONTH, 1)))).toBeInTheDocument();
    expect(await screen.findByText('Todavía no cargaste movimientos este mes.')).toBeInTheDocument();
  });

  it('flags a negative balance with the danger class', async () => {
    mount([movement(1, 'gasto', 'otros', 20_000_000, day(MONTH, 5))]);
    const kpi = await screen.findByRole('region', { name: 'Los números del mes' });
    const balance = within(kpi).getByText(money(-20_000_000));
    expect(balance.closest('.sub-line')).toHaveClass('neg');
  });
});

describe('App month navigation', () => {
  it('requeries every panel when the month changes and shows the empty states', async () => {
    mount([
      movement(1, 'gasto', 'supermercado', 30_000_000, day(MONTH, 5)),
      movement(2, 'ingreso', 'sueldo', 50_000_000, day(MONTH, 6)),
    ]);
    const user = userEvent.setup();
    const previous = shiftMonth(MONTH, -1);

    await screen.findByRole('region', { name: /^El libro/i });
    await user.click(screen.getByRole('button', { name: 'Mes anterior' }));

    expect(screen.getByText(monthFullLabel(previous))).toBeInTheDocument();
    await waitFor(() => expect(requested(`month=${previous}`)).toBe(true));
    await waitFor(() => expect(requested(`end=${previous}`)).toBe(true));

    expect(await screen.findByText('Todavía no cargaste movimientos este mes.')).toBeInTheDocument();
    expect(screen.getByText('Sin gastos este mes.')).toBeInTheDocument();
    expect(screen.getByText('Sin gastos registrados en los últimos 6 meses.')).toBeInTheDocument();
    const kpi = screen.getByRole('region', { name: 'Los números del mes' });
    expect(within(kpi).getAllByText(money(0))).toHaveLength(3);
  });
});

describe('App import', () => {
  function importFile(name: string, payload: unknown): File {
    return new File([JSON.stringify(payload)], name, { type: 'application/json' });
  }

  it('rejects a file bigger than 5 MB with a clear message and without calling the API', async () => {
    mount([movement(1, 'gasto', 'supermercado', 30_000_000, day(MONTH, 5))]);
    const user = userEvent.setup();
    await screen.findByRole('region', { name: /^El libro/i });

    const big = importFile('grande.json', { version: 1, movements: [], budgets: {} });
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });

    await user.click(screen.getByRole('button', { name: /importar/i }));
    await user.upload(screen.getByLabelText('Archivo JSON a importar'), big);

    expect(await screen.findByText(/demasiado grande \(máximo 5 MB\)/)).toBeInTheDocument();
    expect(server.db.movements).toHaveLength(1);
  });

  it('merges an imported file and refreshes the view and KPIs', async () => {
    mount([
      movement(1, 'gasto', 'supermercado', 30_000_000, day(MONTH, 5)),
      movement(2, 'ingreso', 'sueldo', 50_000_000, day(MONTH, 6)),
    ]);
    const user = userEvent.setup();
    await screen.findByRole('region', { name: /^El libro/i });

    await user.click(screen.getByRole('button', { name: /importar/i }));
    await user.upload(
      screen.getByLabelText('Archivo JSON a importar'),
      importFile('merge.json', {
        version: 1,
        movements: [{ type: 'gasto', category_id: 'ocio', amount_cents: 1_000_000, date: day(MONTH, 10), note: 'Importado' }],
        budgets: { ocio: 2_000_000 },
      }),
    );

    await waitFor(() => expect(server.db.movements).toHaveLength(3));
    expect(server.db.budgets.ocio).toBe(2_000_000);
    expect(requested('mode=merge')).toBe(true);
    expect(await screen.findByText(/Datos fusionados:/)).toBeInTheDocument();

    const kpi = await screen.findByRole('region', { name: 'Los números del mes' });
    await waitFor(() => expect(within(kpi).getByText(money(19_000_000))).toBeInTheDocument());
    await waitFor(() =>
      expect(liveStatusText()).toContain(`Datos fusionados. Te queda ${money(19_000_000)}.`),
    );
  });

  it('replaces the data in replace mode after confirmation', async () => {
    mount([
      movement(1, 'gasto', 'supermercado', 30_000_000, day(MONTH, 5)),
      movement(2, 'ingreso', 'sueldo', 50_000_000, day(MONTH, 6)),
    ]);
    const user = userEvent.setup();
    await screen.findByRole('region', { name: /^El libro/i });

    await user.click(screen.getByRole('button', { name: /importar/i }));
    await user.click(screen.getByRole('radio', { name: 'Reemplazar' }));
    await user.upload(
      screen.getByLabelText('Archivo JSON a importar'),
      importFile('replace.json', {
        version: 1,
        movements: [
          { type: 'gasto', category_id: 'ocio', amount_cents: 1_000_000, date: day(MONTH, 10), note: '' },
          { type: 'ingreso', category_id: 'sueldo', amount_cents: 5_000_000, date: day(MONTH, 11), note: '' },
        ],
        budgets: { ocio: 2_000_000 },
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Reemplazar todo' }));

    await waitFor(() => expect(server.db.movements).toHaveLength(2));
    expect(server.db.budgets).toEqual({ ocio: 2_000_000 });
    expect(requested('mode=replace')).toBe(true);
    expect(await screen.findByText(/Datos reemplazados:/)).toBeInTheDocument();

    const kpi = await screen.findByRole('region', { name: 'Los números del mes' });
    await waitFor(() => expect(within(kpi).getByText(money(4_000_000))).toBeInTheDocument());
  });

  it('shows an import error without breaking the view', async () => {
    mount([movement(1, 'gasto', 'supermercado', 30_000_000, day(MONTH, 5))]);
    const failing = vi.fn((input: unknown, init?: RequestInit) => {
      if (String(input).includes('/api/data/import')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ detail: 'Import falló' }),
          text: async () => '{"detail":"Import falló"}',
        });
      }
      return server.fetchMock(input, init);
    });
    vi.stubGlobal('fetch', failing);

    const user = userEvent.setup();
    await screen.findByRole('region', { name: /^El libro/i });
    await user.click(screen.getByRole('button', { name: /importar/i }));
    await user.upload(
      screen.getByLabelText('Archivo JSON a importar'),
      importFile('bad.json', { version: 1, movements: [], budgets: {} }),
    );

    expect(await screen.findByText('Import falló')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Los números del mes' })).toBeInTheDocument();
    await waitFor(() => expect(liveStatusText()).toBe('Import falló'));
  });
});
