import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Board } from './Board';
import { renderAppTree } from '../test/render';
import { MONTH, day } from '../test/seed';
import { dayLabel, formatDateDisplay } from '../lib/month';
import { pinsKey } from '../lib/pins';
import type { Movement } from '../api/types';

const LABELS: Record<string, string> = {
  alquiler: 'Alquiler',
  deudas: 'Deudas',
  ocio: 'Ocio',
  sueldo: 'Sueldo',
  supermercado: 'Supermercado',
  transporte: 'Transporte',
};
const labelOf = (id: string) => LABELS[id] ?? id;
const accountNameOf = (movement: Movement) => movement.account_name ?? '';

beforeEach(() => {
  window.localStorage.clear();
});

function movement(id: number, dayOfMonth: number, overrides: Partial<Movement> = {}): Movement {
  const date = day(MONTH, dayOfMonth);
  return {
    id,
    type: 'gasto',
    category_id: 'supermercado',
    account_id: 1,
    account_name: 'Binance',
    is_debt_payment: false,
    amount_cents: id * 1_000,
    entry_currency: 'USD',
    entry_amount_cents: id * 1_000,
    rate_micros: null,
    date,
    note: '',
    items: [],
    created_at: `${date}T10:00:00-03:00`,
    ...overrides,
  };
}

interface SetupOptions {
  filter?: string;
  flashId?: number | null;
}

function setup(movements: Movement[], options: SetupOptions = {}) {
  const onFilterChange = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  renderAppTree(
    <Board
      month={MONTH}
      movements={movements}
      labelOf={labelOf}
      accountNameOf={accountNameOf}
      filter={options.filter ?? 'all'}
      onFilterChange={onFilterChange}
      onEdit={onEdit}
      onDelete={onDelete}
      flashId={options.flashId ?? null}
    />,
  );
  return { onFilterChange, onEdit, onDelete };
}

/** The whole board region, filter selects included. */
function board(): HTMLElement {
  return screen.getByRole('region', { name: /^El tablero/i });
}

/** Only the mosaic, so a text query never lands on a select's options. */
function mosaic(): HTMLElement {
  return screen.getByRole('list', { name: 'Días del mes' });
}

function pinnedStrip(): HTMLElement {
  return screen.getByRole('region', { name: /^Fijadas/i });
}

/** The mosaic's day blocks: each day heading's own block. */
function dayBlocks(): HTMLElement[] {
  return within(mosaic())
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.closest('.day') as HTMLElement);
}

