import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { CATEGORIES, createFakeServer, type FakeDb, type FakeServer, type StoredAccount } from './test/fakeServer';
import { renderAppTree } from './test/render';
import { MONTH, day, money } from './test/seed';
import type { Movement, MovementType } from './api/types';

let server: FakeServer;

afterEach(() => {
  vi.unstubAllGlobals();
});

function movement(
  id: number,
  type: MovementType,
  categoryId: string,
  cents: number,
  date: string,
  accountId: number,
  accountName: string,
): Movement {
  return {
    id,
    type,
    category_id: categoryId,
    account_id: accountId,
    account_name: accountName,
    is_debt_payment: false,
    amount_cents: cents,
    entry_currency: 'USD',
    entry_amount_cents: cents,
    rate_micros: null,
    date,
    note: '',
    items: [],
    created_at: `${date}T10:00:00-03:00`,
  };
}

const ACCOUNTS: StoredAccount[] = [
  { id: 1, name: 'Cartera USD', opening_balance_cents: 0, sort_order: 1 },
  { id: 2, name: 'Binance', opening_balance_cents: -60_000, sort_order: 2 },
];

/** A wallet-based fixture: one active wallet, one debt wallet and an income. */
function debtSeed(extra: Partial<FakeDb> = {}): Partial<FakeDb> {
  return {
    categories: CATEGORIES,
    accounts: ACCOUNTS,
    movements: [
      movement(1, 'ingreso', 'sueldo', 1_000_000, day(MONTH, 1), 1, 'Cartera USD'),
    ],
    budgets: {},
    nextId: 2,
    nextAccountId: 3,
    ...extra,
  };
}

function mount(seed: Partial<FakeDb>): void {
  server = createFakeServer(seed);
  vi.stubGlobal('fetch', server.fetchMock);
}

function accountRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Las carteras' });
}

