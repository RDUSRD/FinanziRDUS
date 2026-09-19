import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Budgets } from './Budgets';
import type { BudgetsResponse } from '../api/types';

const DATA: BudgetsResponse = {
  month: '2026-09',
  total_cap_cents: 30_000,
  total_spent_cents: 23_500,
  items: [
    { category_id: 'supermercado', label: 'Supermercado', cap_cents: 10_000, spent_cents: 5_000, pct: 0.5, status: 'ok' },
    { category_id: 'transporte', label: 'Transporte', cap_cents: 10_000, spent_cents: 8_000, pct: 0.8, status: 'warn' },
    { category_id: 'ocio', label: 'Ocio', cap_cents: 10_000, spent_cents: 10_500, pct: 1.05, status: 'over' },
    { category_id: 'ropa', label: 'Ropa', cap_cents: 0, spent_cents: 2_000, pct: 0, status: 'none' },
  ],
};

function setup(busy = false) {
  const onSet = vi.fn();
  const onClear = vi.fn();
  const result = render(<Budgets data={DATA} onSet={onSet} onClear={onClear} busy={busy} />);
  return { onSet, onClear, ...result };
}

function progress(name: string): HTMLElement {
  return screen.getByRole('progressbar', { name: `${name}: gasto del mes contra el tope mensual` });
}

describe('Budgets', () => {
  it('reports the real percentage through aria-valuetext for each status', () => {
    setup();
    const region = screen.getByRole('region', { name: 'La lista · tope y gastado' });

    const ok = progress('Supermercado');
    expect(ok).toHaveAttribute('aria-valuenow', '50');
    expect(ok.getAttribute('aria-valuetext')).toContain('50%');
    expect(within(region).getByText('ok')).toBeInTheDocument();

    const warn = progress('Transporte');
    expect(warn).toHaveAttribute('aria-valuenow', '80');
    expect(warn.getAttribute('aria-valuetext')).toContain('80%');
    expect(within(region).getByText('cerca del tope')).toBeInTheDocument();

    const over = progress('Ocio');
    expect(over).toHaveAttribute('aria-valuenow', '100'); // bar is clamped...
    expect(over.getAttribute('aria-valuetext')).toContain('105%'); // ...but the text is not
    expect(over.getAttribute('aria-valuetext')).toContain('excedido');
    expect(within(region).getByText('excedido')).toBeInTheDocument();

    const none = progress('Ropa');
    expect(none.getAttribute('aria-valuetext')).toContain('sin tope definido');
    expect(within(region).getByText('sin tope')).toBeInTheDocument();
  });

  it('marks the warn and over rows with the matching classes', () => {
    setup();
    expect(progress('Transporte').closest('.row')).toHaveClass('warn');
    expect(progress('Ocio').closest('.row')).toHaveClass('over');
    expect(progress('Supermercado').closest('.row')).not.toHaveClass('warn');
    expect(progress('Supermercado').closest('.row')).not.toHaveClass('over');
  });

  it('commits a new cap on blur and a new cap via Enter', async () => {
    const { onSet, onClear } = setup();
    const user = userEvent.setup();

    const supermercado = screen.getByLabelText('Supermercado');
    await user.clear(supermercado);
    await user.type(supermercado, '200');
    await user.tab();
    expect(onClear).not.toHaveBeenCalled();
    expect(onSet).toHaveBeenCalledWith('supermercado', 20_000);

    const transporte = screen.getByLabelText('Transporte');
    await user.clear(transporte);
    await user.type(transporte, '150{Enter}');
    expect(onSet).toHaveBeenCalledWith('transporte', 15_000);
  });

  it('clears the cap when the input is emptied (only when a cap exists)', async () => {
    const { onSet, onClear } = setup();
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText('Supermercado'));
    await user.tab();
    expect(onClear).toHaveBeenCalledWith('supermercado');
    expect(onSet).not.toHaveBeenCalled();

    // "Ropa" has no cap, so emptying it must not issue a delete.
    await user.clear(screen.getByLabelText('Ropa'));
    await user.tab();
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the committed value is unchanged', async () => {
    const { onSet, onClear } = setup();
    const user = userEvent.setup();

    const supermercado = screen.getByLabelText('Supermercado');
    await user.clear(supermercado);
    await user.type(supermercado, '100'); // 10.000 cents == current cap
    await user.tab();

    expect(onSet).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
  });

  it('never recaptures focus when leaving the field by Tab, Shift+Tab or a click', async () => {
    const { onSet, onClear } = setup();
    const user = userEvent.setup();

    const supermercado = screen.getByLabelText('Supermercado');
    await user.click(supermercado);
    expect(supermercado).toHaveFocus();

    // Leaving by clicking another field must not bounce focus back.
    const transporte = screen.getByLabelText('Transporte');
    await user.click(transporte);
    expect(supermercado).not.toHaveFocus();
    expect(transporte).toHaveFocus();

    // Shift+Tab walks backwards out of the field without recapture.
    await user.tab({ shift: true });
    expect(transporte).not.toHaveFocus();

    // Tab forward from the re-focused input also leaves it behind.
    await user.click(transporte);
    await user.tab();
    expect(transporte).not.toHaveFocus();

    // Nothing changed, so no cap was set or cleared along the way.
    expect(onSet).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
  });

  it('disables every input while a mutation is in flight', () => {
    setup(true);
    expect(screen.getByLabelText('Supermercado')).toBeDisabled();
    expect(screen.getByLabelText('Ropa')).toBeDisabled();
  });
});