describe('Board', () => {
  it('lays the month out as day blocks and pages them six days at a time', async () => {
    const user = userEvent.setup();
    setup(Array.from({ length: 15 }, (_, index) => movement(index + 1, index + 1)));

    // Newest day first: the 15th heads the first page.
    expect(dayBlocks()).toHaveLength(6);
    expect(within(mosaic()).getByText(dayLabel(day(MONTH, 15)))).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
    expect(screen.getByText('Tandas 1–6 de 15')).toBeInTheDocument();
    expect(within(board()).getByText('(15)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
    expect(screen.getByText('Tandas 7–12 de 15')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Página 3 de 3')).toBeInTheDocument();
    expect(screen.getByText('Tandas 13–15 de 15')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('gathers every movement of a day into one block', () => {
    setup([movement(1, 4), movement(2, 4, { category_id: 'ocio' }), movement(3, 3)]);

    const blocks = dayBlocks();
    expect(blocks).toHaveLength(2);
    expect(within(blocks[0]).getByText('2 facturas')).toBeInTheDocument();
    expect(within(blocks[1]).getByText('1 factura')).toBeInTheDocument();
  });

  it('sends the reader back to the first page when the search changes', async () => {
    const user = userEvent.setup();
    setup(Array.from({ length: 15 }, (_, index) => movement(index + 1, index + 1)));

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();

    // Every factura still matches, so the result keeps its three pages, but
    // typing must send the reader back to the first one.
    await user.type(screen.getByLabelText('Buscar'), 'supermercado');
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
    expect(screen.getByText('Tandas 1–6 de 15')).toBeInTheDocument();
  });

  it('searches every field of a factura, ignoring accents and case', async () => {
    const user = userEvent.setup();
    setup([
      movement(1, 3, { category_id: 'alquiler', note: 'Departamento', account_name: 'Binance' }),
      movement(2, 4, { category_id: 'ocio', note: 'Cine', account_name: 'Efectivo' }),
    ]);
    const search = screen.getByLabelText('Buscar');

    // Accent-insensitive category label: «alquiler» matches «Alquiler».
    await user.type(search, 'alquiler');
    expect(within(mosaic()).getByText('Alquiler')).toBeInTheDocument();
    expect(within(mosaic()).queryByText('Ocio')).not.toBeInTheDocument();

    // The note and the wallet name are matched too.
    await user.clear(search);
    await user.type(search, 'cine');
    expect(within(mosaic()).getByText('Cine')).toBeInTheDocument();
    expect(within(mosaic()).queryByText('Departamento')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'efectivo');
    expect(within(mosaic()).getByText('Ocio')).toBeInTheDocument();
    expect(within(mosaic()).queryByText('Alquiler')).not.toBeInTheDocument();
  });

  it('finds a factura by the description of one of its detail lines', async () => {
    const user = userEvent.setup();
    setup([
      movement(1, 3, {
        category_id: 'alquiler',
        items: [{ description: 'Honorarios del contador', amount_cents: 45_000 }],
      }),
      movement(2, 4, { category_id: 'ocio', note: 'Cine' }),
    ]);

    // The line description is part of the haystack, so it finds its factura
    // even though the header fields never mention it.
    await user.type(screen.getByLabelText('Buscar'), 'contador');

    expect(within(mosaic()).getByText('Honorarios del contador')).toBeInTheDocument();
    expect(within(mosaic()).getByText('Alquiler')).toBeInTheDocument();
    expect(within(mosaic()).queryByText('Ocio')).not.toBeInTheDocument();
  });

  it('narrows the board by type', async () => {
    const user = userEvent.setup();
    setup([movement(1, 3), movement(2, 4, { type: 'ingreso', category_id: 'sueldo' })]);

    await user.selectOptions(screen.getByLabelText('Tipo'), 'ingreso');
    expect(within(mosaic()).getByText('Sueldo')).toBeInTheDocument();
    expect(within(mosaic()).queryByText('Supermercado')).not.toBeInTheDocument();
  });

  it('honours the category the document asked to filter by', () => {
    setup([movement(1, 3), movement(2, 4, { category_id: 'ocio' })], { filter: 'ocio' });

    expect(screen.getByLabelText('Filtrar por categoría')).toHaveValue('ocio');
    expect(within(mosaic()).getByText('Ocio')).toBeInTheDocument();
    expect(within(mosaic()).queryByText('Supermercado')).not.toBeInTheDocument();
  });

  it('falls back to every category when the chosen one left the month', () => {
    setup([movement(1, 3)], { filter: 'ocio' });

    expect(screen.getByLabelText('Filtrar por categoría')).toHaveValue('all');
    expect(within(mosaic()).getByText('Supermercado')).toBeInTheDocument();
  });

  it('lifts a pinned factura out of its day, into the strip, and remembers it', async () => {
    const user = userEvent.setup();
    setup([movement(1, 3), movement(2, 4, { category_id: 'ocio' })]);

    expect(within(mosaic()).getByText('Ocio')).toBeInTheDocument();
    expect(pinnedStrip().textContent).toContain('Todavía no fijaste ninguna factura.');

    await user.click(screen.getByRole('button', { name: /^Fijar en el tablero: Ocio/ }));

    // The factura leaves the mosaic; its day, now empty, goes with it.
    expect(within(mosaic()).queryByText('Ocio')).not.toBeInTheDocument();
    expect(dayBlocks()).toHaveLength(1);
    // And it waits above, where paging cannot reach it.
    expect(within(pinnedStrip()).getByText('Ocio')).toBeInTheDocument();
    expect(within(pinnedStrip()).getByText('(1)')).toBeInTheDocument();
    // A pinned factura keeps its date: it is no longer under its day head.
    expect(within(pinnedStrip()).getByText(formatDateDisplay(day(MONTH, 4)))).toBeInTheDocument();
    expect(window.localStorage.getItem(pinsKey(MONTH))).toBe('[2]');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Fijada la factura de Ocio'),
    );
  });

  it('drops a pinned factura back into its day', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(pinsKey(MONTH), '[2]');
    setup([movement(1, 3), movement(2, 4, { category_id: 'ocio' })]);

    expect(pinnedStrip().textContent).toContain('Ocio');

    await user.click(screen.getByRole('button', { name: /^Soltar del tablero: Ocio/ }));

    expect(within(pinnedStrip()).queryByText('Ocio')).not.toBeInTheDocument();
    expect(within(mosaic()).getByText('Ocio')).toBeInTheDocument();
    expect(dayBlocks()).toHaveLength(2);
    expect(window.localStorage.getItem(pinsKey(MONTH))).toBe('[]');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Soltada la factura de Ocio'),
    );
  });

  it('opens with the pins this browser already had for the month', () => {
    window.localStorage.setItem(pinsKey(MONTH), '[2]');
    setup([movement(1, 3), movement(2, 4, { category_id: 'ocio' })]);

    expect(within(pinnedStrip()).getByText('Ocio')).toBeInTheDocument();
    expect(within(mosaic()).queryByText('Ocio')).not.toBeInTheDocument();
  });

  it('tells an empty month apart from an empty filter result', async () => {
    const user = userEvent.setup();
    setup([movement(1, 3)]);

    await user.type(screen.getByLabelText('Buscar'), 'zzz');
    expect(screen.getByText('Ningún movimiento coincide con los filtros.')).toBeInTheDocument();
    expect(screen.queryByText('Todavía no cargaste movimientos este mes.')).not.toBeInTheDocument();
  });

  it('says so when the month has nothing in it yet', () => {
    setup([]);

    expect(screen.getByText('Todavía no cargaste movimientos este mes.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Días del mes' })).not.toBeInTheDocument();
    expect(within(board()).getByText('(0)')).toBeInTheDocument();
  });

  it('numbers the facturas correlatively and flags the one just written', () => {
    setup([movement(1, 3), movement(2, 4, { category_id: 'ocio' })], { flashId: 2 });

    expect(within(mosaic()).getByText('Nº 01')).toBeInTheDocument();
    expect(within(mosaic()).getByText('Nº 02')).toBeInTheDocument();
    // Every factura carries its own date, not only the day head above it.
    expect(within(mosaic()).getByText(formatDateDisplay(day(MONTH, 3)))).toBeInTheDocument();
    expect(within(mosaic()).getByText(formatDateDisplay(day(MONTH, 4)))).toBeInTheDocument();

    // The flag rides on the ticket's list item: that is the one the sheet inks in.
    const written = within(mosaic()).getByText('Ocio').closest('li') as HTMLElement;
    const untouched = within(mosaic()).getByText('Supermercado').closest('li') as HTMLElement;
    expect(written).toHaveClass('flash');
    expect(untouched).not.toHaveClass('flash');
  });

  it('keeps the bolívar amount in the pen under the dollar figure', () => {
    setup([
      movement(1, 3, {
        entry_currency: 'VES',
        entry_amount_cents: 400_000,
        rate_micros: 40_000_000,
        amount_cents: 10_000,
      }),
    ]);

    expect(within(mosaic()).getByText('-$ 100')).toBeInTheDocument();
    expect(within(mosaic()).getByText('Bs 4.000,00 @ 40')).toBeInTheDocument();
  });

  it('renders a VES movement breakdown in bolívares', () => {
    setup([
      movement(1, 3, {
        entry_currency: 'VES',
        entry_amount_cents: 400_000,
        rate_micros: 40_000_000,
        amount_cents: 10_000,
        items: [
          { description: 'Leche', amount_cents: 250_000 },
          { description: 'Pan', amount_cents: 150_000 },
        ],
      }),
    ]);

    const factura = within(mosaic()).getByText('Leche').closest('.fact') as HTMLElement;
    const breakdown = factura.querySelector('.fact-items') as HTMLElement;
    expect(breakdown).toBeTruthy();
    // The lines are shown in bolívares, like the pen, with no per-line USD figure.
    expect(within(breakdown).getByText('Bs 2.500,00')).toBeInTheDocument();
    expect(within(breakdown).getByText('Bs 1.500,00')).toBeInTheDocument();
    expect(within(breakdown).queryByText(/\$/)).not.toBeInTheDocument();

    // The header stays USD; the pen keeps the Bs total at the rate.
    expect(within(factura).getByText('-$ 100')).toBeInTheDocument();
    expect(within(factura).getByText('Bs 4.000,00 @ 40')).toBeInTheDocument();
  });

  it('sends a debt payment to the wallets instead of offering an edit', () => {
    setup([movement(1, 3, { is_debt_payment: true, category_id: 'deudas' })]);

    expect(screen.getByText('Pago de deuda')).toBeInTheDocument();
    expect(screen.getByText('desde carteras')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar movimiento/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Borrar movimiento/ })).toBeInTheDocument();
  });

  it('hands edit and delete back to the document, named for what they act on', async () => {
    const user = userEvent.setup();
    const { onEdit, onDelete } = setup([movement(7, 3)]);

    const edit = screen.getByRole('button', { name: /^Editar movimiento: Supermercado/ });
    const label = edit.getAttribute('aria-label') ?? '';
    expect(label).toMatch(/\$\s70/);
    expect(label).toContain(formatDateDisplay(day(MONTH, 3)));

    await user.click(edit);
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));

    await user.click(screen.getByRole('button', { name: /^Borrar movimiento: Supermercado/ }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it('reports a category filter change to the document', async () => {
    const user = userEvent.setup();
    const { onFilterChange } = setup([movement(1, 3), movement(2, 4, { category_id: 'ocio' })]);

    await user.selectOptions(screen.getByLabelText('Filtrar por categoría'), 'ocio');
    expect(onFilterChange).toHaveBeenCalledWith('ocio');
  });
});
