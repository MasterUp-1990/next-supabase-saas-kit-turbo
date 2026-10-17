---
name: server-action-builder
description: Create Next.js Server Actions with authActionClient, Zod validation, and service patterns. Use when implementing mutations, form submissions, or API operations that need authentication and validation. Invoke with /server-action-builder.
---

# Server Action Builder

You are an expert at creating type-safe server actions for Makerkit following established patterns.

## Workflow

When asked to create a server action, follow these steps:

### Step 1: Create Zod Schema

Create validation schema in `_lib/schemas/`:

```typescript
// _lib/schemas/feature.schema.ts
import * as z from 'zod';

export const CreateFeatureSchema = z.object({
  name: z.string().trim().min(1, { message: 'features.nameRequired' }),
  accountId: z.uuid(),
});

export type CreateFeatureInput = z.output<typeof CreateFeatureSchema>;
```

Validation `message`s are **i18n keys** (`'namespace.key'`), not prose — `FormMessage` passes them through `Trans`.
See `packages/ui/AGENTS.md` → Zod.

### Step 2: Create Service Layer

**North star: services are decoupled from their interface.** The service is pure logic — it receives a database client
as a dependency, never imports one. This means the same service works whether called from a server action, an MCP tool,
a CLI command, or a plain unit test.

Create service in `_lib/server/`:

```typescript
// _lib/server/feature.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@kit/supabase/database';
import type { Logger } from '@kit/shared/logger';

import type { CreateFeatureInput } from '../schemas/feature.schema';

export function createFeatureService(
  client: SupabaseClient<Database>,
  logger: Logger,
) {
  return new FeatureService(client, logger);
}

class FeatureService {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly logger: Logger,
  ) {}

  async create(data: CreateFeatureInput) {
    const { data: result, error } = await this.client
      .from('features')
      .insert({
        name: data.name,
        account_id: data.accountId,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(
        { name: 'create-feature', accountId: data.accountId, error },
        'Failed to create feature',
      );

      throw new Error('features.createFailed');
    }

    return result;
  }
}
```

The service never calls `getSupabaseServerClient()` or `getLogger()` — the caller provides both. This keeps the service
testable (pass a mock client and a stub logger) and reusable (any interface can supply its own).

**Never `throw error` with a Supabase error.** The action client is configured with
`handleServerError: (error) => error.message`, so whatever you throw is serialized to the browser — a raw driver error
ships RLS policy text and constraint names to anyone who can POST the action. Log the detail server-side, then throw a
stable i18n key. See `packages/next/AGENTS.md` → "Errors reach the browser".

### Step 3: Create Server Action (Thin Adapter)

The action is a **thin adapter** — it resolves dependencies (client, logger) and delegates to the service. No business
logic lives here.

Create action in `_lib/server/server-actions.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';

import { authActionClient } from '@kit/next/safe-action';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { CreateFeatureSchema } from '../schemas/feature.schema';
import { createFeatureService } from './feature.service';

export const createFeatureAction = authActionClient
  .inputSchema(CreateFeatureSchema)
  .action(async ({ parsedInput: data, ctx: { user } }) => {
    const logger = await getLogger();
    const ctx = { name: 'create-feature', userId: user.id };

    logger.info(ctx, 'Creating feature');

    const client = getSupabaseServerClient();
    const service = createFeatureService(client, logger);
    const result = await service.create(data);

    logger.info({ ...ctx, featureId: result.id }, 'Feature created');

    revalidatePath('/home/[account]/features', 'page');

    return { success: true, data: result };
  });
```

For **public actions** (no auth required), use `publicActionClient`:

```typescript
import { publicActionClient } from '@kit/next/safe-action';

export const publicFeatureAction = publicActionClient
  .inputSchema(FeatureSchema)
  .action(async ({ parsedInput: data }) => {
    // no ctx.user available
    return { success: true };
  });
```

## Key Patterns

1. **Services are pure, interfaces are thin adapters.** The service contains all business logic. The server action (or
   MCP tool, or CLI command) is glue code that resolves dependencies and calls the service. If an MCP tool and a server
   action do the same thing, they call the same service function.
2. **Inject dependencies, don't import them in services.** Services receive their database client, logger, or any I/O
   capability as constructor arguments — never by importing framework-specific modules. This keeps them testable with
   stubs and reusable across interfaces.
3. **Schema in separate file** - Reusable between client and server
4. **Logging** - Always log before and after operations
5. **Revalidation** - Use `revalidatePath` after mutations with the route-file pattern **plus a type**
   (`revalidatePath('/home/[account]/features', 'page')`). The type is required when the path has a dynamic segment.
   Never interpolate the slug into the path.
6. **Errors are i18n keys** - Log driver errors server-side; throw `new Error('namespace.key')`, never the raw error
7. **Trust RLS** - Don't add manual auth checks (RLS handles it)
8. **Testable in isolation** - Because services accept their dependencies, you can test them with a mock client and no
   running infrastructure

## File Structure

```
feature/
├── _lib/
│   ├── schemas/
│   │   └── feature.schema.ts
│   └── server/
│       ├── feature.service.ts
│       └── server-actions.ts
└── _components/
    └── feature-form.tsx
```

## Reference Files

See examples in:
- `[Examples](examples.md)`
- `[Reference](reference.md)`
