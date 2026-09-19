import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { createFakeServer, type FakeServer } from './test/fakeServer';
import { renderAppTree } from './test/render';
import { MONTH, buildSeed, money } from './test/seed';
import { shiftMonth, todayStr } from './lib/month';

let server: FakeServer;

beforeEach(() => {
  server = createFakeServer(buildSeed(MONTH));
  vi.stubGlobal('fetch', server.fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The single live region's text, with NBSP normalized to plain spaces. */
function liveStatusText(): string {
  return (screen.getByRole('status').textContent ?? '').replace(/\u00a0/g, ' ');
}

/** Did any request hit `substring` with the given HTTP method? */
function requestedWith(method: string, substring: string): boolean {
  return server.fetchMock.mock.calls.some(
    ([input, init]) => String(input).includes(substring) && (init?.method ?? 'GET') === method,
  );
}

describe('App mutations', () => {
  it('announces the fresh balance after adding a movement', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);

    await user.click(screen.getByRole('button', { name: /anotar movimiento/i }));
    const amount = await screen.findByLabelText('Monto en dólares');
    await user.type(amount, '1000');
    await user.click(screen.getByRole('button', { name: 'Agregar movimiento' }));

    await waitFor(() => expect(server.db.movements).toHaveLength(6));
    await waitFor(() =>
      expect(liveStatusText()).toContain(`Movimiento agregado. Te queda ${money(93_200_000)}.`),
    );
  });

  it('edits a movement with PATCH, refreshing the table, the KPIs and the balance', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);

    const movements = await screen.findByRole('region', { name: /^El libro/i });
    await user.click(within(movements).getByRole('button', { name: /Editar movimiento: Supermercado/ }));

    const amount = await screen.findByLabelText('Monto en dólares');
    await waitFor(() => expect(amount).toHaveValue('85000'));
    await user.clear(amount);
    await user.type(amount, '50000');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(server.db.movements.find((m) => m.id === 1)?.amount_cents).toBe(5_000_000));
    expect(requestedWith('PATCH', '/api/movements/1')).toBe(true);

    const table = within(await screen.findByRole('region', { name: /^El libro/i }));
    await waitFor(() => expect(table.getByText('-$ 50.000')).toBeInTheDocument());
    expect(table.queryByText('-$ 85.000')).not.toBeInTheDocument();

    const kpi = screen.getByRole('region', { name: 'Los números del mes' });
    await waitFor(() => expect(within(kpi).getByText(money(41_200_000))).toBeInTheDocument());
    await waitFor(() => expect(within(kpi).getByText(money(96_800_000))).toBeInTheDocument());
    await waitFor(() =>
      expect(liveStatusText()).toContain(`Movimiento actualizado. Te queda ${money(96_800_000)}.`),
    );
  });

  it('deletes a movement after confirmation and refreshes the KPIs', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);

    const movements = await screen.findByRole('region', { name: /^El libro/i });
    await user.click(within(movements).getByRole('button', { name: /Borrar movimiento: Supermercado/ }));
    await user.click(screen.getByRole('button', { name: 'Borrar movimiento' }));

    await waitFor(() => expect(server.db.movements).toHaveLength(4));
    expect(requestedWith('DELETE', '/api/movements/1')).toBe(true);

    const table = within(await screen.findByRole('region', { name: /^El libro/i }));
    await waitFor(() => expect(table.queryByText('-$ 85.000')).not.toBeInTheDocument());

    const kpi = screen.getByRole('region', { name: 'Los números del mes' });
    await waitFor(() => expect(within(kpi).getByText(money(36_200_000))).toBeInTheDocument());
    await waitFor(() =>
      expect(liveStatusText()).toContain(`Movimiento borrado. Te queda ${money(101_800_000)}.`),
    );
  });

  it('does not delete when the confirmation is dismissed', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);

    const movements = await screen.findByRole('region', { name: /^El libro/i });
    await user.click(within(movements).getByRole('button', { name: /Borrar movimiento: Supermercado/ }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(server.db.movements).toHaveLength(5);
    expect(requestedWith('DELETE', '/api/movements/1')).toBe(false);
  });

  it('keeps the draft while the movement window is open and starts fresh when reopened', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);

    // The inline form is gone: the draft now lives inside the modal window,
    // which blocks the board, so the notes stay until the window is closed.
    await user.click(screen.getByRole('button', { name: /anotar movimiento/i }));
    const note = await screen.findByLabelText('Nota (opcional)');
    await user.type(note, 'borrador');
    expect(screen.getByLabelText('Nota (opcional)')).toHaveValue('borrador');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /anotar movimiento/i }));
    expect(await screen.findByLabelText('Nota (opcional)')).toHaveValue('');
  });

  it('defaults the new-movement date to the viewed month', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);

    await user.click(screen.getByRole('button', { name: /anotar movimiento/i }));
    expect(await screen.findByLabelText('Fecha')).toHaveValue(todayStr());
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Mes anterior' }));

    await user.click(screen.getByRole('button', { name: /anotar movimiento/i }));
    await waitFor(() =>
      expect(screen.getByLabelText('Fecha')).toHaveValue(`${shiftMonth(MONTH, -1)}-01`),
    );
  });

  it('resets the form when an active edit is cancelled', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);

    const movements = await screen.findByRole('region', { name: /^El libro/i });
    await user.click(within(movements).getByRole('button', { name: /Editar movimiento: Supermercado/ }));

    const amount = await screen.findByLabelText('Monto en dólares');
    await waitFor(() => expect(amount).toHaveValue('85000'));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Reopening for a new movement starts from a clean slate.
    await user.click(screen.getByRole('button', { name: /anotar movimiento/i }));
    expect(await screen.findByLabelText('Monto en dólares')).toHaveValue('');
    expect(screen.getByText('Nuevo movimiento')).toBeInTheDocument();
  });

  it('sets a budget on blur and never recaptures focus', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);

    const input = await screen.findByLabelText('Supermercado');
    await user.clear(input);
    await user.type(input, '600');
    await user.tab();

    await waitFor(() => expect(server.db.budgets.supermercado).toBe(60_000));
    expect(requestedWith('PUT', '/api/budgets/supermercado')).toBe(true);
    // Blur must never move focus back into the field (regression guard for the
    // old trap): Tab walks on to the next cap instead.
    expect(screen.getByLabelText('Supermercado')).not.toHaveFocus();
    expect(screen.getByLabelText('Comidas afuera')).toHaveFocus();
    await waitFor(() =>
      expect(liveStatusText()).toContain(`Presupuesto actualizado. Te queda ${money(93_300_000)}.`),
    );
  });

  it('clears a budget when the cap is emptied and announces the balance', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);

    const input = await screen.findByLabelText('Supermercado');
    await user.clear(input);
    await user.tab();

    await waitFor(() => expect(server.db.budgets.supermercado).toBeUndefined());
    expect(requestedWith('DELETE', '/api/budgets/supermercado')).toBe(true);
    await waitFor(() => expect(screen.getByLabelText('Supermercado')).toHaveValue(''));
    await waitFor(() =>
      expect(liveStatusText()).toContain(`Presupuesto borrado. Te queda ${money(93_300_000)}.`),
    );
  });

  it('previews the USD equivalent of a VES entry and stores the original Bs + rate', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);

    // Open the window, then switch the entry currency to bolívares.
    await user.click(screen.getByRole('button', { name: /anotar movimiento/i }));
    await user.click(await screen.findByRole('radio', { name: 'VES' }));

    const amount = screen.getByLabelText('Monto en bolívares');
    await user.type(amount, '4.000,00');
    await user.type(screen.getByLabelText('Tasa (Bs por USD)'), '40');

    // 4.000,00 Bs at 40 Bs/USD = $100.
    expect(await screen.findByText('= $ 100 (a Bs 40/USD)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Agregar movimiento' }));

    await waitFor(() => expect(server.db.movements).toHaveLength(6));
    const created = server.db.movements.find((movement) => movement.id === 6);
    expect(created).toMatchObject({
      entry_currency: 'VES',
      entry_amount_cents: 400_000,
      rate_micros: 40_000_000,
      amount_cents: 10_000,
    });
  });

  it('requires a rate before saving a VES entry and focuses the field', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);

    await user.click(screen.getByRole('button', { name: /anotar movimiento/i }));
    await user.click(await screen.findByRole('radio', { name: 'VES' }));
    await user.type(screen.getByLabelText('Monto en bolívares'), '4000');
    await user.click(screen.getByRole('button', { name: 'Agregar movimiento' }));

    expect(
      await screen.findByText('Error: Ingresá una tasa válida en Bs por USD (por ejemplo 40).'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Tasa (Bs por USD)')).toHaveFocus();
    expect(server.db.movements).toHaveLength(5);
  });
});
