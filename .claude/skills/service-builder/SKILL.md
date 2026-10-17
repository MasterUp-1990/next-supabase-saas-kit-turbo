---
name: service-builder
description: Build pure, interface-agnostic services with injected dependencies. Use when creating business logic that must work across server actions, MCP tools, CLI commands, or tests. Invoke with /service-builder.
---

# Service Builder

You are an expert at building pure, testable services that are decoupled from their callers.

## North Star

**Every service is decoupled from its interface (I/O).** A service takes plain data in, does work, and returns plain
data out. It has no knowledge of whether it was called from an MCP tool, a server action, a CLI command, a route
handler, or a test. The caller is a thin adapter that resolves dependencies and delegates.

## Workflow

When asked to create a service, follow these steps:

### Step 1: Define the Contract

Start with the input/output types. Inputs come from the Zod schema; row types come from the generated database types
(`Tables<'table'>` from `@kit/supabase/database`) — never hand-write a row interface, it drifts from the schema.

```typescript
// _lib/schemas/project.schema.ts
import * as z from 'zod';

import type { Tables } from '@kit/supabase/database';

export const CreateProjectSchema = z.object({
  name: z.string().trim().min(1, { message: 'projects.nameRequired' }),
  accountId: z.uuid(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export type Project = Tables<'projects'>;
```

### Step 2: Build the Service

The service receives all dependencies through its constructor. It never imports framework-specific modules (
`getSupabaseServerClient`, `getLogger`, `revalidatePath`, etc.).

```typescript
// _lib/server/project.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Logger } from '@kit/shared/logger';
import type { Database } from '@kit/supabase/database';

import type { CreateProjectInput, Project } from '../schemas/project.schema';

export function createProjectService(
  client: SupabaseClient<Database>,
  logger: Logger,
) {
  return new ProjectService(client, logger);
}

class ProjectService {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly logger: Logger,
  ) {}

  async create(data: CreateProjectInput): Promise<Project> {
    const { data: result, error } = await this.client
      .from('projects')
      .insert({
        name: data.name,
        account_id: data.accountId,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(
        { name: 'create-project', accountId: data.accountId, error },
        'Failed to create project',
      );

      throw new Error('projects.createFailed');
    }

    return result;
  }

  async list(accountId: string): Promise<Project[]> {
    const { data, error } = await this.client
      .from('projects')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(
        { name: 'list-projects', accountId, error },
        'Failed to list projects',
      );

      throw new Error('projects.listFailed');
    }

    return data;
  }

  async delete(projectId: string): Promise<void> {
    const { error } = await this.client
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) {
      this.logger.error(
        { name: 'delete-project', projectId, error },
        'Failed to delete project',
      );

      throw new Error('projects.deleteFailed');
    }
  }
}
```

**Never `throw error` with a Supabase error.** Server actions serialize the thrown `message` to the browser
(`handleServerError: (error) => error.message`), so a raw driver error leaks RLS policy text and constraint names. Log
the detail through the injected logger, then throw a stable i18n key the UI can translate. See `packages/next/AGENTS.md`
→ "Errors reach the browser".

### Step 3: Write Thin Adapters

Each interface is a thin adapter — it resolves dependencies, calls the service, and handles interface-specific
concerns (revalidation, redirects, MCP formatting, CLI output).

**Server Action adapter:**

```typescript
// _lib/server/server-actions.ts
'use server';

import { revalidatePath } from 'next/cache';

import { authActionClient } from '@kit/next/safe-action';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { CreateProjectSchema } from '../schemas/project.schema';
import { createProjectService } from './project.service';

export const createProjectAction = authActionClient
  .inputSchema(CreateProjectSchema)
  .action(async ({ parsedInput: data, ctx: { user } }) => {
    const logger = await getLogger();
    logger.info({ name: 'create-project', userId: user.id }, 'Creating project');

    const client = getSupabaseServerClient();
    const service = createProjectService(client, logger);
    const result = await service.create(data);

    revalidatePath('/home/[account]/projects', 'page');

    return { success: true, data: result };
  });
```

**Route Handler adapter:**

```typescript
// app/api/projects/route.ts
import { NextResponse } from 'next/server';

import { enhanceRouteHandler } from '@kit/next/routes';
import { getLogger } from '@kit/shared/logger';

import { CreateProjectSchema } from '../_lib/schemas/project.schema';
import { createProjectService } from '../_lib/server/project.service';

export const POST = enhanceRouteHandler(
  async function ({ body, client }) {
    const service = createProjectService(client, await getLogger());
    const result = await service.create(body);

    return NextResponse.json(result);
  },
  {
    auth: true,
    schema: CreateProjectSchema,
  },
);
```

Use the `client` that `enhanceRouteHandler` passes in, not `getSupabaseServerClient()`. When the request carries an
`Authorization: Bearer` header (mobile/native callers), that client is built from the token; the cookie client would
query as an anonymous user. `/api/*` is excluded from the proxy's cookie check, so bearer callers do reach these routes.

**MCP Tool adapter:**

```typescript
// mcp/tools/kit_project_create.ts
import { createProjectService } from '../../_lib/server/project.service';

export const kit_project_create: McpToolHandler = async (input, context) => {
  const client = context.getSupabaseClient();
  const service = createProjectService(client, context.logger);

  return service.create(input);
};
```

