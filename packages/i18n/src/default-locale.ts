/**
 * The default locale. Change it here; it needs message files in
 * `apps/web/i18n/messages/<locale>/`. Add the other locales in `locales.tsx`.
 */
const DEFAULT_LOCALE = 'en';

/**
 * @name defaultLocale
 * @description The default locale of the application: `DEFAULT_LOCALE`, or
 * `NEXT_PUBLIC_DEFAULT_LOCALE` when set.
 *
 * `NEXT_PUBLIC_DEFAULT_LOCALE` is deprecated: set `DEFAULT_LOCALE` above
 * instead. It still overrides it for existing deployments.
 */
export const defaultLocale =
  process.env.NEXT_PUBLIC_DEFAULT_LOCALE || DEFAULT_LOCALE;
