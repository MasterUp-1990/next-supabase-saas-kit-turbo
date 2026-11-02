# @kit/i18n

next-intl routing, locales and message helpers. Messages live in `apps/web/i18n/messages/<locale>/<namespace>.json` and are loaded by `apps/web/i18n/request.ts`.

## Non-negotiables

1. Locales are code config: the list in `src/locales.tsx`, the default in `src/default-locale.ts` (`DEFAULT_LOCALE`). Add a locale together with its message files; a configured locale without files logs a warning and shows the default language. `NEXT_PUBLIC_DEFAULT_LOCALE` is deprecated (still overrides the default); don't add new uses, import `defaultLocale` from `@kit/i18n/default-locale`.
2. A key missing in a locale falls back per key to the default locale (`withFallbackMessages` from `@kit/i18n/messages`); a key missing everywhere renders as `namespace.key`. Don't add your own `getMessageFallback`; use the shared one so server and client match.
3. Messages are static, cached with `'use cache'` / `cacheLife('max')`. Never cache request-bound state (cookies, headers, user) next to them.
4. New namespaces go in the `namespaces` list in `apps/web/i18n/request.ts`.
5. Locale detection (`Accept-Language`, cookie, URL prefix) is next-intl's middleware; don't parse `Accept-Language` yourself.

## Verification

- `pnpm --filter @kit/i18n test:unit`
- `pnpm --filter @kit/i18n typecheck`
