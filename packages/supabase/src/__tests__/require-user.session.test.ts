import { createClient } from '@supabase/supabase-js';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { MultiFactorAuthError, requireUser } from '../require-user';

/**
 * `requireUser` against a real supabase-js client. ES256 tokens are verified
 * locally against the JWKS; HS256 tokens only by the Auth server (mocked here).
 */

const SUPABASE_URL = 'http://localhost:54321';
const STORAGE_KEY = 'sb-session-auth-token';
const KID = 'test-key';

const verifiedFactor = {
  id: 'factor-1',
  factor_type: 'totp',
  status: 'verified',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

type UserResponse = { status: number; body: Record<string, unknown> };

let signingKey: CryptoKeyPair;
let otherKey: CryptoKeyPair;
let publicJwk: JsonWebKey;

beforeAll(async () => {
  const generate = () =>
    crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);

  [signingKey, otherKey] = await Promise.all([generate(), generate()]);
  publicJwk = await crypto.subtle.exportKey('jwk', signingKey.publicKey);
});

function base64Url(value: object) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function createAccessToken(params: {
  header: Record<string, unknown>;
  aal: 'aal1' | 'aal2';
  /** Defaults to the key published in the JWKS; `null` leaves it unsigned. */
  key?: CryptoKey | null;
  expiresIn?: number;
}) {
  const payload = {
    sub: 'user-1',
    aal: params.aal,
    email: 'user@test.dev',
    amr: [{ method: 'password', timestamp: 0 }],
    app_metadata: {},
    exp: Math.floor(Date.now() / 1000) + (params.expiresIn ?? 3600),
  };

  const signingInput = `${base64Url(params.header)}.${base64Url(payload)}`;
  const key = params.key === undefined ? signingKey.privateKey : params.key;

  // HS256 signatures are checked by the Auth server, which is mocked.
  const signature = key
    ? Buffer.from(
        await crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          key,
          new TextEncoder().encode(signingInput),
        ),
      ).toString('base64url')
    : Buffer.from('signature').toString('base64url');

  return `${signingInput}.${signature}`;
}

const es256 = { alg: 'ES256', kid: KID, typ: 'JWT' };
const hs256 = { alg: 'HS256', typ: 'JWT' };

