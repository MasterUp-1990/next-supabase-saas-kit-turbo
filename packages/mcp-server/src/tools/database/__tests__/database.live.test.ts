import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DatabaseDeps, createDatabaseService } from '../database.service';

// Runs the catalog queries against a real Supabase database when
// TEST_DATABASE_URL is set. Everything lives in a throwaway schema that is
// dropped afterwards. The schema "file" declares the tables in DDL plus one
// the database lacks; the database also has one no schema file declares.
const DATABASE_URL = process.env['TEST_DATABASE_URL'];

const S = `schema_test_${Math.random().toString(36).slice(2, 8)}`;

const DDL = `
create table ${S}.parent (a int, b int, primary key (a, b));

create table ${S}.child (
  id int constraint child_pk primary key,
  pa int,
  pb int,
  owner uuid references auth.users (id) on delete cascade,
  tags text[],
  foreign key (pa, pb) references ${S}.parent (a, b)
);

create index child_apikey on ${S}.child (pb, pa);
create index child_grouppkey on ${S}.child (owner);
create index child_expr_idx on ${S}.child ((id + 1));

create table ${S}."Widget" (id int primary key);
`;

/** Created in the database only; no schema file declares it. */
const DATABASE_ONLY_DDL = `
create table ${S}.db_only (
  id int primary key,
  child_id int references ${S}.child (id)
);

create index db_only_child_idx on ${S}.db_only (child_id);

create type ${S}.status as enum ('on', 'off');

create table ${S}.typed (
  id int primary key,
  status ${S}.status not null,
  label varchar(255),
  amount numeric(10, 2),
  flags ${S}.status[]
);
`;

/** Declared in the schema file only; never created. */
const FILE_ONLY_DDL = `
create table ${S}.file_only (
  id int primary key,
  pa int,
  pb int,
  foreign key (pa, pb) references ${S}.parent (a, b)
);
`;