describe('App · carteras y deudas', () => {
  it('shows the outstanding-debt objective and per-wallet debt progress', async () => {
    mount(debtSeed());
    renderAppTree(<App />);

    const accounts = await screen.findByRole('region', { name: 'Las carteras' });
    expect(within(accounts).getByText('Objetivo: eliminar la deuda')).toBeInTheDocument();
    expect(within(accounts).getByText(money(60_000))).toBeInTheDocument();

    expect(within(accounts).getByText('Binance', { selector: 'span.account-name' })).toBeInTheDocument();
    expect(within(accounts).getByText('Deuda')).toBeInTheDocument();
    expect(within(accounts).getByText(`Restante ${money(60_000)}`)).toBeInTheDocument();
    const bar = within(accounts).getByRole('progressbar', { name: 'Binance: deuda pagada' });
    expect(bar).toHaveAttribute('aria-valuenow', '0');
  });

  it('creates a new wallet from the panel', async () => {
    mount(debtSeed());
    const user = userEvent.setup();
    renderAppTree(<App />);

    const accounts = await screen.findByRole('region', { name: 'Las carteras' });
    await user.click(within(accounts).getByRole('button', { name: 'Nueva cartera' }));
    await user.type(within(accounts).getByLabelText('Nombre de la cartera'), 'Ahorro USD');
    await user.type(within(accounts).getByLabelText('Saldo inicial (USD)'), '1000');
    await user.click(within(accounts).getByRole('button', { name: 'Crear cartera' }));

    await waitFor(() => expect(server.db.accounts.some((account) => account.name === 'Ahorro USD')).toBe(true));
    await waitFor(() =>
      expect(
        within(accountRegion()).getByText('Ahorro USD', { selector: 'span.account-name' }),
      ).toBeInTheDocument(),
    );
    expect(server.fetchMock.mock.calls.some(([input, init]) => String(input).includes('/api/accounts') && init?.method === 'POST')).toBe(true);
  });

  it('validates the new-wallet form inline', async () => {
    mount(debtSeed());
    const user = userEvent.setup();
    renderAppTree(<App />);

    const accounts = await screen.findByRole('region', { name: 'Las carteras' });
    await user.click(within(accounts).getByRole('button', { name: 'Nueva cartera' }));
    await user.click(within(accounts).getByRole('button', { name: 'Crear cartera' }));

    expect(await screen.findByText('Error: Ingresá un nombre para la cartera.')).toBeInTheDocument();
    expect(within(accounts).getByLabelText('Nombre de la cartera')).toHaveFocus();
    expect(server.db.accounts).toHaveLength(2);
  });

  it('registers a debt payment that reduces the debt and shows as a month expense', async () => {
    mount(debtSeed());
    const user = userEvent.setup();
    renderAppTree(<App />);

    const accounts = await screen.findByRole('region', { name: 'Las carteras' });
    expect(within(accounts).getByText(`Restante ${money(60_000)}`)).toBeInTheDocument();

    await user.click(within(accounts).getByRole('button', { name: 'Registrar pago de Binance' }));
    await user.type(within(accounts).getByLabelText('Monto del pago (USD)'), '200');
    await user.click(within(accounts).getByRole('button', { name: 'Registrar pago' }));

    await waitFor(() => expect(server.db.movements).toHaveLength(2));
    const payment = server.db.movements.find((item) => item.is_debt_payment);
    expect(payment).toMatchObject({ category_id: 'deudas', type: 'gasto', account_id: 2, amount_cents: 20_000 });

    // Balance moves toward 0: remaining drops from $600 to $400 (33% paid).
    await waitFor(() =>
      expect(within(accountRegion()).getByText(`Restante ${money(40_000)}`)).toBeInTheDocument(),
    );
    const bar = within(accountRegion()).getByRole('progressbar', { name: 'Binance: deuda pagada' });
    expect(bar).toHaveAttribute('aria-valuenow', '33');

    // The payment shows as a month expense with the debt badge.
    const movements = await screen.findByRole('region', { name: /^El tablero/i });
    expect(within(movements).getByText('Pago de deuda')).toBeInTheDocument();
    await waitFor(() => expect(within(movements).getByText('-$ 200')).toBeInTheDocument());

    const kpi = await screen.findByRole('region', { name: 'Los números del mes' });
    await waitFor(() => expect(within(kpi).getByText(money(20_000))).toBeInTheDocument());
  });

  it('filters movements and derived views by wallet', async () => {
    mount(
      debtSeed({
        movements: [
          movement(1, 'gasto', 'supermercado', 1_000_000, day(MONTH, 3), 1, 'Cartera USD'),
          movement(2, 'gasto', 'ocio', 2_000_000, day(MONTH, 4), 2, 'Binance'),
        ],
        nextId: 3,
      }),
    );
    const user = userEvent.setup();
    renderAppTree(<App />);

    const board = await screen.findByRole('region', { name: /^El tablero/i });
    const mosaic = within(board).getByRole('list', { name: 'Días del mes' });
    expect(within(mosaic).getByText('Supermercado')).toBeInTheDocument();
    expect(within(mosaic).getByText('Ocio')).toBeInTheDocument();

    const filter = within(screen.getByRole('group', { name: 'Filtro de cartera' })).getByLabelText('Cartera');
    await user.selectOptions(filter, '2');

    // Only Binance's movement remains (the board re-mounts while the query refetches).
    await waitFor(() => {
      const filtered = within(
        within(screen.getByRole('region', { name: /^El tablero/i })).getByRole('list', {
          name: 'Días del mes',
        }),
      );
      expect(filtered.queryByText('Supermercado')).not.toBeInTheDocument();
      expect(filtered.getByText('Ocio')).toBeInTheDocument();
    });
    expect(server.fetchMock.mock.calls.some(([input]) => String(input).includes('account=2'))).toBe(true);
  });

  it('warns about the debt in the 25/15/50/10 plan while it exists', async () => {
    mount(debtSeed());
    renderAppTree(<App />);

    const plan = await screen.findByRole('region', { name: 'El plan 25/15/50/10' });
    expect(within(plan).getByText(`Tenés ${money(60_000)} de deuda.`)).toBeInTheDocument();
    expect(within(plan).getByText('Pagarla es la prioridad antes de asignar a los frascos.')).toBeInTheDocument();
  });
});
