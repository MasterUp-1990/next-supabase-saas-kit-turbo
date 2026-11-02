import { describe, expect, it } from 'vitest';

import { getSafeRedirectPath, isSafeRedirectPath } from './safe-redirect';
import * as utils from './utils';

describe('getSafeRedirectPath', () => {
  it('returns default fallback for empty input', () => {
    expect(getSafeRedirectPath(undefined, '/')).toBe('/');
    expect(getSafeRedirectPath(null, '/')).toBe('/');
    expect(getSafeRedirectPath('', '/')).toBe('/');
  });

  it('uses custom fallback path', () => {
    expect(getSafeRedirectPath(undefined, '/home')).toBe('/home');
    expect(getSafeRedirectPath(null, '/dashboard')).toBe('/dashboard');
    expect(getSafeRedirectPath('https://evil.com', '/safe')).toBe('/safe');
    expect(getSafeRedirectPath('//evil.com', '/fallback')).toBe('/fallback');
  });

  it('allows relative paths', () => {
    expect(getSafeRedirectPath('/dashboard', '/')).toBe('/dashboard');
    expect(getSafeRedirectPath('/foo?bar=baz', '/')).toBe('/foo?bar=baz');
    expect(getSafeRedirectPath('/foo%2Fbar', '/')).toBe('/foo%2Fbar');
    expect(getSafeRedirectPath('/search?q=%25', '/')).toBe('/search?q=%25');
    expect(getSafeRedirectPath('/share?u=https://example.com', '/')).toBe(
      '/share?u=https://example.com',
    );
  });

  it('keeps query and hash unchanged', () => {
    expect(getSafeRedirectPath('/settings?tab=billing#plans', '/')).toBe(
      '/settings?tab=billing#plans',
    );
    expect(getSafeRedirectPath('/docs#..', '/')).toBe('/docs#..');
  });

  it('rejects absolute and protocol-relative URLs', () => {
    expect(getSafeRedirectPath('https://evil.com', '/')).toBe('/');
    expect(getSafeRedirectPath('//evil.com', '/')).toBe('/');
    expect(getSafeRedirectPath('///evil.com', '/')).toBe('/');
  });

  it('rejects scheme URLs', () => {
    expect(getSafeRedirectPath('javascript:alert(1)', '/')).toBe('/');
    expect(getSafeRedirectPath('data:text/html,<script>', '/')).toBe('/');
    expect(getSafeRedirectPath('/%0ajavascript:alert(1)', '/')).toBe('/');
  });

  it('rejects encoded protocol-relative URLs', () => {
    expect(getSafeRedirectPath('/%2f%2fevil.com', '/')).toBe('/');
    expect(getSafeRedirectPath('/%252f%252fevil.com', '/')).toBe('/');
  });

  it('rejects dot-segment paths that the URL parser collapses to //', () => {
    expect(getSafeRedirectPath('/.//evil.com', '/')).toBe('/');
    expect(getSafeRedirectPath('/%2e//evil.com', '/')).toBe('/');
    expect(getSafeRedirectPath('/././/evil.com', '/')).toBe('/');
    expect(getSafeRedirectPath('/./%2fevil.com', '/')).toBe('/');
  });

  it('rejects traversal attempts', () => {
    expect(getSafeRedirectPath('/foo/../bar', '/')).toBe('/');
    expect(getSafeRedirectPath('/%2e%2e/bar', '/')).toBe('/');
    expect(getSafeRedirectPath('/foo%2F..%2Fbar', '/')).toBe('/');
  });

  it('rejects backslashes, control chars, whitespace and bidi chars', () => {
    expect(getSafeRedirectPath('/\\evil.com', '/')).toBe('/');
    expect(getSafeRedirectPath('/%5c%5cevil.com', '/')).toBe('/');
    expect(getSafeRedirectPath('/foo\nbar', '/')).toBe('/');
    expect(getSafeRedirectPath('/foo bar', '/')).toBe('/');
    expect(getSafeRedirectPath('/foo%20bar', '/')).toBe('/');
    expect(getSafeRedirectPath('/foo\u202Ebar', '/')).toBe('/');
    expect(getSafeRedirectPath('/foo\u2066bar', '/')).toBe('/');
    expect(getSafeRedirectPath('/foo\u200Bbar', '/')).toBe('/');
    expect(getSafeRedirectPath('/foo%E2%80%AEbar', '/')).toBe('/');
  });

  it('allows encoded spaces and characters in the query string', () => {
    expect(getSafeRedirectPath('/search?q=hello%20world', '/')).toBe(
      '/search?q=hello%20world',
    );
    expect(getSafeRedirectPath('/search?q=%E0', '/')).toBe('/search?q=%E0');
  });

  it('rejects raw non-ASCII characters a Location header cannot carry', () => {
    expect(getSafeRedirectPath('/\u0100', '/')).toBe('/');
    expect(getSafeRedirectPath('/caf\u00E9', '/')).toBe('/');
    expect(getSafeRedirectPath('/caf%C3%A9', '/')).toBe('/caf%C3%A9');
  });

  it('rejects paths still encoded after the last decode pass', () => {
    expect(getSafeRedirectPath('/%25252525252Fevil.com', '/')).toBe('/');
  });

  it('rejects undecodable and overlong paths', () => {
    expect(getSafeRedirectPath('/%E0%A4%A', '/')).toBe('/');
    expect(getSafeRedirectPath(`/${'a'.repeat(2048)}`, '/')).toBe('/');
    expect(getSafeRedirectPath(`/${'a'.repeat(2046)}`, '/')).toBe(
      `/${'a'.repeat(2046)}`,
    );
  });
});

describe('isSafeRedirectPath', () => {
  it('matches getSafeRedirectPath', () => {
    expect(isSafeRedirectPath('/dashboard?tab=1')).toBe(true);
    expect(isSafeRedirectPath('/search?q=hello%20world')).toBe(true);
    expect(isSafeRedirectPath('//evil.com')).toBe(false);
    expect(isSafeRedirectPath('/.//evil.com')).toBe(false);
    expect(isSafeRedirectPath('/\t//evil.com')).toBe(false);
    expect(isSafeRedirectPath('')).toBe(false);
  });

  it('is still exported from @kit/shared/utils', () => {
    expect(utils.isSafeRedirectPath).toBe(isSafeRedirectPath);
    expect(utils.getSafeRedirectPath).toBe(getSafeRedirectPath);
  });
});
