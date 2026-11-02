# Makerkit SaaS Starter

## Monorepo Structure

| Directory           | Purpose                       | Details                           |
| ------------------- | ----------------------------- | --------------------------------- |
| `apps/web`          | Main Next.js app              | See `apps/web/AGENTS.md`          |
| `apps/web/supabase` | Database schemas & migrations | See `apps/web/supabase/AGENTS.md` |
| `apps/e2e`          | Playwright E2E tests          | See `apps/e2e/AGENTS.md`          |
| `packages/ui`       | UI components (@kit/ui)       | See `packages/ui/AGENTS.md`       |
| `packages/supabase` | Supabase clients              | See `packages/supabase/AGENTS.md` |
| `packages/next`     | Next.js utilities             | See `packages/next/AGENTS.md`     |
| `packages/features` | Feature packages              | See `packages/features/AGENTS.md` |
| `packages/shared`   | Registry, logger, redirects   | See `packages/shared/AGENTS.md`   |
| `packages/policies` | Business-rule policies        | See `packages/policies/AGENTS.md` |
| `packages/i18n`     | Locales, message fallback     | See `packages/i18n/AGENTS.md`     |

<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `apps/web/node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

<!-- END:nextjs-agent-rules -->

## Multi-Tenant Architecture

- **Personal Accounts**: `auth.users.id = accounts.id`
- **Team Accounts**: Shared workspaces with members, roles, permissions
- Data links to accounts via `account_id` foreign key
- **Routes address a team by `slug`; mutations take the immutable `accountId`.**
  Slugs are user-editable and reusable, so a slug captured when a form rendered
  can point at a different team by the time it is submitted. Details and the
  reason a client-supplied id is safe: `packages/next/AGENTS.md`.
- Personal accounts have no membership row, so `has_role_on_account()` is false
  for them. A table whose policies use only that helper is team-only — which is
  usually what you want, but decide it deliberately.

## Key Patterns (Quick Reference)

| Pattern        | Import                                                       | Details                       |
| -------------- | ------------------------------------------------------------ | ----------------------------- |
| Server Actions | `authActionClient` from `@kit/next/safe-action`              | `packages/next/AGENTS.md`     |
| Route Handlers | `enhanceRouteHandler` from `@kit/next/routes`                | `packages/next/AGENTS.md`     |
| Server Client  | `getSupabaseServerClient` from `@kit/supabase/server-client` | `packages/supabase/AGENTS.md` |
| UI Components  | `@kit/ui/{component}`                                        | `packages/ui/AGENTS.md`       |
| Translations   | `Trans` from `@kit/ui/trans`                                 | `packages/ui/AGENTS.md`       |
| Safe redirects | `getSafeRedirectPath` from `@kit/shared/safe-redirect`       | `packages/shared/AGENTS.md`   |

## Authorization

- **RLS enforces access control** - no manual auth checks needed with standard client
- **Admin client** (`getSupabaseServerAdminClient`) bypasses RLS - use sparingly with manual validation

## TypeScript

- Infer types implicitly - avoid explicit return types
- Never use `any` unless required and justified
- Use service pattern for server-side APIs
- Add `import 'server-only';` to server-only code (except if using 'use server') (not needed in components)
- Never mix client/server imports - use separate package.json exports
- Use small, well-named, implicit, testable pure functions
- Break down complex statements into well-named, clear and explicit variable declarations or functions
- Avoid functions with over 2 parameters; use an object as a parameter for better code
- Do separate complex statements using line breaks

## React

- Always use `react-hook-form` and `@kit/ui/form` for forms
- Always use 'use client' directive for client components
- Add `data-test` for E2E tests where appropriate (Playwright's `testIdAttribute`)
- Avoid `useEffect` - justify if necessary
- Browser-only UI (reads `window`, `localStorage`, media queries) renders after `use(browser())` from `react-dom`, inside a `<Suspense>` boundary; never branch on `typeof window` / `isBrowser()` in render, it causes hydration mismatches. Never suspend around `children` of a provider: put the browser-only part in a sibling leaf.
- Prefer single state object over multiple `useState`
- Prefer RSC for data fetching
- Display `Spinner` (from `@kit/ui/spinner`) where appropriate

## Next.js

- Use `next-safe-action` for Server Actions
- Use `authActionClient` (from `@kit/next/safe-action`) to protect actions; compose extra checks via `next-safe-action`'s `.use()` middleware
- Add page metadata to pages
- Use `redirect` after server actions (avoid client router)
  - Exception: an action that ends the auth session (e.g. deleting the account)
    returns instead, and the client does `window.location.assign(...)` in
    `onSuccess`. A server `redirect` is a soft navigation that keeps the
    browser's cached user, so the UI still renders the session as signed in.

## Verification

After implementation, always run:

1. `pnpm typecheck`
2. `pnpm lint:fix`
3. `pnpm format:fix`
4. Run adversarial reviewer skill /reviewer
5. **If the change is user-visible** (UI, routes, server actions, auth, emails),
   prove it in the running app with /verify-app
6. **If the change touched RLS or the database schema** — any policy, grant, `SECURITY DEFINER` function, view, migration, or file under `apps/web/supabase/` — also run the deep adversarial RLS review skill /rls-review to prove tenant isolation with pgTAP before merging.
7. Each package's `AGENTS.md` names the skills for its work: builders in `apps/web`, database in
   `apps/web/supabase`, E2E tests in `apps/e2e`. If a skill is unavailable, continue with local
   `AGENTS.md`, source, tests, and package exports.

## Bug Fixes

Reproduce the bug as a failing test before changing production code, then show it passing after the fix. Report both runs' output.

- RLS, policies, SQL functions: a pgTAP test in `apps/web/supabase/tests/database/`, run alone with
  `pnpm --filter web supabase test db supabase/tests/database/<name>.test.sql`
- Services and utilities: vitest, in packages that have a `test:unit` script
- UI and user flows: a Playwright spec (`/playwright-e2e`), or `/verify-app` when a permanent test is not worth keeping

Skip the test when it would cost more than the fix (heavy setup, brittle mocks, production-only state). Say so and use the closest check you can run.
