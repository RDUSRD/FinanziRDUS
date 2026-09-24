import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { readableError } from '../api/client';
import { queryKeys, useRevokeAllSessions, useRevokeSession, useSessions } from '../api/queries';
import type { SessionInfo } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { formatDateDisplay } from '../lib/month';
import { useAnnounce } from './LiveRegion';
import { Notice } from './Notice';
import { PasswordForm } from './PasswordForm';
import { ErrorState, LoadingState } from './States';
import { ConfirmWindow, Window } from './Window';

interface Banner {
  kind: 'success' | 'error';
  text: string;
}

/** What a confirmation window is asking about, if any. */
type PendingRevoke =
  | { kind: 'one'; session: SessionInfo; who: string }
  | { kind: 'all' };

/**
 * A short, honest label for a User-Agent string. It never invents a device name
 * it cannot read: an unrecognised agent stays "Dispositivo desconocido".
 */
function describeAgent(userAgent: string | null): string {
  if (!userAgent) return 'Dispositivo desconocido';
  const agent = userAgent.toLowerCase();
  const browser = agent.includes('firefox')
    ? 'Firefox'
    : agent.includes('edg/')
      ? 'Edge'
      : agent.includes('chrome')
        ? 'Chrome'
        : agent.includes('safari')
          ? 'Safari'
          : null;
  const platform = agent.includes('android')
    ? 'Android'
    : agent.includes('iphone') || agent.includes('ipad')
      ? 'iOS'
      : agent.includes('windows')
        ? 'Windows'
        : agent.includes('mac os')
          ? 'macOS'
          : agent.includes('linux')
            ? 'Linux'
            : null;
  if (browser && platform) return `${browser} en ${platform}`;
  return browser ?? platform ?? 'Dispositivo desconocido';
}

/**
 * The API sends every timestamp already in the app's timezone and with its UTC
 * offset, so the parts are read directly instead of rebuilding a `Date` (which
 * would shift them again).
 */
function formatWhen(iso: string): string {
  const [date, time = ''] = iso.split('T');
  const clock = time.slice(0, 5);
  return clock ? `${formatDateDisplay(date)} ${clock}` : formatDateDisplay(date);
}

interface AdminWindowProps {
  open: boolean;
  onClose: () => void;
}

/**
 * The administration panel: the administrator's own password and the sessions
 * that are currently open. It is the reason sessions live on the server — the
 * list is real, and closing one cuts that device off immediately.
 */
