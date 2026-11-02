const MAX_REDIRECT_LENGTH = 2048;
const MAX_DECODE_PASSES = 5;
const URL_BASE = 'https://example.invalid';

// printable ASCII only: no whitespace, controls, bidi or zero-width chars, and
// nothing a `Location` header can't carry (it throws above U+00FF)
const NOT_PRINTABLE_ASCII = /[^\x21-\x7e]/;

// what decoding may reveal in the path: whitespace, controls, invisible format chars
const HIDDEN_CHARS = /[\s\p{Cc}\p{Cf}]/u;

const PERCENT_ENCODED = /%[0-9a-fA-F]{2}/;

// a same-origin path: one leading slash and no backslash
function isRelativePath(value: string) {
  return (
    value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
  );
}

function pathnameOf(value: string) {
  return value.split(/[?#]/, 1)[0] ?? value;
}

// decode until stable so `%252f` can't hide `/`; null when it can't be
// decoded or is still encoded after the last pass
function decodeFully(value: string) {
  let current = value;

  for (let i = 0; i < MAX_DECODE_PASSES; i++) {
    if (!PERCENT_ENCODED.test(current)) {
      return current;
    }

    try {
      current = decodeURIComponent(current);
    } catch {
      return null;
    }
  }

  return PERCENT_ENCODED.test(current) ? null : current;
}

/**
 * @name isSafeRedirectPath
 * @description Whether `path` is a same-origin relative path that is safe to
 * redirect to (prevents open redirects). Rejects absolute and
 * protocol-relative URLs, backslashes, anything but printable ASCII,
 * and a pathname that decodes to hidden chars, `//`, `\`, `://` or `..`. The query
 * and hash are not decoded, so encoded values there are fine.
 */
export function isSafeRedirectPath(path: string | null | undefined) {
  if (
    !path ||
    typeof path !== 'string' ||
    path.length > MAX_REDIRECT_LENGTH ||
    NOT_PRINTABLE_ASCII.test(path) ||
    !isRelativePath(path)
  ) {
    return false;
  }

  // only the path can change where the browser goes; the query and hash
  // are returned as-is, so encoded spaces there are fine
  const decoded = decodeFully(pathnameOf(path));

  if (
    decoded === null ||
    HIDDEN_CHARS.test(decoded) ||
    !isRelativePath(decoded) ||
    pathnameOf(decoded).includes('://') ||
    pathnameOf(decoded).split('/').includes('..')
  ) {
    return false;
  }

  try {
    const url = new URL(decoded, URL_BASE);

    // the parser collapses dot-segments (`/.//evil.com` → `//evil.com`)
    return url.origin === URL_BASE && !url.pathname.startsWith('//');
  } catch {
    return false;
  }
}

/**
 * @name getSafeRedirectPath
 * @description Returns `path` when it is safe (see `isSafeRedirectPath`),
 * otherwise `fallback`. Every redirect target that comes from a user (query
 * string, form field, cookie) must go through this.
 */
export function getSafeRedirectPath(
  path: string | null | undefined,
  fallback = '/',
) {
  return path && isSafeRedirectPath(path) ? path : fallback;
}
