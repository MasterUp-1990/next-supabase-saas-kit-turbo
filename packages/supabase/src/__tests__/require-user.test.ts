import type { JwtPayload, SupabaseClient } from '@supabase/supabase-js';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  InvalidSessionError,
  verifySessionAssurance,
} from '../check-requires-mfa';
import { MultiFactorAuthError, requireUser } from '../require-user';

// Token verification, forged and revoked tokens, and Auth server errors are
// covered with a real client in require-user.session.test.ts. These tests
// cover how requireUser maps the outcome to a result and a redirect.
vi.mock('../check-requires-mfa', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../check-requires-mfa')>()),
  verifySessionAssurance: vi.fn(),
}));

type Claims = Record<string, unknown>;

interface FakeClientOptions {
  claims?: Claims | null;
  requiresMfa?: boolean;
  verifyError?: Error;
}

function createFakeClient(options: FakeClientOptions) {
  const claims = options.claims ?? null;

  const getClaims = vi.fn().mockResolvedValue({
    data: claims ? { claims } : null,
    error: null,
  });

  const client = { auth: { getClaims } } as unknown as SupabaseClient;

  if (options.verifyError) {
    vi.mocked(verifySessionAssurance).mockRejectedValue(options.verifyError);
  } else {
    vi.mocked(verifySessionAssurance).mockResolvedValue(
      claims
        ? {
            claims: claims as JwtPayload,
            requiresMfa: options.requiresMfa ?? false,
          }
        : { claims: null },
    );
  }

  return { client, getClaims };
}

const validClaims: Claims = {
  sub: 'user-1',
  aal: 'aal1',
  email: 'user@test.dev',
  app_metadata: {},
};

describe('requireUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('unauthenticated', () => {
    it('returns an AuthenticationError redirecting to the default sign-in path', async () => {
      const { client } = createFakeClient({ claims: null });

      const result = await requireUser(client);

      expect(result.error).not.toBeNull();
      expect(result.data).toBeNull();
      expect(result).toMatchObject({ redirectTo: '/auth/sign-in' });
    });

    it('honours a custom signInPath override', async () => {
      const { client } = createFakeClient({ claims: null });

      const result = await requireUser(client, { signInPath: '/login' });

      expect(result).toMatchObject({ redirectTo: '/login' });
    });

    it('appends the `next` param to the redirect', async () => {
      const { client } = createFakeClient({ claims: null });

      const result = await requireUser(client, { next: '/dashboard' });

      expect(result).toMatchObject({
        redirectTo: '/auth/sign-in?next=/dashboard',
      });
    });

    it('treats an invalid session as unauthenticated, without `next`', async () => {
      const { client } = createFakeClient({
        verifyError: new InvalidSessionError(),
      });

      const result = await requireUser(client, { next: '/home/settings' });

      expect(result.error).not.toBeInstanceOf(MultiFactorAuthError);
      expect(result.data).toBeNull();
      expect(result).toMatchObject({ redirectTo: '/auth/sign-in' });
    });

    it('rethrows other verification errors', async () => {
      const { client } = createFakeClient({
        verifyError: new Error('aal lookup failed'),
      });

      await expect(requireUser(client)).rejects.toThrow('aal lookup failed');
    });
  });

  describe('mfa enforcement', () => {
    it('redirects to the MFA verify path when a step-up is required', async () => {
      const { client } = createFakeClient({
        claims: validClaims,
        requiresMfa: true,
      });

      const result = await requireUser(client);

      expect(result.error).toBeInstanceOf(MultiFactorAuthError);
      expect(result).toMatchObject({ redirectTo: '/auth/verify' });
    });

    it('honours a custom mfaVerifyPath override', async () => {
      const { client } = createFakeClient({
        claims: validClaims,
        requiresMfa: true,
      });

      const result = await requireUser(client, { mfaVerifyPath: '/mfa' });

      expect(result.error).toBeInstanceOf(MultiFactorAuthError);
      expect(result).toMatchObject({ redirectTo: '/mfa' });
    });

    it('skips the MFA check entirely when verifyMfa is false', async () => {
      const { client, getClaims } = createFakeClient({
        claims: validClaims,
        requiresMfa: true,
      });

      const result = await requireUser(client, { verifyMfa: false });

      expect(result.error).toBeNull();
      expect(getClaims).toHaveBeenCalledWith(undefined);
      expect(verifySessionAssurance).not.toHaveBeenCalled();
    });

    it('does not require MFA when the session needs no step-up', async () => {
      const { client } = createFakeClient({
        claims: validClaims,
        requiresMfa: false,
      });

      const result = await requireUser(client);

      expect(result.error).toBeNull();
      expect(result.data).toMatchObject({ id: 'user-1' });
    });
  });

  describe('success', () => {
    it('maps claims into JWTUserData', async () => {
      const { client } = createFakeClient({
        claims: {
          sub: 'user-1',
          aal: 'aal2',
          email: 'user@test.dev',
          app_metadata: { role: 'super-admin' },
        },
      });

      const result = await requireUser(client);

      expect(result.error).toBeNull();
      expect(result.data).toMatchObject({
        id: 'user-1',
        email: 'user@test.dev',
        is_superadmin: true,
      });
    });
  });

  describe('bearer token path', () => {
    it('forwards the token to the session verification', async () => {
      const { client } = createFakeClient({ claims: validClaims });

      await requireUser(client, { token: 'jwt-123' });

      expect(verifySessionAssurance).toHaveBeenCalledWith(client, 'jwt-123');
    });

    it('forwards the token to getClaims when verifyMfa is false', async () => {
      const { client, getClaims } = createFakeClient({ claims: validClaims });

      await requireUser(client, { token: 'jwt-123', verifyMfa: false });

      expect(getClaims).toHaveBeenCalledWith('jwt-123');
    });

    it('verifies the cookie session when no token is given', async () => {
      const { client } = createFakeClient({ claims: validClaims });

      await requireUser(client);

      expect(verifySessionAssurance).toHaveBeenCalledWith(client, undefined);
    });
  });
});
