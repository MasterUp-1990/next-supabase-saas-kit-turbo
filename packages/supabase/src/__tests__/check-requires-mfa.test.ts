import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

import { describe, expect, it, vi } from 'vitest';

import {
  InvalidSessionError,
  checkRequiresMultiFactorAuthentication,
} from '../check-requires-mfa';

const SUPABASE_URL = 'http://localhost:54321';
const STORAGE_KEY = 'sb-test-auth-token';

type ServerResponse = { status: number; body: Record<string, unknown> };

const verifiedFactor = {
  id: 'factor-1',
  factor_type: 'totp',
  status: 'verified',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const strippedUser = { id: 'user-1', aud: 'authenticated', factors: [] };

function base64Url(value: object) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createAccessToken(payload: Record<string, unknown>) {
  return [
    base64Url({ alg: 'HS256', typ: 'JWT' }),
    base64Url(payload),
    Buffer.from('signature').toString('base64url'),
  ].join('.');
}

function createSession(user: Record<string, unknown>) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;

  return {
    access_token: createAccessToken({
      sub: 'user-1',
      aal: 'aal1',
      amr: [{ method: 'password', timestamp: 0 }],
      exp: expiresAt,
    }),
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user,
  };
}

/**
 * Answers `/user` with `userResponse`, as the Auth server would for the
 * session's access token, and accepts a local sign-out.
 */
function createFetch(userResponse: ServerResponse) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();

    if (url === `${SUPABASE_URL}/auth/v1/user`) {
      return new Response(JSON.stringify(userResponse.body), {
        status: userResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.startsWith(`${SUPABASE_URL}/auth/v1/logout`)) {
      return new Response(null, { status: 204 });
    }

    throw new Error(`Unexpected request: ${url}`);
  });
}

/**
 * A real supabase-js client whose session storage (the cookie, on the server)
 * holds `storedUser`, while the Auth server answers `/user` with
 * `serverResponse`. The two differ when a client edits its own session cookie.
 */
function createClientWithSession(params: {
  storedUser: Record<string, unknown>;
  serverResponse: ServerResponse;
}) {
  const session = createSession(params.storedUser);
  const store = new Map([[STORAGE_KEY, JSON.stringify(session)]]);

  const fetch = createFetch(params.serverResponse);

  const client = createClient(SUPABASE_URL, 'anon-key', {
    auth: {
      storageKey: STORAGE_KEY,
      storage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => void store.set(key, value),
        removeItem: (key) => void store.delete(key),
      },
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
    },
    global: { fetch },
  });

  return { client, fetch, session };
}

describe('checkRequiresMultiFactorAuthentication', () => {
  it('requires MFA when the session cookie has its factors stripped', async () => {
    const { client, fetch, session } = createClientWithSession({
      storedUser: strippedUser,
      serverResponse: {
        status: 200,
        body: { id: 'user-1', aud: 'authenticated', factors: [verifiedFactor] },
      },
    });

    await expect(checkRequiresMultiFactorAuthentication(client)).resolves.toBe(
      true,
    );

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(headers.get('Authorization')).toBe(`Bearer ${session.access_token}`);
  });

  it('does not require MFA when the server reports no verified factors', async () => {
    const { client } = createClientWithSession({
      storedUser: strippedUser,
      serverResponse: {
        status: 200,
        body: { id: 'user-1', aud: 'authenticated', factors: [] },
      },
    });

    await expect(checkRequiresMultiFactorAuthentication(client)).resolves.toBe(
      false,
    );
  });

  it('does not require MFA when there is no session', async () => {
    const client = createClient(SUPABASE_URL, 'anon-key', {
      auth: {
        storage: {
          getItem: () => null,
          setItem: () => undefined,
          removeItem: () => undefined,
        },
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: createFetch({ status: 500, body: {} }) },
    });

    await expect(checkRequiresMultiFactorAuthentication(client)).resolves.toBe(
      false,
    );
  });

  it.each([
    ['the session was revoked', 403, { code: 'session_not_found' }],
    ['the user was deleted', 403, { code: 'user_not_found' }],
    ['the token is rejected', 401, { code: 'bad_jwt' }],
  ])('throws InvalidSessionError when %s', async (_reason, status, body) => {
    const { client } = createClientWithSession({
      storedUser: strippedUser,
      serverResponse: { status, body },
    });

    await expect(
      checkRequiresMultiFactorAuthentication(client),
    ).rejects.toBeInstanceOf(InvalidSessionError);
  });

  it('fails closed with a plain error when the Auth server is down', async () => {
    const { client } = createClientWithSession({
      storedUser: strippedUser,
      serverResponse: { status: 500, body: { code: 'unexpected_failure' } },
    });

    const error = await checkRequiresMultiFactorAuthentication(client).catch(
      (error: unknown) => error,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(InvalidSessionError);
  });

  it('clears the session cookie on a local sign-out after an invalid session', async () => {
    const session = createSession(strippedUser);

    const jar = new Map([
      [
        STORAGE_KEY,
        `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,
      ],
    ]);

    const setAll = vi.fn((cookies: Array<{ name: string; value: string }>) => {
      cookies.forEach(({ name, value }) => jar.set(name, value));
    });

    const client = createServerClient(SUPABASE_URL, 'anon-key', {
      cookieOptions: { name: STORAGE_KEY },
      cookies: {
        getAll: () =>
          [...jar.entries()].map(([name, value]) => ({ name, value })),
        setAll,
      },
      global: {
        fetch: createFetch({
          status: 403,
          body: { code: 'user_not_found' },
        }),
      },
    });

    await expect(
      checkRequiresMultiFactorAuthentication(client),
    ).rejects.toBeInstanceOf(InvalidSessionError);

    await client.auth.signOut({ scope: 'local' });

    expect(jar.get(STORAGE_KEY)).toBe('');
  });
});
