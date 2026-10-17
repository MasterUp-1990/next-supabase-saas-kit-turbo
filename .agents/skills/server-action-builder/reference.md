# Server Action Reference

## authActionClient API

```typescript
import { authActionClient } from '@kit/next/safe-action';

export const myAction = authActionClient
  .inputSchema(ZodSchema)     // Zod schema for input validation
  .action(async ({ parsedInput: data, ctx: { user } }) => {
    // data: validated input (typed from schema)
    // user: authenticated user object

    return { success: true, data: result };
  });
```

## publicActionClient API

For actions that don't require authentication:

```typescript
import { publicActionClient } from '@kit/next/safe-action';

export const myPublicAction = publicActionClient
  .inputSchema(ZodSchema)
  .action(async ({ parsedInput: data }) => {
    // no ctx.user here

    return { success: true };
  });
```

## captchaActionClient API

For actions that require CAPTCHA + authentication:

```typescript
import { captchaActionClient } from '@kit/next/safe-action';

export const myProtectedAction = captchaActionClient
  .inputSchema(ZodSchema)
  .action(async ({ parsedInput: data, ctx: { user } }) => {
    return { success: true };
  });
```

### Action Callback Parameters

| Parameter       | Type               | Description                        |
|-----------------|--------------------|------------------------------------|
| `parsedInput`   | `z.output<Schema>` | Validated input data               |
| `ctx.user`      | `User`             | Authenticated user (auth clients)  |

## enhanceRouteHandler API

```typescript
import { enhanceRouteHandler } from '@kit/next/routes';
import { NextResponse } from 'next/server';

export const POST = enhanceRouteHandler(
  async function ({ body, user, request, client }) {
    // body: validated request body
    // user: authenticated user (if auth: true)
    // request: original NextRequest
    // client: Supabase client for this caller — bearer-token client when an
    //         `Authorization: Bearer` header is sent, cookie client otherwise.
    //         Use it instead of getSupabaseServerClient().

    return NextResponse.json({ success: true });
  },
  {
    auth: true,
    schema: ZodSchema,
  },
);

export const GET = enhanceRouteHandler(
  async function ({ user, request }) {
    const url = new URL(request.url);
    const param = url.searchParams.get('param');

    return NextResponse.json({ data: result });
  },
  {
    auth: true,
  },
);
```

## Common Zod Patterns

Validation `message`s are i18n keys (`'namespace.key'`), never prose — `FormMessage` renders them through `Trans`.

```typescript
import * as z from 'zod';

// Basic schema
export const CreateItemSchema = z.object({
  name: z.string().trim().min(1, { message: 'items.nameRequired' }),
  description: z.string().optional(),
  accountId: z.uuid(),
});

// With transforms
export const SearchSchema = z.object({
  query: z.string().trim().min(1),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

// With refinements
export const DateRangeSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
}).refine(
  (data) => data.endDate > data.startDate,
  { message: 'items.endDateBeforeStartDate', path: ['endDate'] }
);

// Enum values
export const StatusSchema = z.object({
  status: z.enum(['active', 'inactive', 'pending']),
});
```

## Revalidation

```typescript
import { revalidatePath } from 'next/cache';
import { revalidateTag } from 'next/cache';

// Route-file pattern + type (required when the path has a dynamic segment)
revalidatePath('/home/[account]/items', 'page');
revalidatePath('/home/[account]', 'layout');

// Literal path with no dynamic segment: omit the type
revalidatePath('/home/settings');

// Revalidate by tag — the profile argument is required (one-arg form is deprecated).
// In a Server Action that must show its own write immediately, use updateTag('items').
revalidateTag('items', 'max');
```

Never interpolate the slug (`` `/home/${accountSlug}/items` ``) or hand-`replace('[account]', slug)` a `pathsConfig`
value — match the bracketed pattern used by every existing call site. See `packages/next/AGENTS.md` → Revalidating.

## Redirect

```typescript
import { redirect } from 'next/navigation';

// Redirect after action
redirect('/success');

// Redirect with dynamic path
redirect(`/home/${accountSlug}/items/${itemId}`);
```

## Logging

```typescript
import { getLogger } from '@kit/shared/logger';

const logger = await getLogger();

// Context object for all logs
const ctx = {
  name: 'action-name',
  userId: user.id,
  accountId: data.accountId,
};

// Log levels
logger.info(ctx, 'Starting operation');
logger.warn({ ...ctx, warning: 'details' }, 'Warning message');
logger.error({ ...ctx, error }, 'Operation failed');
```

## Supabase Clients

```typescript
// Standard client (RLS enforced)
import { getSupabaseServerClient } from '@kit/supabase/server-client';
const client = getSupabaseServerClient();

// Admin client (bypasses RLS - use sparingly)
import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
const adminClient = getSupabaseServerAdminClient();
```

## Error Handling

The action client is configured with `handleServerError: (error) => error.message`, so the `message` of anything you
throw reaches the browser. Never throw a Supabase/driver error — log it, then throw a stable i18n key:

```typescript
const { error } = await client.from('items').insert(row);

if (error) {
  logger.error({ ...ctx, error }, 'Failed to create item');
  throw new Error('items.createFailed');
}
```

Pick one error channel per action: either throw (handled by `onError` on the client) or return
`{ success: false, error: '<i18n key>' }` (handled in `onSuccess`) — not both.

## Redirects

Call `redirect()` (or `notFound()`) in the action body and let next-safe-action handle it: the action client sets
navigation errors aside before `handleServerError`, runs `onNavigation`/`onSettled`, then re-throws so Next performs the
navigation. On the client, react to it with `useAction(..., { onNavigation })` — e.g. to close a dialog.

Never import `isRedirectError` or catch-and-rethrow redirects. The only way to break a redirect is to catch it yourself,
so keep `redirect()` **outside** any `try`/`catch`:

```typescript
try {
  await operation();
} catch (error) {
  logger.error({ ...ctx, error }, 'Operation failed');
  throw new Error('feature.operationFailed');
}

redirect('/success');
```
