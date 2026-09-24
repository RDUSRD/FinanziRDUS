import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setUnauthorizedHandler } from '../api/client';
import type { AuthUser } from '../api/types';

/** `loading` until the cookie has been checked, then the session is or is not there. */
export type AuthStatus = 'loading' | 'authed' | 'anon';

interface AuthValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** True while the bootstrap password is still in place: the UI forces a change. */
  mustChangePassword: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Re-read the current user (after an action that changes its own state). */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** The session state of the app. Must be used inside `AuthProvider`. */
export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth debe usarse dentro de un AuthProvider.');
  return value;
}

/**
 * Holds the session for the whole app: whether the cookie still opens the API,
 * and the actions that change that. The session itself lives in a `httpOnly`
 * cookie the browser never lets the JS read, so this is only its mirror.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  const apply = useCallback((next: AuthUser | null) => {
    setUser(next);
    setStatus(next === null ? 'anon' : 'authed');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api.auth.me();
      apply({ username: me.username, must_change_password: me.must_change_password });
    } catch {
      apply(null);
    }
  }, [apply]);

  // Ask once, on mount, whether the cookie still opens the app.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Any 401 — an expired session, or one closed from another device — sends the
  // UI straight back to the login, without waiting for a reload.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      client.clear();
      setUser(null);
      setStatus('anon');
    });
    return () => setUnauthorizedHandler(null);
  }, [client]);

  const login = useCallback(
    async (username: string, password: string) => {
      const response = await api.auth.login(username, password);
      // Never let the previous identity's cached data show up in a new session.
      client.clear();
      apply({
        username: response.username,
        must_change_password: response.must_change_password,
      });
    },
    [apply, client],
  );

  const logout = useCallback(async () => {
    // No `finally`: if the server cannot be reached the local state stays, so a
    // reload does not silently log the user back in with a session that never
    // got revoked.
    await api.auth.logout();
    client.clear();
    apply(null);
  }, [apply, client]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await api.auth.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      // The backend closed every other session; this one survives and is current.
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      mustChangePassword: user?.must_change_password === true,
      login,
      logout,
      changePassword,
      refresh,
    }),
    [status, user, login, logout, changePassword, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
