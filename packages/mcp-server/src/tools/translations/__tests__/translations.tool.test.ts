import { describe, expect, it } from 'vitest';

import { createFakeMcpServer } from '../../../lib/testing/fake-mcp-server';
import {
  createKitTranslationsDeps,
  createKitTranslationsService,
  registerKitTranslationsTools,
} from '../index';

import { fileURLToPath } from 'node:url';

describe('registerKitTranslationsTools', () => {
  it('keeps the kit_ tool names', () => {
    const fake = createFakeMcpServer();

    registerKitTranslationsTools(fake.server, '/repo');

    expect(fake.tools.map((tool) => tool.name).sort()).toEqual([
      'kit_translations_add_locale',
      'kit_translations_add_namespace',
      'kit_translations_list',
      'kit_translations_remove_locale',
      'kit_translations_remove_namespace',
      'kit_translations_stats',
      'kit_translations_update',
    ]);
  });

  it('reads the kit messages folder', async () => {
    const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
    const service = createKitTranslationsService(
      createKitTranslationsDeps(root),
    );

    const result = await service.list();

    expect(result.base_locale).toBe('en');
    expect(result.locales).toContain('en');
    expect(result.namespaces).toContain('common');
  });
});
