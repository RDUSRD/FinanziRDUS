import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminWindow } from './AdminWindow';
import { ADMIN_PASSWORD, createFakeServer } from '../test/fakeServer';
import { renderAppTree } from '../test/render';

afterEach(() => {
  vi.unstubAllGlobals();
});

function mount(open = true) {
  const onClose = vi.fn();
  const server = createFakeServer();
  vi.stubGlobal('fetch', server.fetchMock);
  renderAppTree(<AdminWindow open={open} onClose={onClose} />);
  return { server, onClose };
}

async function sessionList(): Promise<HTMLElement> {
  return screen.findByRole('list', { name: 'Sesiones activas' });
}

describe('AdminWindow · sesiones', () => {
  it('lists the live sessions, marking the current one', async () => {
    mount();
    const list = await sessionList();

    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Firefox en Linux')).toBeInTheDocument();
    expect(within(list).getByText('Chrome en macOS')).toBeInTheDocument();
    expect(within(list).getByText('Esta sesión')).toBeInTheDocument();
    expect(within(list).getByText(/127\.0\.0\.1/)).toBeInTheDocument();
    // The current session is a "way out", the others are remote closes.
    expect(within(list).getByRole('button', { name: 'Salir' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();
  });

  it('does not ask the API for sessions while the panel is closed', async () => {
    const { server } = mount(false);

    await waitFor(() => expect(server.db.session.authed).toBe(true));
    expect(
      server.fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes('/api/admin/sessions'),
      ),
    ).toHaveLength(0);
  });

  it('asks for confirmation and then closes another session remotely', async () => {
    const { server } = mount();
    const user = userEvent.setup();
    const list = await sessionList();

    await user.click(within(list).getByRole('button', { name: 'Cerrar' }));

    const confirm = await screen.findByRole('dialog', { name: 'Cerrar una sesión' });
    expect(within(confirm).getByText(/Chrome en macOS/)).toBeInTheDocument();

    await user.click(within(confirm).getByRole('button', { name: 'Cerrar la sesión' }));

    await waitFor(() => expect(server.db.session.others).toHaveLength(0));
    // This session stays: only the other device was cut off.
    expect(server.db.session.authed).toBe(true);
    await waitFor(() =>
      expect(within(screen.getByRole('list', { name: 'Sesiones activas' })).getAllByRole('listitem')).toHaveLength(1),
    );
  });

  it('closes nothing when the confirmation is dismissed', async () => {
    const { server } = mount();
    const user = userEvent.setup();
    const list = await sessionList();

    await user.click(within(list).getByRole('button', { name: 'Cerrar' }));
    const confirm = await screen.findByRole('dialog', { name: 'Cerrar una sesión' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }));

    expect(server.db.session.others).toHaveLength(1);
  });

  it('signs out when the current session is closed', async () => {
    const { server } = mount();
    const user = userEvent.setup();
    const list = await sessionList();

    await user.click(within(list).getByRole('button', { name: 'Salir' }));

    const confirm = await screen.findByRole('dialog', { name: 'Salir de esta sesión' });
    await user.click(within(confirm).getByRole('button', { name: 'Salir' }));

    await waitFor(() => expect(server.db.session.authed).toBe(false));
  });

  it('closes every session after confirmation', async () => {
    const { server } = mount();
    const user = userEvent.setup();

    await sessionList();
    await user.click(screen.getByRole('button', { name: 'Cerrar todas las sesiones' }));
    const confirm = await screen.findByRole('dialog', { name: 'Cerrar todas las sesiones' });

    await user.click(within(confirm).getByRole('button', { name: 'Cerrar todas' }));

    await waitFor(() => expect(server.db.session.authed).toBe(false));
    expect(server.db.session.others).toHaveLength(0);
  });
});

describe('AdminWindow · contraseña', () => {
  it('validates the new password locally before calling the API', async () => {
    const { server } = mount();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Contraseña actual'), ADMIN_PASSWORD);
    await user.type(screen.getByLabelText('Contraseña nueva'), 'corta');
    await user.type(screen.getByLabelText('Repetir la nueva'), 'corta');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(
      await screen.findByText('Error: La contraseña nueva necesita al menos 10 caracteres.'),
    ).toBeInTheDocument();
    expect(server.db.session.password).toBe(ADMIN_PASSWORD);
  });

  it('refuses a mismatched repetition', async () => {
    const { server } = mount();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Contraseña actual'), ADMIN_PASSWORD);
    await user.type(screen.getByLabelText('Contraseña nueva'), 'clave-nueva-larga');
    await user.type(screen.getByLabelText('Repetir la nueva'), 'clave-nueva-otra');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(
      await screen.findByText('Error: Las dos contraseñas nuevas no coinciden.'),
    ).toBeInTheDocument();
    expect(server.db.session.password).toBe(ADMIN_PASSWORD);
  });

  it('shows the backend message when the current password is wrong', async () => {
    const { server } = mount();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Contraseña actual'), 'no-es-la-actual');
    await user.type(screen.getByLabelText('Contraseña nueva'), 'clave-nueva-larga');
    await user.type(screen.getByLabelText('Repetir la nueva'), 'clave-nueva-larga');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    const messages = await screen.findAllByText('La contraseña actual no es correcta.');
    expect(messages.length).toBeGreaterThan(0);
    expect(server.db.session.password).toBe(ADMIN_PASSWORD);
  });

  it('saves the new password and reports it', async () => {
    const { server } = mount();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Contraseña actual'), ADMIN_PASSWORD);
    await user.type(screen.getByLabelText('Contraseña nueva'), 'clave-nueva-larga');
    await user.type(screen.getByLabelText('Repetir la nueva'), 'clave-nueva-larga');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByText('Contraseña actualizada.')).toBeInTheDocument();
    await waitFor(() => expect(server.db.session.password).toBe('clave-nueva-larga'));
    // The change closes every other session; the list reflects it.
    await waitFor(() =>
      expect(within(screen.getByRole('list', { name: 'Sesiones activas' })).getAllByRole('listitem')).toHaveLength(1),
    );
  });
});
