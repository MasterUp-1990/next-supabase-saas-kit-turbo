import { describe, expect, it } from 'vitest';

import { createFakeMcpServer } from '../../../lib/testing/fake-mcp-server';
import { createKitRepoChecksServices, registerRepoChecksTools } from '../index';

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('registerRepoChecksTools', () => {
  it('keeps the kit tool names, unprefixed', () => {
    const fake = createFakeMcpServer();

    registerRepoChecksTools(fake.server, '/repo');

    expect(fake.tools.map((tool) => tool.name).sort()).toEqual([
      'deps_upgrade_advisor',
      'get_healthcheck_scripts',
      'get_script_details',
      'get_scripts',
      'run_checks',
    ]);
  });

  it('describes the kit scripts with the kit catalog', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kit-repo-checks-'));

    try {
      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({
          scripts: { 'supabase:web:start': 'supabase start' },
        }),
      );

      const fake = createFakeMcpServer();

      registerRepoChecksTools(
        fake.server,
        root,
        createKitRepoChecksServices(root),
      );

      const result = await fake.call('get_script_details', {
        scriptName: 'supabase:web:start',
      });

      expect(result.structuredContent).toMatchObject({
        category: 'database',
        importance: 'critical',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