export function AdminWindow({ open, onClose }: AdminWindowProps) {
  const { user, logout } = useAuth();
  const announce = useAnnounce();
  const client = useQueryClient();
  const sessionsQuery = useSessions(open);
  const revokeSession = useRevokeSession();
  const revokeAll = useRevokeAllSessions();
  const [banner, setBanner] = useState<Banner | null>(null);
  const [pending, setPending] = useState<PendingRevoke | null>(null);

  const sessions = sessionsQuery.data?.items ?? [];
  const revoking = revokeSession.isPending || revokeAll.isPending;

  function askToRevoke(session: SessionInfo) {
    setBanner(null);
    setPending({ kind: 'one', session, who: describeAgent(session.user_agent) });
  }

  async function confirmRevoke() {
    if (pending === null) return;
    try {
      if (pending.kind === 'all') {
        await revokeAll.mutateAsync();
        setPending(null);
        announce('Se cerraron todas las sesiones.');
        // This session was closed too: the app goes back to the login.
        await logout();
        return;
      }

      const wasCurrent = pending.session.is_current;
      await revokeSession.mutateAsync(pending.session.id);
      setPending(null);
      announce(wasCurrent ? 'Sesión cerrada.' : `Se cerró la sesión en ${pending.who}.`);
      if (wasCurrent) await logout();
    } catch (error) {
      const text = readableError(error);
      setBanner({ kind: 'error', text });
      announce(text);
      setPending(null);
    }
  }

  return (
    <>
      <Window
        open={open}
        title="Administración"
        onClose={onClose}
        busy={revoking}
        footer={
          <button type="button" className="linkb" onClick={onClose} disabled={revoking}>
            Cerrar panel
          </button>
        }
      >
        {banner && (
          <Notice kind={banner.kind} text={banner.text} onDismiss={() => setBanner(null)} />
        )}

        <div className="sect">
          <h2>Tu contraseña</h2>
        </div>
        <p className="hint">
          Al cambiarla se cierran las demás sesiones
          {user ? `; ésta, la de ${user.username}, sigue abierta.` : '.'}
        </p>
        <PasswordForm
          onSuccess={() => {
            setBanner({ kind: 'success', text: 'Contraseña actualizada.' });
            announce('Contraseña actualizada. Se cerraron las demás sesiones.');
            // The change closed every other session, so the list just changed.
            void client.invalidateQueries({ queryKey: queryKeys.sessions });
          }}
          onError={(message) => {
            setBanner({ kind: 'error', text: message });
            announce(message);
          }}
        />

        <div className="rule" />

        <div className="sect">
          <h2 id="admin-sessions-title">Sesiones activas</h2>
          {sessions.length > 0 && (
            <p className="sect-note">
              {sessions.length === 1 ? '1 sesión' : `${sessions.length} sesiones`}
            </p>
          )}
        </div>

        {sessionsQuery.isPending ? (
          <LoadingState label="Cargando sesiones…" />
        ) : sessionsQuery.isError ? (
          <ErrorState
            message={readableError(sessionsQuery.error)}
            onRetry={() => {
              void sessionsQuery.refetch();
            }}
          />
        ) : (
          <ul className="list" aria-labelledby="admin-sessions-title">
            {sessions.map((session) => (
              <li className="row" key={session.id}>
                <div>
                  <p className="nm">
                    {describeAgent(session.user_agent)}{' '}
                    {session.is_current && <span className="tag">Esta sesión</span>}
                  </p>
                  <p className="hint">
                    {session.ip ?? 'IP desconocida'} · último uso{' '}
                    {formatWhen(session.last_seen_at)} · vence {formatWhen(session.expires_at)}
                  </p>
                </div>
                <button
                  type="button"
                  className="linkb destructive"
                  onClick={() => askToRevoke(session)}
                  disabled={revoking}
                >
                  {session.is_current ? 'Salir' : 'Cerrar'}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="auth-actions">
          <button
            type="button"
            className="pbtn"
            onClick={() => {
              setBanner(null);
              setPending({ kind: 'all' });
            }}
            disabled={revoking || sessionsQuery.isPending}
          >
            Cerrar todas las sesiones
          </button>
        </div>
      </Window>

      {pending?.kind === 'one' && (
        <ConfirmWindow
          open
          title={pending.session.is_current ? 'Salir de esta sesión' : 'Cerrar una sesión'}
          destructive
          confirmLabel={pending.session.is_current ? 'Salir' : 'Cerrar la sesión'}
          confirmBusy={revoking}
          onConfirm={confirmRevoke}
          onCancel={() => setPending(null)}
        >
          {pending.session.is_current ? (
            <>
              <p>Se cierra la sesión de este navegador.</p>
              <p>Vas a tener que entrar de nuevo para seguir usando la app.</p>
            </>
          ) : (
            <>
              <p>¿Cerrar la sesión de {pending.who}?</p>
              <p>Ese dispositivo va a tener que entrar de nuevo. No se puede deshacer.</p>
            </>
          )}
        </ConfirmWindow>
      )}

      {pending?.kind === 'all' && (
        <ConfirmWindow
          open
          title="Cerrar todas las sesiones"
          destructive
          confirmLabel="Cerrar todas"
          confirmBusy={revoking}
          onConfirm={confirmRevoke}
          onCancel={() => setPending(null)}
        >
          <p>Se cierran todas las sesiones, incluida esta.</p>
          <p>Todos los dispositivos van a tener que entrar de nuevo. No se puede deshacer.</p>
        </ConfirmWindow>
      )}
    </>
  );
}
