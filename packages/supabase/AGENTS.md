# @kit/supabase — Database & Authentication

## Non-Negotiables

1. 3 clients: `getSupabaseServerClient()` (server, RLS enforced), `useSupabase()` (client hook, RLS enforced), `getSupabaseServerAdminClient()` (bypasses RLS, use rarely and only if needed)
2. NEVER use admin client without manually validating authorization first
3. NEVER modify `database.types.ts` manually — regenerate with `pnpm supabase:web:typegen`
4. NEVER add manual auth checks when using standard client — trust RLS
5. ALWAYS add indexes on foreign keys
6. ALWAYS include `account_id` in storage paths
7. Use `Tables<'table_name'>` from `@kit/supabase/database` for type references, don't create new types

## Skills

- `/postgres-expert` — Schemas, RLS, migrations, query optimization

## SQL Helper Functions

```
public.has_role_on_account(account_id, role?)
public.has_permission(user_id, account_id, permission)
public.is_account_owner(account_id)
public.has_active_subscription(account_id)
public.is_team_member(account_id, user_id)
public.is_super_admin()
```

## Key Imports

| Function      | Import                                                                           |
| ------------- | -------------------------------------------------------------------------------- |
| Server client | `getSupabaseServerClient` from `@kit/supabase/server-client`                     |
| Client hook   | `useSupabase` from `@kit/supabase/hooks/use-supabase`                            |
| Admin client  | `getSupabaseServerAdminClient` from `@kit/supabase/server-admin-client`          |
| Require user  | `requireUser` from `@kit/supabase/require-user`                                  |
| Session + MFA | `verifySessionAssurance` from `@kit/supabase/check-requires-mfa` (verified claims and step-up in one call; throws `InvalidSessionError` for a revoked session) |

## Exemplar

- `apps/web/app/[locale]/home/(user)/_lib/server/load-user-workspace.ts` — server client with RLS
