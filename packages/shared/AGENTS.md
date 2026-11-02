# @kit/shared

Framework-free helpers used by every package and the app: registry, logger, safe redirects, currency, events, env.

## Non-negotiables

1. Registry `get()` builds a fresh instance per call. Never add caching to the registry or a factory that holds request-bound values (cookies, headers, a session, a request-bound Supabase client): a cached instance leaks them across users.
2. The logger does no redaction. Never log secrets, tokens, cookies, headers, request/response bodies or query payloads. For database errors, log the error (its `code`, `details`, `hint` are kept) or a summary, never the inputs you sent.
3. Every user-supplied redirect target goes through `getSafeRedirectPath` / `isSafeRedirectPath` from `@kit/shared/safe-redirect`.
4. One entry point per concern (`./logger`, `./registry`, `./safe-redirect`, `./utils`, `./events`, `./env`); no barrel, no deep imports.
5. Changing public behaviour updates the colocated tests and the docs pages below.

## Common mistakes

- Interpolating values into log messages instead of passing fields: `logger.info({ userId }, 'Updated profile')`
- Importing the safe-redirect helpers from `./utils` (still re-exported for compatibility; new code uses `./safe-redirect`)
- Catching `formatCurrency`'s `RangeError` to show `$0.00`: a missing amount must not look like a price
- Calling `isBrowser()` during render (deprecated, hydration mismatch): use `use(browser())` from `react-dom` inside `<Suspense>` (root `AGENTS.md`)

## Key entrypoints

- Logger: `src/logger/index.ts` (`getLogger`), serializer `src/logger/serialize.ts`
- Registry: `src/registry/index.ts`
- Safe redirect: `src/safe-redirect.ts`
- Currency: `src/utils.ts`
- Tests: colocated `src/**/*.test.ts`
- Docs: `docs/api/registry-api.mdoc`

## Verification

- `pnpm --filter @kit/shared test:unit`
- `pnpm --filter @kit/shared typecheck`
