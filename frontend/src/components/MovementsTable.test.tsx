import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MovementsTable } from './MovementsTable';
import type { Movement } from '../api/types';

const LABELS: Record<string, string> = {
  alquiler: 'Alquiler',
  ocio: 'Ocio',
  supermercado: 'Supermercado',
};
const labelOf = (id: string) => LABELS[id] ?? id;
const accountNameOf = (movement: Movement) => movement.account_name ?? '';

function movement(id: number, overrides: Partial<Movement> = {}): Movement {
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
    date: `2026-09-${String((id % 28) + 1).padStart(2, '0')}`,
    note: '',
    created_at: `2026-09-01T00:${String(id).padStart(2, '0')}:00-03:00`,
    ...overrides,
  };
}

function setup(movements: Movement[]) {
  const onFilterChange = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  render(
    <MovementsTable
      movements={movements}
      labelOf={labelOf}
      accountNameOf={accountNameOf}
      filter="all"
      onFilterChange={onFilterChange}
      onEdit={onEdit}
      onDelete={onDelete}
    />,
  );
  return { onFilterChange, onEdit, onDelete };
}

/** The body rows only (the header row is dropped). */
function bodyRows(): HTMLElement[] {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1);
}

describe('MovementsTable', () => {
  it('pages the ledger 10 rows at a time with a range and a page indicator', async () => {
    const user = userEvent.setup();
    setup(Array.from({ length: 25 }, (_, index) => movement(index + 1)));

    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
    expect(screen.getByText('1–10 de 25')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByText('(25)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();
    expect(screen.getByText('11–20 de 25')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Página 3 de 3')).toBeInTheDocument();
    expect(screen.getByText('21–25 de 25')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('resets to the first page when the search changes', async () => {
    const user = userEvent.setup();
    setup(Array.from({ length: 25 }, (_, index) => movement(index + 1)));

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();

    // Every row matches, so the result still spans three pages, but typing
    // must send the user back to the first one.
    await user.type(screen.getByLabelText('Buscar'), 'supermercado');
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
    expect(screen.getByText('1–10 de 25')).toBeInTheDocument();
  });

  it('searches every visible field, ignoring accents and case', async () => {
    const user = userEvent.setup();
    setup([
      movement(1, { category_id: 'alquiler', note: 'Departamento', account_name: 'Binance' }),
      movement(2, { category_id: 'ocio', note: 'Cine', account_name: 'Efectivo' }),
    ]);
    const table = screen.getByRole('table');
    const search = screen.getByLabelText('Buscar');

    // Accent-insensitive category label: «alquiler» matches «Alquiler».
    await user.type(search, 'alquiler');
    expect(within(table).getByText('Alquiler')).toBeInTheDocument();
    expect(within(table).queryByText('Ocio')).not.toBeInTheDocument();

    // The note and the wallet name are matched too.
    await user.clear(search);
    await user.type(search, 'cine');
    expect(within(table).getByText('Cine')).toBeInTheDocument();
    expect(within(table).queryByText('Departamento')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'efectivo');
    expect(within(table).getByText('Ocio')).toBeInTheDocument();
    expect(within(table).queryByText('Alquiler')).not.toBeInTheDocument();
  });
});