function createClientWithSession(params: {
  accessToken: string;
  userResponse: UserResponse;
}) {
  const session = {
    access_token: params.accessToken,
    refresh_token: 'refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'user-1', aud: 'authenticated', factors: [] },
  };

  const store = new Map([[STORAGE_KEY, JSON.stringify(session)]]);

  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();

    if (url === `${SUPABASE_URL}/auth/v1/user`) {
      return Response.json(params.userResponse.body, {
        status: params.userResponse.status,
      });
    }

    if (url === `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`) {
      return Response.json({
        keys: [{ ...publicJwk, kid: KID, alg: 'ES256', use: 'sig' }],
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  });

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

  const userCalls = () =>
    fetch.mock.calls.filter(
      ([input]) => input.toString() === `${SUPABASE_URL}/auth/v1/user`,
    ).length;

  return { client, userCalls };
}

const userWithFactor: UserResponse = {
  status: 200,
  body: { id: 'user-1', aud: 'authenticated', factors: [verifiedFactor] },
};

const userWithoutFactors: UserResponse = {
  status: 200,
  body: { id: 'user-1', aud: 'authenticated', factors: [] },
};

const revoked: UserResponse = {
  status: 403,
  body: { code: 'session_not_found', msg: 'Session not found' },
};

describe('requireUser with a real client', () => {
  describe('ES256 (verified locally)', () => {
    it('requires a step-up for an aal1 token when the server reports a factor', async () => {
      const { client, userCalls } = createClientWithSession({
        accessToken: await createAccessToken({ header: es256, aal: 'aal1' }),
        userResponse: userWithFactor,
      });

      const result = await requireUser(client);

      expect(result.error).toBeInstanceOf(MultiFactorAuthError);
      expect(userCalls()).toBe(1);
    });

    it('lets an aal2 token through after the Auth server confirms the session', async () => {
      const { client, userCalls } = createClientWithSession({
        accessToken: await createAccessToken({ header: es256, aal: 'aal2' }),
        userResponse: userWithFactor,
      });

      const result = await requireUser(client);

      expect(result.error).toBeNull();
      expect(result.data).toMatchObject({ id: 'user-1', aal: 'aal2' });
      expect(userCalls()).toBe(1);
    });

    it.each(['aal1', 'aal2'] as const)(
      'signs out a revoked %s session without `next`',
      async (aal) => {
        const { client } = createClientWithSession({
          accessToken: await createAccessToken({ header: es256, aal }),
          userResponse: revoked,
        });

        const result = await requireUser(client, { next: '/home/settings' });

        expect(result.error).not.toBeInstanceOf(MultiFactorAuthError);
        expect(result.data).toBeNull();
        expect(result).toMatchObject({ redirectTo: '/auth/sign-in' });
      },
    );

    it('rejects an aal2 token signed with a key outside the JWKS', async () => {
      const { client, userCalls } = createClientWithSession({
        accessToken: await createAccessToken({
          header: es256,
          aal: 'aal2',
          key: otherKey.privateKey,
        }),
        userResponse: userWithoutFactors,
      });

      const result = await requireUser(client);

      expect(result.data).toBeNull();
      expect(result).toMatchObject({ redirectTo: '/auth/sign-in' });
      expect(userCalls()).toBe(0);
    });

    it('rejects an unsigned token whose header claims the JWKS key', async () => {
      const { client, userCalls } = createClientWithSession({
        accessToken: await createAccessToken({
          header: es256,
          aal: 'aal2',
          key: null,
        }),
        userResponse: userWithoutFactors,
      });

      const result = await requireUser(client);

      expect(result.data).toBeNull();
      expect(userCalls()).toBe(0);
    });

    it('rejects an expired bearer token', async () => {
      const { client, userCalls } = createClientWithSession({
        accessToken: 'unused',
        userResponse: userWithoutFactors,
      });

      const token = await createAccessToken({
        header: es256,
        aal: 'aal2',
        expiresIn: -60,
      });

      const result = await requireUser(client, { token });

      expect(result.data).toBeNull();
      expect(userCalls()).toBe(0);
    });
  });

  describe('HS256 (verified by the Auth server)', () => {
    it('requires a step-up for an aal1 token when the server reports a factor', async () => {
      const { client } = createClientWithSession({
        accessToken: await createAccessToken({
          header: hs256,
          aal: 'aal1',
          key: null,
        }),
        userResponse: userWithFactor,
      });

      const result = await requireUser(client);

      expect(result.error).toBeInstanceOf(MultiFactorAuthError);
    });

    it('lets a user without factors through', async () => {
      const { client } = createClientWithSession({
        accessToken: await createAccessToken({
          header: hs256,
          aal: 'aal1',
          key: null,
        }),
        userResponse: userWithoutFactors,
      });

      const result = await requireUser(client);

      expect(result.error).toBeNull();
      expect(result.data).toMatchObject({ id: 'user-1', aal: 'aal1' });
    });

    it.each([
      ['rejected', 401, { code: 'bad_jwt' }],
      ['revoked', 403, { code: 'session_not_found' }],
      ['unverifiable while the Auth server is down', 500, {}],
    ])(
      'treats a token the server reports as %s as signed out',
      async (_reason, status, body) => {
        const { client } = createClientWithSession({
          accessToken: await createAccessToken({
            header: hs256,
            aal: 'aal1',
            key: null,
          }),
          userResponse: { status, body },
        });

        const result = await requireUser(client, { next: '/home' });

        expect(result.data).toBeNull();
        expect(result).toMatchObject({
          redirectTo: '/auth/sign-in?next=/home',
        });
      },
    );
  });
});
