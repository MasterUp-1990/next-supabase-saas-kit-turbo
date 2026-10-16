import { describe, expect, it } from 'vitest';

import { FILE_TOPIC_MAP } from '../sql-parsers';

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// packages/mcp-server/src/tools/database/__tests__ -> repository root
const ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  ...Array(6).fill('..'),
);
const SCHEMAS_DIR = join(ROOT, 'apps', 'web', 'supabase', 'schemas');

describe("the kit's schema files", () => {
  const files = readdirSync(SCHEMAS_DIR).filter((name) =>
    name.endsWith('.sql'),
  );

  it('exist', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('each have an explicit topic', () => {
    expect(files.filter((name) => !(name in FILE_TOPIC_MAP))).toEqual([]);
  });

  it('are the only files the topic map lists', () => {
    expect(
      Object.keys(FILE_TOPIC_MAP).filter((name) => !files.includes(name)),
    ).toEqual([]);
  });
});
