# @kit/next — Next.js Utilities

## Non-Negotiables

1. ALWAYS validate input with Zod schema via `.inputSchema()`
2. ALWAYS use `authActionClient` for authenticated actions, `publicActionClient` for public
3. ALWAYS use `useAction` hook from `next-safe-action/hooks` on the client side
4. ALWAYS use `revalidatePath` after mutations — with the **route-file pattern**
   plus a type, matching existing call sites (see Revalidating)
5. NEVER use server actions for data fetching — mutations only
6. NEVER put business logic in actions — extract to service files
7. NEVER use `router.refresh()` or `router.push()` after server actions
8. NEVER use `adminActionClient` outside admin features — use `authActionClient`

## Skills

- `/server-action-builder` — Complete server action workflow

## Errors reach the browser

The shared client is configured `handleServerError: (error) => error.message`
(`src/actions/safe-action-client.ts`). Whatever you throw, its `message` is
serialized into the action result and sent to the client — visible in the network
response even when the UI shows something friendlier.

So never throw a driver error:

```ts
// WRONG — ships "new row violates row-level security policy for table "x""
// or a constraint name to anyone who can POST the action
if (error) throw error;

// RIGHT — log the detail server-side, throw a stable translatable code
if (error) {
  logger.error({ ...ctx, error }, `Failed to ...`);
  throw new Error('feature.genericErrorKey');
}
```

Pick one error channel per action. Either throw (handled by `onError` on the
client) or return `{ success: false, error: '<i18n key>' }` (handled in
`onSuccess`) — doing both forces every caller to handle three outcomes.

## Identifying the tenant

Routes address team accounts by **slug**; mutations take the immutable
**`accountId`**. A slug is user-editable and reusable, so a payload built when a
form rendered can resolve to a *different* account by the time it is submitted.

Passing an id from the client is not a trust problem: RLS `WITH CHECK` rejects
any `account_id` the user has no membership on, which is the same check a
server-side slug lookup would perform. See `RemoveMemberSchema` in
`packages/features/team-accounts`. Resolving a slug to an id inside the action is
a wasted round-trip and an extra failure branch.

## Route handlers: use the `client` you are given

`enhanceRouteHandler` passes the handler `{ request, body, user, params, client }`.
`client` is built from the caller's credentials (`src/routes/index.ts`):

- `Authorization: Bearer <jwt>` → a client carrying that token (mobile / native)
- no bearer → the cookie-based server client (web)

Query with that `client`. Calling `getSupabaseServerClient()` inside the handler
reads cookies only, so it works from the browser but runs as anonymous for a
bearer caller: queries fail with permission errors or come back empty. Web-only
testing never shows it.

```ts
// WRONG — anonymous for mobile callers
export const GET = enhanceRouteHandler(async ({ user }) => {
  const client = getSupabaseServerClient();
  // ...
});

// RIGHT — whichever credentials the caller sent
export const GET = enhanceRouteHandler(async ({ user, client }) => {
  const api = createTeamAccountsApi(client);
  // ...
});
```

Two exceptions, both `auth: false` routes:

- **Public data** — `client` is still built from any bearer sent, and nothing
  checks it first. An expired token makes every query fail with `401 JWT
  expired` (PGRST303) instead of running as anon. Use `getSupabaseServerClient()`
  for data anyone may read.
- **Provider webhooks** — no user at all; use the admin client after verifying
  the signature, as in `apps/web/app/api/billing/webhook`.

## Revalidating

Match the existing call sites: the **bracketed route pattern plus a type**.

```ts
revalidatePath('/home/[account]/projects', 'page');
revalidatePath('/home/[account]', 'layout');
```

Never hand-interpolate a `pathsConfig` constant back into a literal
(`pathsConfig.app.accountProjects.replace('[account]', slug)`) — it un-does a
value that is already in pattern form, and it is the only such call in the repo.

What `next/dist/docs/.../revalidatePath.md` actually says, since the rules are
easy to half-remember:

- `path` keys on the **route file structure**, not the URL. Both forms are legal:
  a literal path (`/product/123`) refreshes that single page, a pattern
  (`/product/[slug]`) refreshes all matching pages.
- `type` is **required** when `path` contains a dynamic segment, and must be
  omitted for a literal path. So an interpolated literal is not flagged as
  malformed — there is no dynamic segment left to require a `type`.
- With rewrites you must pass the **destination** path.

That last point is unresolved in this repo and worth checking before you rely on
it: routes live under `app/[locale]/`, and `localePrefix: 'as-needed'` means
next-intl rewrites into that segment — yet every existing call omits `[locale]`.
Follow the convention, but do not assume the revalidation is precisely targeted;
these routes are dynamic (`await connection()`) and re-render regardless.

## Quick Reference

| Function              | Import                  | Purpose                            |
| --------------------- | ----------------------- | ---------------------------------- |
| `authActionClient`    | `@kit/next/safe-action` | Authenticated server actions       |
| `publicActionClient`  | `@kit/next/safe-action` | Public server actions (no auth)    |
| `captchaActionClient` | `@kit/next/safe-action` | Server actions with CAPTCHA + auth |
| `enhanceRouteHandler` | `@kit/next/routes`      | API routes with auth + validation  |

## Exemplars

- Server action: `packages/features/accounts/src/server/personal-accounts-server-actions.ts`
- Route handler: `apps/web/app/[locale]/home/[account]/members/policies/route.ts`
- Client usage: `apps/web/app/[locale]/(marketing)/contact/_components/contact-form.tsx`
