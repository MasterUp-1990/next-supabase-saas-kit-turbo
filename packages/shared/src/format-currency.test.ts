import { describe, expect, it } from 'vitest';

import { formatCurrency } from './utils';

const format = (value: string | number, locale = 'en-US') =>
  formatCurrency({ currencyCode: 'USD', locale, value });

describe('formatCurrency', () => {
  it('formats numbers and decimal strings', () => {
    expect(format(10)).toBe('$10.00');
    expect(format(0)).toBe('$0.00');
    expect(format('19.99')).toBe('$19.99');
    expect(format('-5')).toBe('-$5.00');
  });

  it.each([
    ['de-DE', 'de-DE'],
    ['en', 'en'],
    ['zh-Hant-TW', 'zh-Hant-TW'],
    ['es-419', 'es-419'],
    ['en_US', 'en-US'],
    ['not a locale!', 'en'],
    ['', 'en'],
  ])('formats for the locale tag %j as %j', (locale, expected) => {
    expect(format(1234.5, locale)).toBe(
      new Intl.NumberFormat(expected, {
        style: 'currency',
        currency: 'USD',
      }).format(1234.5),
    );
  });

  it('throws a RangeError for an invalid currency code', () => {
    expect(() =>
      formatCurrency({ currencyCode: 'US', locale: 'en', value: 1 }),
    ).toThrow(RangeError);
  });

  it('formats decimal strings beyond 2^53 without rounding', () => {
    expect(format('12345678901234567890.12')).toBe(
      '$12,345,678,901,234,567,890.12',
    );
  });

  it.each(['', 'abc', '0x10', '1e309', ' 1', '1.'])(
    'throws a RangeError for the invalid amount %j',
    (value) => {
      expect(() => format(value)).toThrow(RangeError);
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    'throws a RangeError for %s',
    (value) => {
      expect(() => format(value)).toThrow(RangeError);
    },
  );

  it('throws for null or undefined passed from untyped code', () => {
    expect(() => format(null as unknown as number)).toThrow(RangeError);
    expect(() => format(undefined as unknown as number)).toThrow(RangeError);
  });
});
