import { describe, expect, it } from 'vitest';

import { createFakeMcpServer } from '../../../lib/testing/fake-mcp-server';
import { createKitMailboxSettings, registerKitEmailsTools } from '../index';

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('registerKitEmailsTools', () => {
  it('keeps the kit_ tool names and leaves kit_mailbox_status to the dev tools', () => {
    const fake = createFakeMcpServer();

    registerKitEmailsTools(fake.server, '/repo');

    expect(fake.tools.map((tool) => tool.name).sort()).toEqual([
      'kit_emails_list',
      'kit_emails_read',
      'kit_emails_set_read_status',
    ]);
  });

  it('reads the Mailpit port from the Supabase config', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kit-mailbox-'));

    try {
      const configDir = join(root, 'apps', 'web', 'supabase');

      await mkdir(configDir, { recursive: true });
      await writeFile(
        join(configDir, 'config.toml'),
        '[inbucket]\nenabled = true\nport = 55324\n',
      );

      const url = createKitMailboxSettings(root).url;

      expect(typeof url === 'function' ? await url() : url).toBe(
        'http://127.0.0.1:55324',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
