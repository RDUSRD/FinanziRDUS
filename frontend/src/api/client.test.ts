import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, readableError, setUnauthorizedHandler } from './client';
import { createFakeServer, DEFAULT_SESSION } from '../test/fakeServer';

afterEach(() => {
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('sends the session cookie with every request', async () => {
    const server = createFakeServer();
    vi.stubGlobal('fetch', server.fetchMock);

    await api.categories();

    const init = server.fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe('include');
  });

  it('turns the 401 of a dead session into a readable Spanish message', async () => {
    const server = createFakeServer({ session: { ...DEFAULT_SESSION, authed: false } });
    vi.stubGlobal('fetch', server.fetchMock);

    await expect(api.categories()).rejects.toThrow('Sesión inválida o expirada.');
  });

  it('notifies the unauthorized handler on a 401', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    const server = createFakeServer({ session: { ...DEFAULT_SESSION, authed: false } });
    vi.stubGlobal('fetch', server.fetchMock);

    await expect(api.categories()).rejects.toBeInstanceOf(ApiError);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not notify the unauthorized handler for other failures', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Se rompió' }),
        text: async () => '{"detail":"Se rompió"}',
      })),
    );

    await expect(api.categories()).rejects.toThrow('Se rompió');

    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps the API error readable', async () => {
    const server = createFakeServer({ session: { ...DEFAULT_SESSION, authed: false } });
    vi.stubGlobal('fetch', server.fetchMock);

    const error = await api.categories().catch((thrown: unknown) => thrown);

    expect(readableError(error)).toBe('Sesión inválida o expirada.');
  });
});
