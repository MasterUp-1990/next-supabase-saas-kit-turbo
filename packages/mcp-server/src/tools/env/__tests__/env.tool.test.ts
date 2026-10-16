import { describe, expect, it } from 'vitest';

import { createFakeMcpServer } from '../../../lib/testing/fake-mcp-server';
import { registerKitEnvTools } from '../index';

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('registerKitEnvTools', () => {
  it('keeps the kit_ tool names', () => {
    const fake = createFakeMcpServer();

    registerKitEnvTools(fake.server, '/repo');

    expect(fake.tools.map((tool) => tool.name).sort()).toEqual([
      'kit_env_raw_read',
      'kit_env_raw_write',
      'kit_env_read',
      'kit_env_schema',
      'kit_env_update',
    ]);
  });

  it('reads apps/web in the Next.js order, without redacting values', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kit-env-'));

    try {
      const web = join(root, 'apps', 'web');

      await mkdir(web, { recursive: true });
      await writeFile(join(web, '.env.local'), 'SUPABASE_SECRET_KEY=local\n');
      await writeFile(
        join(web, '.env.development'),
        'SUPABASE_SECRET_KEY=development\n',
      );

      const fake = createFakeMcpServer();

      registerKitEnvTools(fake.server, root);

      const result = await fake.call('kit_env_read', { mode: 'development' });
      const variables = (
        result.structuredContent as {
          variables: Record<string, { value: string; source: string }>;
        }
      ).variables;

      expect(variables['SUPABASE_SECRET_KEY']).toMatchObject({
        source: '.env.local',
        value: 'local',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
