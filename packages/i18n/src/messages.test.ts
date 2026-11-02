import { describe, expect, it } from 'vitest';

import { getMessageFallback, withFallbackMessages } from './messages';

describe('withFallbackMessages', () => {
  it('fills missing keys per key from the fallback locale', () => {
    const messages = withFallbackMessages({
      messages: { auth: { signIn: 'Entrar', nested: { a: 'A-pt' } } },
      fallback: {
        auth: {
          signIn: 'Sign in',
          signUp: 'Sign up',
          nested: { a: 'A', b: 'B' },
        },
        billing: { plan: 'Plan' },
      },
    });

    expect(messages).toEqual({
      auth: {
        signIn: 'Entrar',
        signUp: 'Sign up',
        nested: { a: 'A-pt', b: 'B' },
      },
      billing: { plan: 'Plan' },
    });
  });

  it('keeps an empty string as a translation', () => {
    expect(
      withFallbackMessages({
        messages: { a: { b: '' } },
        fallback: { a: { b: 'B' } },
      }),
    ).toEqual({ a: { b: '' } });
  });

  it('does not treat inherited names as present', () => {
    const messages = withFallbackMessages({
      messages: {},
      fallback: { common: { toString: 'To string', constructor: 'Ctor' } },
    });

    expect(messages).toEqual({
      common: { toString: 'To string', constructor: 'Ctor' },
    });
  });

  it('does not mutate its inputs', () => {
    const own = { auth: { signIn: 'Entrar' } };
    const fallback = { auth: { signIn: 'Sign in', signUp: 'Sign up' } };

    withFallbackMessages({ messages: own, fallback });

    expect(own).toEqual({ auth: { signIn: 'Entrar' } });
    expect(fallback.auth).toEqual({ signIn: 'Sign in', signUp: 'Sign up' });
  });
});

describe('getMessageFallback', () => {
  it('returns namespace.key', () => {
    expect(getMessageFallback({ namespace: 'auth', key: 'signIn' })).toBe(
      'auth.signIn',
    );
  });

  it('returns the key alone without a namespace', () => {
    expect(getMessageFallback({ key: 'Account not found' })).toBe(
      'Account not found',
    );
  });
});

describe('withFallbackMessages with a __proto__ key', () => {
  it('keeps it as a plain property', () => {
    const merged = withFallbackMessages({
      messages: JSON.parse('{"__proto__": {"a": "x"}}'),
      fallback: { common: { b: 'B' } },
    });

    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect(Object.hasOwn(merged, '__proto__')).toBe(true);
  });
});
