import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthGate } from '../auth/AuthGate';
import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createFakeServer,
  DEFAULT_SESSION,
  type FakeSession,
} from '../test/fakeServer';
import { renderAppTree } from '../test/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Render the whole gate over a signed-out API, so a login leads to the ledger. */
function mount(session: Partial<FakeSession> = {}) {
  const server = createFakeServer({ session: { ...DEFAULT_SESSION, ...session } });
  vi.stubGlobal('fetch', server.fetchMock);
  renderAppTree(<AuthGate />);
  return server;
}

function loginCalls(server: ReturnType<typeof createFakeServer>): number {
  return server.fetchMock.mock.calls.filter((call) =>
    String(call[0]).includes('/api/auth/login'),
  ).length;
}

describe('LoginScreen', () => {
  it('refuses a wrong password with the generic message and does not sign in', async () => {
    const server = mount({ authed: false });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Usuario'), ADMIN_USERNAME);
    await user.type(screen.getByLabelText('Contraseña'), 'equivocada');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Usuario o contraseña incorrectos.')).toBeInTheDocument();
    expect(server.db.session.authed).toBe(false);
    expect(screen.queryByRole('region', { name: 'Los números del mes' })).not.toBeInTheDocument();
  });

  it('empties the password field after a rejection', async () => {
    mount({ authed: false });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Usuario'), ADMIN_USERNAME);
    await user.type(screen.getByLabelText('Contraseña'), 'equivocada');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await screen.findByText('Usuario o contraseña incorrectos.');
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
  });

  it('signs in and shows the ledger', async () => {
    const server = mount({ authed: false });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Usuario'), ADMIN_USERNAME);
    await user.type(screen.getByLabelText('Contraseña'), ADMIN_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('region', { name: 'Los números del mes' })).toBeInTheDocument();
    expect(server.db.session.authed).toBe(true);
  });

  it('requires both fields before touching the API', async () => {
    const server = mount({ authed: false });
    const user = userEvent.setup();

    await screen.findByLabelText('Usuario');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Error: Escribí tu usuario.')).toBeInTheDocument();
    expect(screen.getByText('Error: Escribí tu contraseña.')).toBeInTheDocument();
    expect(loginCalls(server)).toBe(0);
  });

  it('voices the failure in the app live region', async () => {
    mount({ authed: false });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Usuario'), ADMIN_USERNAME);
    await user.type(screen.getByLabelText('Contraseña'), 'equivocada');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await screen.findByText('Usuario o contraseña incorrectos.');
    await waitFor(() =>
      expect(screen.getByRole('status').textContent ?? '').toContain('incorrectos'),
    );
  });
});
