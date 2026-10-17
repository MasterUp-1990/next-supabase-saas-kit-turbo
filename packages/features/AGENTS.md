# Feature Packages

## Packages

- `accounts/` — Personal account management
- `admin/` — Super admin functionality
- `auth/` — Authentication features
- `notifications/` — Notification system
- `team-accounts/` — Team account management

## Non-Negotiables

1. ALWAYS use `createAccountsApi(client)` / `createTeamAccountsApi(client)` factories — NEVER query tables directly if methods exist
2. NEVER import `useUserWorkspace` outside `app/home/(user)` routes
3. NEVER import `useTeamAccountWorkspace` outside `app/home/[account]` routes
4. ALWAYS put a `<Suspense>` boundary above components calling either workspace hook — both suspend (the contexts hold a promise unwrapped with `use()`)
5. NEVER call admin operations without `isSuperAdmin()` check first
6. ALWAYS wrap admin pages with `AdminGuard`
7. ALWAYS use `getLogger()` from `@kit/shared/logger` for structured logging — NEVER `console.log` in production code
8. NEVER bypass permission checks when permissions exist — use `api.hasPermission({ accountId, userId, permission })`
9. NEVER read "the" subscription with a bare `.single()` / `.maybeSingle()` — an account can hold several rows. Use `api.getSubscription(accountId)`, or order by `active` desc, then `created_at` desc, and `.limit(1)` (the canonical subscription, `docs/billing/overview.mdoc`)

## Key Imports

| API               | Import                                                |
| ----------------- | ----------------------------------------------------- |
| Personal accounts | `createAccountsApi` from `@kit/accounts/api`          |
| Team accounts     | `createTeamAccountsApi` from `@kit/team-accounts/api` |
| Admin check       | `isSuperAdmin` from `@kit/admin`                      |
| Admin guard       | `AdminGuard` from `@kit/admin/components/admin-guard` |
| Logger            | `getLogger` from `@kit/shared/logger`                 |

## Exemplars

- Server actions: `packages/features/accounts/src/server/personal-accounts-server-actions.ts`
- Workspace loading: `apps/web/app/[locale]/home/(user)/_lib/server/load-user-workspace.ts`
- Team policies: `packages/features/team-accounts/src/server/policies/policies.ts`
