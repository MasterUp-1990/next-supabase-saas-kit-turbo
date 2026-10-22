import {
  type AuthError,
  type SupabaseClient,
  isAuthApiError,
  isAuthSessionMissingError,
} from '@supabase/supabase-js';

const ASSURANCE_LEVEL_2 = 'aal2';

/**
 * @name verifySessionAssurance
 * @description Verifies the session's access token and resolves whether it
 * must step up to AAL2. Use it instead of `getClaims()` followed by
 * {@link checkRequiresMultiFactorAuthentication}: one call returns both.
 *
 * `getClaims()` verifies the token (locally against the JWKS, or with the Auth
 * server for HS256 tokens). The step-up check then always asks the Auth server
 * for the user's factors, which also catches a session revoked since the token
 * was issued, including an `aal2` one.
 *
 * Returns `{ claims: null }` when there is no session or it fails verification.
 * @throws {InvalidSessionError} when the Auth server rejects a token that
 * `getClaims()` accepted.
 * @param client
 * @param token - Explicit JWT for bearer callers; defaults to the session's.
 */
export async function verifySessionAssurance(
  client: SupabaseClient,
  token?: string,
) {
  // getSession() refreshes an expired session; only its token is read, never
  // the cookie's `user`.
  const accessToken =
    token ?? (await client.auth.getSession()).data.session?.access_token;

  if (!accessToken) {
    return { claims: null };
  }

  const { data, error } = await client.auth.getClaims(accessToken);

  if (error || !data?.claims) {
    return { claims: null };
  }

  return {
    claims: data.claims,
    requiresMfa: await checkTokenRequiresMultiFactorAuthentication(
      client,
      accessToken,
    ),
  };
}

/**
 * @name InvalidSessionError
 * @description The Auth server rejected the session's access token: the
 * session was revoked, or the user was deleted or banned. `getClaims()` can
 * still accept such a token when it verifies it locally against the JWKS, so
 * callers treat this as signed out rather than as a server error.
 */
export class InvalidSessionError extends Error {
  constructor() {
    super('The session is no longer valid');
  }
}

/**
 * @name checkRequiresMultiFactorAuthentication
 * @description Checks if the current session requires multi-factor authentication.
 * We do it by checking that the next assurance level is AAL2 and that the current assurance level is not AAL2.
 *
 * The user's factors must come from the Auth server: the session's `user`
 * lives in the cookie, which the client can edit, so stripping `factors` from
 * it would skip MFA. Only the access token is read from the session, and the
 * token-based check verifies it with the Auth server.
 *
 * Returns `false` when there is no session: call it only after `getClaims()`
 * has confirmed one, or use {@link verifySessionAssurance}, which does both.
 * @throws {InvalidSessionError} when the Auth server rejects the session.
 * @param client
 */
export async function checkRequiresMultiFactorAuthentication(
  client: SupabaseClient,
) {
  const { data, error } = await client.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  if (!data.session) {
    return false;
  }

  return checkTokenRequiresMultiFactorAuthentication(
    client,
    data.session.access_token,
  );
}

/**
 * @name checkTokenRequiresMultiFactorAuthentication
 * @description Bearer-token variant of {@link checkRequiresMultiFactorAuthentication}.
 * The bearer client has no session storage, so the session-based check would
 * silently report "no MFA required".
 * @throws {InvalidSessionError} when the Auth server rejects the token.
 */
export async function checkTokenRequiresMultiFactorAuthentication(
  client: SupabaseClient,
  token: string,
) {
  const assuranceLevel =
    await client.auth.mfa.getAuthenticatorAssuranceLevel(token);

  if (assuranceLevel.error && isSessionRejected(assuranceLevel.error)) {
    throw new InvalidSessionError();
  }

  // Anything else (Auth server down, 5xx) fails closed.
  if (assuranceLevel.error || !assuranceLevel.data) {
    throw new Error(
      assuranceLevel.error?.message ?? 'Failed to resolve assurance level',
    );
  }

  const { nextLevel, currentLevel } = assuranceLevel.data;

  return nextLevel === ASSURANCE_LEVEL_2 && nextLevel !== currentLevel;
}

function isSessionRejected(error: AuthError) {
  return (
    isAuthSessionMissingError(error) ||
    (isAuthApiError(error) && (error.status === 401 || error.status === 403))
  );
}