### Step 4: Write Tests

Because the service accepts dependencies, you can test it with stubs — no running database, no framework runtime.

```typescript
// _lib/server/__tests__/project.service.test.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, it, expect, vi } from 'vitest';

import type { Logger } from '@kit/shared/logger';

import { createProjectService } from '../project.service';

function createStubLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  } as unknown as Logger;
}

function createMockClient(overrides: Record<string, unknown> = {}) {
  const mockChain = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { id: 'proj-1', name: 'Test', account_id: 'acc-1', created_at: new Date().toISOString() },
      error: null,
    }),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    ...overrides,
  };

  return {
    from: vi.fn(() => mockChain),
    mockChain,
  } as unknown as SupabaseClient;
}

describe('ProjectService', () => {
  it('creates a project', async () => {
    const client = createMockClient();
    const service = createProjectService(client, createStubLogger());

    const result = await service.create({
      name: 'Test Project',
      accountId: 'acc-1',
    });

    expect(result.id).toBe('proj-1');
    expect(client.from).toHaveBeenCalledWith('projects');
  });

  it('logs the driver error and throws a stable key', async () => {
    const dbError = { message: 'duplicate key value violates unique constraint' };

    const client = createMockClient({
      single: vi.fn().mockResolvedValue({ data: null, error: dbError }),
    });

    const logger = createStubLogger();
    const service = createProjectService(client, logger);

    await expect(
      service.create({ name: 'Dup', accountId: 'acc-1' }),
    ).rejects.toThrow('projects.createFailed');

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: dbError }),
      expect.any(String),
    );
  });
});
```

## Rules

1. **Services are pure functions over data.** Plain objects/primitives in, plain objects/primitives out. No `Request`/
   `Response`, no MCP context, no `FormData`.

2. **Inject dependencies, never import them.** The service receives its database client, logger, storage client, or any
   I/O capability as a constructor argument. Never call `getSupabaseServerClient()` or `getLogger()` inside a service.

3. **Never throw driver errors.** Log the Supabase error through the injected logger and throw `new Error('namespace.key')`.
   The thrown `message` reaches the browser.

4. **Adapters are trivial glue.** A server action resolves the client, calls the service, and handles `revalidatePath`.
   An MCP tool resolves the client, calls the service, and formats the response. No business logic in adapters.

5. **One service, many callers.** If two interfaces do the same thing, they call the same service function. Duplicating
   logic is a violation.

6. **Testable in isolation.** Pass a mock client, assert the output. If you need a running database to test a service,
   refactor until you don't.

## What Goes Where

| Concern                | Location                              | Example                                          |
|------------------------|---------------------------------------|--------------------------------------------------|
| Input validation (Zod) | `_lib/schemas/`                       | `CreateProjectSchema`                            |
| Row types              | `_lib/schemas/`                       | `type Project = Tables<'projects'>`              |
| Business logic         | `_lib/server/*.service.ts`            | `ProjectService.create()`                        |
| Auth check             | Adapter (`authActionClient`)          | Server action wrapper                            |
| Logging                | Adapter resolves it; service uses it  | `getLogger()` in adapter, `this.logger.error()`  |
| Cache revalidation     | Adapter                               | `revalidatePath('/home/[account]/x', 'page')`    |
| Redirect               | Adapter                               | `redirect()` after creation                      |
| MCP response format    | Adapter                               | Return service result as MCP content             |

## File Structure

```
feature/
├── _lib/
│   ├── schemas/
│   │   └── feature.schema.ts       # Zod schemas + TS types
│   └── server/
│       ├── feature.service.ts       # Pure service (dependencies injected)
│       ├── server-actions.ts        # Server action adapters
│       └── __tests__/
│           └── feature.service.test.ts  # Unit tests with mock client
└── _components/
    └── feature-form.tsx
```

## Anti-Patterns

```typescript
// ❌ BAD: Service imports framework-specific client
class ProjectService {
  async create(data: CreateProjectInput) {
    const client = getSupabaseServerClient(); // coupling!
    // ...
  }
}

// ❌ BAD: Business logic in the adapter
export const createProjectAction = authActionClient
  .inputSchema(CreateProjectSchema)
  .action(async ({ parsedInput: data }) => {
    const client = getSupabaseServerClient();
    // Business logic directly in the action — not reusable
    if (data.name.length > 100) throw new Error('projects.nameTooLong');
    const { data: result } = await client.from('projects').insert(data);
    return result;
  });

// ❌ BAD: Throwing the driver error — its message is sent to the browser
if (error) throw error;

// ❌ BAD: Hand-written row interface — drifts from the schema
interface Project { id: string; name: string; account_id: string }
// Should be: type Project = Tables<'projects'>;

// ❌ BAD: Two interfaces duplicate the same logic
// server-actions.ts
const result = await client.from('projects').insert(...).select().single();
// mcp-tool.ts
const result = await client.from('projects').insert(...).select().single();
// Should be: both call projectService.create()
```

## Reference

See `[Examples](examples.md)` for more patterns including services with multiple dependencies, services that compose
other services, and testing strategies.
