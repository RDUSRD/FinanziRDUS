import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { AuthGate } from './AuthGate';
import { createFakeServer, DEFAULT_SESSION, type FakeSession } from '../test/fakeServer';
import { renderAppTree } from '../test/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Render the gate over a fake API with the given session state. */
function mount(session: Partial<FakeSession>) {
  const server = createFakeServer({ session: { ...DEFAULT_SESSION, ...session } });
  vi.stubGlobal('fetch', server.fetchMock);
  renderAppTree(<AuthGate />);
  return server;
}

describe('AuthGate', () => {
  it('shows the login while there is no session', async () => {
    mount({ authed: false });

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByLabelText('Usuario')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Los números del mes' })).not.toBeInTheDocument();
  });

  it('shows the ledger when the cookie opens the API', async () => {
    mount({});

    expect(await screen.findByRole('region', { name: 'Los números del mes' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument();
  });

  it('forces the password change while the bootstrap credential is in place', async () => {
    mount({ mustChangePassword: true });

    expect(await screen.findByRole('heading', { name: 'Elegí tu contraseña' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Los números del mes' })).not.toBeInTheDocument();
  });
});
