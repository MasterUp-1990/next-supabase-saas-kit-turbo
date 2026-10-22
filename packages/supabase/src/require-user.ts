import type { JwtPayload, SupabaseClient } from '@supabase/supabase-js';

import {
  InvalidSessionError,
  verifySessionAssurance,
} from './check-requires-mfa';
import { JWTUserData } from './types';

type SuccessResult = {
  error: null;
  data: JWTUserData;
};

type AuthenticationErrorResult = {
  error: AuthenticationError;
  data: null;
  redirectTo: string;
};

type MultiAuthErrorResult = {
  error: MultiFactorAuthError;
  data: null;
  redirectTo: string;
};

// Defaults — match the values in apps/web/config/paths.config.ts.
const DEFAULT_SIGN_IN_PATH = '/auth/sign-in';
const DEFAULT_MFA_VERIFY_PATH = '/auth/verify';

/**
 * @name requireUser
 * @description Require a session to be present in the request
 * @param client
 * @param options
 * @param options.verifyMfa
 * @param options.next
 * @param options.signInPath - Override the default sign-in redirect path.
 * @param options.mfaVerifyPath - Override the default MFA verification redirect path.
 */
export async function requireUser(
  client: SupabaseClient,
  options?: {
    verifyMfa?: boolean;
    next?: string;
    /**
     * Explicit JWT to verify, used by bearer-token callers (mobile / native).
     */
    token?: string;
    signInPath?: string;
    mfaVerifyPath?: string;
  },
): Promise<SuccessResult | (AuthenticationErrorResult | MultiAuthErrorResult)> {
  const signInPath = options?.signInPath ?? DEFAULT_SIGN_IN_PATH;
  const mfaVerifyPath = options?.mfaVerifyPath ?? DEFAULT_MFA_VERIFY_PATH;
  const { verifyMfa = true } = options ?? {};

  if (!verifyMfa) {
    const { data, error } = await client.auth.getClaims(options?.token);

    if (error || !data?.claims) {
      return unauthenticated(getRedirectTo(signInPath, options?.next));
    }

    return { error: null, data: toUserData(data.claims) };
  }

  let session: Awaited<ReturnType<typeof verifySessionAssurance>>;

  try {
    session = await verifySessionAssurance(client, options?.token);
  } catch (error) {
    if (!(error instanceof InvalidSessionError)) {
      throw error;
    }

    // No `next`: the sign-in page bounces a cookie that still verifies
    // locally to `next`, and only the proxy-gated home route clears it.
    return unauthenticated(signInPath);
  }

  if (!session.claims) {
    return unauthenticated(getRedirectTo(signInPath, options?.next));
  }

  // If the user requires multi-factor authentication,
  // redirect them to the page where they can verify their identity.
  if (session.requiresMfa) {
    return {
      data: null,
      error: new MultiFactorAuthError(),
      redirectTo: getRedirectTo(mfaVerifyPath, options?.next),
    };
  }

  return { error: null, data: toUserData(session.claims) };
}

function toUserData(claims: JwtPayload) {
  const role = claims.app_metadata?.role;

  return {
    is_anonymous: claims.is_anonymous || false,
    aal: claims.aal,
    email: claims.email,
    phone: claims.phone,
    is_superadmin: role === 'super-admin' && claims.aal === 'aal2',
    id: claims.sub,
    amr: claims.amr,
  };
}

function unauthenticated(redirectTo: string) {
  return { data: null, error: new AuthenticationError(), redirectTo };
}

class AuthenticationError extends Error {
  constructor() {
    super(`Authentication required`);
  }
}

export class MultiFactorAuthError extends Error {
  constructor() {
    super(`Multi-factor authentication required`);
  }
}

function getRedirectTo(path: string, next?: string) {
  return path + (next ? `?next=${next}` : '');
}