describe.skipIf(!DATABASE_URL)(
  'catalog queries against a live database',
  () => {
    let sql: ReturnType<typeof postgres>;
    let deps: DatabaseDeps;

    const service = () => createDatabaseService(deps);

    beforeAll(async () => {
      sql = postgres(DATABASE_URL!, { max: 1, onnotice: () => {} });

      await sql.unsafe(`create schema ${S};\n${DDL}\n${DATABASE_ONLY_DDL}`);

      deps = {
        rootPath: '/repo',
        async readdir() {
          return ['50-test.sql'];
        },
        async readFile() {
          return `${DDL}\n${FILE_ONLY_DDL}`;
        },
        async stat() {
          return { mtime: new Date('2026-01-01T00:00:00Z') };
        },
        async query(text, params = []) {
          return [...(await sql.unsafe(text, params))] as Record<
            string,
            unknown
          >[];
        },
      };
    });

    afterAll(async () => {
      await sql?.unsafe(`drop schema if exists ${S} cascade;`);
      await sql?.end();
    });

    it('lists each column once, even when it is part of a composite foreign key', async () => {
      const info = await service().getTableInfo({
        schema: S,
        tableName: 'child',
      });

      expect(info.source).toBe('database');
      expect(info.columns.map((column) => column.name)).toEqual([
        'id',
        'pa',
        'pb',
        'owner',
        'tags',
      ]);
      expect(info.columns.find((c) => c.name === 'id')?.isPrimaryKey).toBe(
        true,
      );
      expect(info.columns.find((c) => c.name === 'owner')).toMatchObject({
        isForeignKey: true,
        referencedTable: 'users',
        referencedColumn: 'id',
      });
      expect(info.columns.find((c) => c.name === 'pb')).toMatchObject({
        isForeignKey: true,
        referencedTable: 'parent',
        referencedColumn: 'b',
      });
    });

    it('reports cross-schema and composite foreign keys', async () => {
      const info = await service().getTableInfo({
        schema: S,
        tableName: 'child',
      });
      const byTable = Object.fromEntries(
        info.foreignKeys.map((fk) => [fk.referencedTable, fk]),
      );

      expect(info.foreignKeys).toHaveLength(2);
      expect(byTable['users']).toMatchObject({
        columns: ['owner'],
        referencedColumns: ['id'],
        onDelete: 'CASCADE',
      });
      expect(byTable['parent']).toMatchObject({
        columns: ['pa', 'pb'],
        referencedColumns: ['a', 'b'],
      });
    });

    it('keeps index column order and filters only the primary key index', async () => {
      const info = await service().getTableInfo({
        schema: S,
        tableName: 'child',
      });
      const byName = Object.fromEntries(
        info.indexes.map((index) => [index.name, index]),
      );

      // child_pk is the primary key under a name LIKE '%_pkey' does not catch.
      expect(Object.keys(byName).sort()).toEqual([
        'child_apikey',
        'child_expr_idx',
        'child_grouppkey',
      ]);
      expect(byName['child_apikey']?.columns).toEqual(['pb', 'pa']);
      expect(byName['child_expr_idx']?.columns).toEqual(['(id + 1)']);
    });

    it('runs every listing query without SQL errors', async () => {
      // tryQuery hides failures behind the schema-file fallback, so record
      // them instead of looking at "source".
      const errors: unknown[] = [];
      const recording = createDatabaseService({
        ...deps,
        async query(text, params) {
          try {
            return await deps.query(text, params);
          } catch (error) {
            errors.push(error);
            throw error;
          }
        },
      });

      expect((await recording.getTables()).total).toBeGreaterThanOrEqual(0);
      await recording.listEnums();
      await recording.getFunctions();
      await recording.getSummary();

      expect(errors).toEqual([]);
    });

    it('accepts quoted identifiers', async () => {
      const info = await service().getTableInfo({
        schema: 'public',
        tableName: `${S}."Widget"`,
      });

      expect(info).toMatchObject({ schema: S, name: 'Widget' });
      expect(info.source).toBe('database');
      expect(info.columns.map((column) => column.name)).toEqual(['id']);
    });

    it('describes a table that only the database has', async () => {
      const info = await service().getTableInfo({
        schema: S,
        tableName: 'db_only',
      });

      expect(info).toMatchObject({
        name: 'db_only',
        schema: S,
        source: 'database',
        sourceFile: 'database',
        topic: 'general',
        createStatement: '',
      });
      expect(info.columns.map((column) => column.name)).toEqual([
        'id',
        'child_id',
      ]);
      expect(info.foreignKeys).toMatchObject([
        {
          columns: ['child_id'],
          referencedTable: 'child',
          referencedColumns: ['id'],
        },
      ]);
      expect(info.indexes.map((index) => index.name)).toEqual([
        'db_only_child_idx',
      ]);
    });

    it('reports enum, array and length-qualified column types by name', async () => {
      const info = await service().getTableInfo({
        schema: S,
        tableName: 'typed',
      });

      expect(
        Object.fromEntries(info.columns.map((c) => [c.name, c.type])),
      ).toEqual({
        id: 'integer',
        status: `${S}.status`,
        label: 'character varying(255)',
        amount: 'numeric(10,2)',
        flags: `${S}.status[]`,
      });
    });

    it('takes file metadata for a table declared in a schema file', async () => {
      const info = await service().getTableInfo({
        schema: S,
        tableName: 'child',
      });

      expect(info.sourceFile).toBe('50-test.sql');
      expect(info.createStatement).toMatch(/^create table \S+\.child \(/);
    });

    it('falls back to the schema file for a table the database lacks', async () => {
      const info = await service().getTableInfo({
        schema: S,
        tableName: 'file_only',
      });

      expect(info.source).toBe('schema_files');
      expect(info.sourceFile).toBe('50-test.sql');
      expect(info.columns.map((column) => column.name)).toEqual([
        'id',
        'pa',
        'pb',
      ]);
      expect(info.foreignKeys).toMatchObject([
        { columns: ['pa', 'pb'], referencedTable: 'parent' },
      ]);
    });

    it('fails only when neither the database nor the files have the table', async () => {
      await expect(
        service().getTableInfo({ schema: S, tableName: 'nowhere' }),
      ).rejects.toThrow(
        `Table ${S}.nowhere not found in the database or the schema files`,
      );
    });
  },
);
