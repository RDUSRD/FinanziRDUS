import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { createFakeServer, type FakeServer } from './test/fakeServer';
import { renderAppTree } from './test/render';
import { MONTH, buildSeed, buildSeedWithItems, money } from './test/seed';

let server: FakeServer;

beforeEach(() => {
  server = createFakeServer(buildSeed(MONTH));
  vi.stubGlobal('fetch', server.fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type User = ReturnType<typeof userEvent.setup>;

/**
 * Set a controlled field in a single shot. Typing char-by-char costs one render
 * per keystroke, which is not load-bearing here: these tests assert the form's
 * derived values and rules, never keystroke handling.
 */
function setFieldValue(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
}

/**
 * The tests below render and drive the real single-page sheet through jsdom, so
 * they are heavier than a unit test; each gets this explicit budget instead of
 * borrowing Vitest's 5s default (a global raise would hide genuinely hung tests).
 */
const FORM_TEST_TIMEOUT_MS = 15_000;

/**
 * Open the movement window, wait for the catalogue, and return its queries scoped
 * to the dialog. The whole sheet stays mounted behind it, so an unscoped query
 * walks every node (~400ms each) while a scoped one touches only the dialog.
 */
async function openMovementWindow(user: User) {
  await user.click(screen.getByRole('button', { name: /anotar movimiento/i }));
  const form = within(await screen.findByRole('dialog'));
  await form.findByLabelText('Monto en dólares');
  await waitFor(() => expect(form.getByLabelText('Categoría')).not.toBeEmptyDOMElement());
  return form;
}

describe('Movement detail lines', () => {
  it('derives the movement total from the lines and sends them', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);
    const form = await openMovementWindow(user);

    // A line hides the manual amount; the currency is left as it was (USD here).
    await user.click(form.getByRole('button', { name: 'Agregar línea' }));
    expect(form.queryByLabelText('Monto en dólares')).not.toBeInTheDocument();
    expect(form.getByRole('radio', { name: 'USD' })).toHaveAttribute('aria-checked', 'true');

    setFieldValue(form.getByLabelText('Descripción de la línea 1'), 'Leche');
    setFieldValue(form.getByLabelText('Precio de la línea 1'), '100');
    await user.click(form.getByRole('button', { name: 'Agregar línea' }));
    setFieldValue(form.getByLabelText('Descripción de la línea 2'), 'Pan');
    setFieldValue(form.getByLabelText('Precio de la línea 2'), '50,50');

    // The strip estimates the total of the typed lines ($100 + $50,50).
    expect(await form.findByText(/Total de líneas/)).toBeInTheDocument();
    expect(form.getByText(money(15_050))).toBeInTheDocument();

    await user.click(form.getByRole('button', { name: 'Agregar movimiento' }));

    await waitFor(() => expect(server.db.movements).toHaveLength(6));
    const created = server.db.movements.find((movement) => movement.id === 6);
    expect(created).toMatchObject({
      entry_currency: 'USD',
      rate_micros: null,
      amount_cents: 15_050,
      entry_amount_cents: 15_050,
      items: [
        { description: 'Leche', amount_cents: 10_000 },
        { description: 'Pan', amount_cents: 5_050 },
      ],
    });
  }, FORM_TEST_TIMEOUT_MS);

  it('shows the lines breakdown on the facturita', async () => {
    server = createFakeServer(buildSeedWithItems(MONTH));
    vi.stubGlobal('fetch', server.fetchMock);

    renderAppTree(<App />);

    const board = await screen.findByRole('region', { name: /^El tablero/i });
    const mosaic = within(board).getByRole('list', { name: 'Días del mes' });

    // The seeded movement carries its three lines under the concept.
    const factura = within(mosaic).getByText('Compra con detalle').closest('.fact') as HTMLElement;
    expect(factura).toBeTruthy();
    const breakdown = factura.querySelector('.fact-items') as HTMLElement;
    expect(breakdown).toBeTruthy();
    expect(within(breakdown).getAllByRole('listitem')).toHaveLength(3);
    expect(within(breakdown).getByText('Leche')).toBeInTheDocument();
    expect(within(breakdown).getByText('Pan')).toBeInTheDocument();
    expect(within(breakdown).getByText('Café')).toBeInTheDocument();

    // Each line shows its own price; the total stays in the header.
    expect(within(breakdown).getByText(money(1_200_000))).toBeInTheDocument();
    expect(within(factura).getByText('-$ 30.000')).toBeInTheDocument();
  });

  it('keeps the currency switch enabled while lines exist', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);
    const form = await openMovementWindow(user);

    // A line no longer pins the currency: both options stay selectable.
    await user.click(form.getByRole('button', { name: 'Agregar línea' }));
    expect(form.getByRole('radio', { name: 'USD' })).not.toBeDisabled();
    expect(form.getByRole('radio', { name: 'VES' })).not.toBeDisabled();

    // Switching to VES keeps the line on screen.
    await user.click(form.getByRole('radio', { name: 'VES' }));
    expect(form.getByRole('radio', { name: 'VES' })).toHaveAttribute('aria-checked', 'true');
    expect(form.getByLabelText('Descripción de la línea 1')).toBeInTheDocument();
  }, FORM_TEST_TIMEOUT_MS);

  it('sums a VES movement lines in bolívares and converts them once with the rate', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);
    const form = await openMovementWindow(user);

    // VES first, then the lines: the entry stays in bolívares.
    await user.click(form.getByRole('radio', { name: 'VES' }));
    await user.click(form.getByRole('button', { name: 'Agregar línea' }));
    setFieldValue(form.getByLabelText('Descripción de la línea 1'), 'Servicio');
    setFieldValue(form.getByLabelText('Precio de la línea 1'), '4.000,00');
    await user.click(form.getByRole('button', { name: 'Agregar línea' }));
    setFieldValue(form.getByLabelText('Descripción de la línea 2'), 'Flete');
    setFieldValue(form.getByLabelText('Precio de la línea 2'), '1.000,00');
    await user.type(form.getByLabelText('Tasa (Bs por USD)'), '40');

    // The strip sums the lines in Bs and estimates their USD equivalent.
    expect(await form.findByText(/Total de líneas/)).toBeInTheDocument();
    expect(form.getByText('Bs 5.000,00')).toBeInTheDocument();
    expect(form.getByText('$ 125')).toBeInTheDocument();

    await user.click(form.getByRole('button', { name: 'Agregar movimiento' }));

    await waitFor(() => expect(server.db.movements).toHaveLength(6));
    const created = server.db.movements.find((movement) => movement.id === 6);
    expect(created).toMatchObject({
      entry_currency: 'VES',
      rate_micros: 40_000_000,
      entry_amount_cents: 500_000,
      amount_cents: 12_500,
      items: [
        { description: 'Servicio', amount_cents: 400_000 },
        { description: 'Flete', amount_cents: 100_000 },
      ],
    });
  }, FORM_TEST_TIMEOUT_MS);

  it('refuses a VES movement with lines when the rate is missing', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);
    const form = await openMovementWindow(user);

    await user.click(form.getByRole('radio', { name: 'VES' }));
    await user.click(form.getByRole('button', { name: 'Agregar línea' }));
    setFieldValue(form.getByLabelText('Descripción de la línea 1'), 'Servicio');
    setFieldValue(form.getByLabelText('Precio de la línea 1'), '4.000,00');
    await user.click(form.getByRole('button', { name: 'Agregar movimiento' }));

    expect(
      await form.findByText('Error: Ingresá una tasa válida en Bs por USD (por ejemplo 40).'),
    ).toBeInTheDocument();
    expect(form.getByLabelText('Tasa (Bs por USD)')).toHaveFocus();
    expect(server.db.movements).toHaveLength(5);
  }, FORM_TEST_TIMEOUT_MS);

  it('validates each line and focuses the first bad one', async () => {
    const user = userEvent.setup();
    renderAppTree(<App />);
    const form = await openMovementWindow(user);

    await user.click(form.getByRole('button', { name: 'Agregar línea' }));
    await user.click(form.getByRole('button', { name: 'Agregar movimiento' }));

    expect(
      await form.findByText('Error: Cada línea necesita una descripción de hasta 120 caracteres.'),
    ).toBeInTheDocument();
    expect(form.getByText('Error: El precio de una línea debe ser mayor a cero.')).toBeInTheDocument();

    const description = form.getByLabelText('Descripción de la línea 1');
    expect(description).toHaveAttribute('aria-invalid', 'true');
    expect(description).toHaveFocus();

    // Nothing was written: the form never left the window.
    expect(server.db.movements).toHaveLength(5);
  }, FORM_TEST_TIMEOUT_MS);
});
