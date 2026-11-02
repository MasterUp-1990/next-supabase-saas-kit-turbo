export { getSafeRedirectPath, isSafeRedirectPath } from './safe-redirect';

const DECIMAL = /^-?\d+(\.\d+)?$/;

/**
 * @deprecated A render-time `typeof window` check renders different output on
 * the server and in the browser (hydration mismatch). In render, use
 * `use(browser())` from `react-dom` inside a `<Suspense>` boundary; in effects
 * and event handlers, no check is needed.
 */
export function isBrowser() {
  return typeof window !== 'undefined';
}

const FALLBACK_LOCALE = 'en';

/**
 * A BCP 47 tag for `locale` (`en_US` becomes `en-US`), or `FALLBACK_LOCALE`
 * when it isn't a valid tag.
 */
function toLocaleTag(locale: string) {
  try {
    return (
      Intl.getCanonicalLocales(locale.replaceAll('_', '-'))[0] ??
      FALLBACK_LOCALE
    );
  } catch {
    return FALLBACK_LOCALE;
  }
}

/**
 * @name formatCurrency
 * @description Format `value` as money in `currencyCode` for `locale`.
 * Decimal strings (e.g. Postgres `numeric` columns) are formatted exactly,
 * without rounding through `Number`. Throws a `RangeError` unless the amount
 * is a finite number or a plain decimal string, so a missing amount never
 * shows as `$0.00`.
 */
export function formatCurrency(params: {
  currencyCode: string;
  locale: string;
  value: string | number;
}) {
  const { value } = params;

  const isValid =
    typeof value === 'number'
      ? Number.isFinite(value)
      : typeof value === 'string' && DECIMAL.test(value);

  if (!isValid) {
    throw new RangeError(`Invalid amount: ${String(value)}`);
  }

  const formatter = new Intl.NumberFormat(toLocaleTag(params.locale), {
    style: 'currency',
    currency: params.currencyCode,
  });

  // Intl formats decimal strings exactly; its TS overloads only accept the
  // `${number}` literal type, which DECIMAL has just checked
  return formatter.format(value as `${number}`);
}
