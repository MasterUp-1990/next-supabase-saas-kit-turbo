import { describe, expect, it } from 'vitest';

import {
  determineTopic,
  extractDependencies,
  extractFunctionNames,
  extractFunctionsFromContent,
  extractQualifiedTableNames,
  extractSectionHeader,
  extractTableDefinition,
  extractTableNames,
  parseColumns,
  parseEnumDefinitions,
  parseEnums,
  parseForeignKeys,
  parseIndexes,
  parseParameterList,
  splitQualifiedName,
} from '../sql-parsers';

const SCHEMA = `
/*
 * -------------------------------------------------------
 * Section: Notes
 * We create the schema for notes
 * -------------------------------------------------------
 */

create type public.note_visibility as enum ('private', 'shared');

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  title varchar(255) not null,
  body text,
  visibility public.note_visibility default 'private',
  created_at timestamptz not null default now(),
  constraint notes_title_len check (char_length(title) > 0),
  foreign key (account_id) references public.accounts(id) on delete cascade
);

create index if not exists ix_notes_account_id on public.notes(account_id);
create unique index ix_notes_slug on public.notes using btree (account_id, title);

-- Returns notes for the current account
create or replace function public.list_notes(target_account_id uuid, lim int default 10)
returns setof public.notes
language sql
security invoker
as $$
  select * from public.notes where account_id = target_account_id limit lim;
$$;

create function kit.purge_notes() returns void language plpgsql security definer as $$
begin
  delete from public.notes;
end;
$$;
`;

describe('extractSectionHeader', () => {
  it('reads section and description from the header comment', () => {
    expect(extractSectionHeader(SCHEMA)).toEqual({
      section: 'Notes',
      description: 'We create the schema for notes',
    });
  });

  it('falls back when the header is absent', () => {
    expect(extractSectionHeader('create table x();')).toEqual({
      section: 'Unknown',
      description: 'No description available',
    });
  });
});

describe('name extraction', () => {
  it('extracts tables, functions and dependencies', () => {
    expect(extractTableNames(SCHEMA)).toEqual(['notes']);
    expect(extractFunctionNames(SCHEMA)).toEqual(['list_notes', 'purge_notes']);
    expect(extractDependencies(SCHEMA)).toEqual(['accounts']);
  });

  it('ignores references to auth.users', () => {
    expect(extractDependencies('references auth.users(id)')).toEqual([]);
  });
});

describe('table parsing', () => {
  const definition = extractTableDefinition(SCHEMA, 'public', 'notes')!;

  it('extracts the create statement', () => {
    expect(definition).toMatch(/^create table if not exists public\.notes/);
    expect(definition.endsWith(');')).toBe(true);
    expect(extractTableDefinition(SCHEMA, 'public', 'missing')).toBeNull();
  });

  it('parses columns with constraints', () => {
    const columns = parseColumns(definition);
    const byName = Object.fromEntries(columns.map((c) => [c.name, c]));

    expect(Object.keys(byName)).toEqual([
      'id',
      'account_id',
      'title',
      'body',
      'visibility',
      'created_at',
    ]);
    expect(byName.id).toMatchObject({ isPrimaryKey: true, nullable: false });
    expect(byName.account_id).toMatchObject({
      isForeignKey: true,
      nullable: false,
      referencedTable: 'accounts',
      referencedColumn: 'id',
    });
    expect(byName.body?.nullable).toBe(true);
    expect(byName.visibility?.defaultValue).toBe("'private'");
  });

  it('parses table-level foreign keys', () => {
    expect(parseForeignKeys(definition)).toEqual([
      {
        name: 'fk_accounts_account_id',
        columns: ['account_id'],
        referencedTable: 'accounts',
        referencedColumns: ['id'],
        onDelete: 'cascade',
        onUpdate: undefined,
      },
    ]);
  });

  it('parses indexes including unique and method', () => {
    const indexes = parseIndexes(SCHEMA, 'notes');

    expect(indexes).toHaveLength(2);
    expect(indexes[0]).toMatchObject({
      name: 'ix_notes_account_id',
      columns: ['account_id'],
      unique: false,
      type: 'btree',
    });
    expect(indexes[1]).toMatchObject({
      name: 'ix_notes_slug',
      columns: ['account_id', 'title'],
      unique: true,
    });
  });
});

describe('parseEnums', () => {
  it('parses enum types with values', () => {
    expect(parseEnums(SCHEMA, '01-enums.sql')).toEqual({
      note_visibility: {
        name: 'note_visibility',
        values: ['private', 'shared'],
        sourceFile: '01-enums.sql',
      },
    });
  });
});

describe('extractFunctionsFromContent', () => {
  it('extracts functions with schema, security level and parameters', () => {
    const functions = extractFunctionsFromContent(SCHEMA, 'notes.sql');

    expect(functions).toHaveLength(2);
    expect(functions[0]).toMatchObject({
      name: 'list_notes',
      schema: 'public',
      securityLevel: 'invoker',
      returnType: 'setof public.notes',
      description: 'Returns notes for the current account',
      sourceFile: 'notes.sql',
    });
    expect(functions[0]?.parameters).toEqual([
      { name: 'target_account_id', type: 'uuid', defaultValue: undefined },
      { name: 'lim', type: 'int', defaultValue: '10' },
    ]);
    expect(functions[1]).toMatchObject({
      name: 'purge_notes',
      schema: 'kit',
      securityLevel: 'definer',
    });
  });
});

describe('parseParameterList', () => {
  it('handles pg_get_function_arguments output', () => {
    expect(
      parseParameterList(
        'account_id uuid, permission_name public.app_permissions, OUT result boolean',
      ),
    ).toEqual([
      { name: 'account_id', type: 'uuid', defaultValue: undefined },
      {
        name: 'permission_name',
        type: 'public.app_permissions',
        defaultValue: undefined,
      },
      { name: 'result', type: 'boolean', defaultValue: undefined },
    ]);
  });

  it('returns an empty list for no arguments', () => {
    expect(parseParameterList('')).toEqual([]);
  });
});

describe('determineTopic', () => {
  it('maps known files and infers from content', () => {
    expect(determineTopic('03-accounts.sql', '')).toBe('accounts');
    expect(determineTopic('99-custom.sql', 'create table subscription_x')).toBe(
      'billing',
    );
    expect(determineTopic('99-custom.sql', 'create table widgets')).toBe(
      'general',
    );
  });
});

describe('quoted identifiers', () => {
  const QUOTED = `
create table if not exists public."UserProfile" (
  "userId" text not null references public."User"("id"),
  bio text
);
create or replace function public."getProfile"() returns void language sql as $$ select 1; $$;
`;

  it('captures the quoted table and function name, not the schema', () => {
    expect(extractTableNames(QUOTED)).toEqual(['UserProfile']);
    expect(extractQualifiedTableNames(QUOTED)).toEqual([
      { schema: 'public', name: 'UserProfile' },
    ]);
    expect(extractFunctionNames(QUOTED)).toEqual(['getProfile']);
    expect(extractDependencies(QUOTED)).toEqual(['User']);
  });

  it('finds and parses a quoted table definition', () => {
    const definition = extractTableDefinition(QUOTED, 'public', 'UserProfile');

    expect(definition).not.toBeNull();
    expect(parseColumns(definition!)[0]).toMatchObject({
      name: 'userId',
      nullable: false,
      referencedTable: 'User',
      referencedColumn: 'id',
    });
  });

  it('splits qualified names honouring quotes', () => {
    expect(splitQualifiedName('public."User"')).toEqual(['public', 'User']);
    expect(splitQualifiedName('"my.schema"."a ""b"""')).toEqual([
      'my.schema',
      'a "b"',
    ]);
    expect(splitQualifiedName('accounts')).toEqual(['accounts']);
  });
});

describe('schema-qualified lookups', () => {
  const TWO_SCHEMAS = `
create table kit.notes (id uuid primary key, kit_only text);
create table notes (id uuid primary key, title text);
create index ix_kit_notes on kit.notes (kit_only);
create index ix_notes_title on notes (title);
`;

  it('keeps tables and indexes from another schema out', () => {
    expect(extractQualifiedTableNames(TWO_SCHEMAS)).toEqual([
      { schema: 'kit', name: 'notes' },
      { schema: null, name: 'notes' },
    ]);

    expect(extractTableDefinition(TWO_SCHEMAS, 'public', 'notes')).toMatch(
      /^create table notes/,
    );
    expect(
      extractTableDefinition(TWO_SCHEMAS, 'billing', 'notes', false),
    ).toBeNull();

    expect(
      parseIndexes(TWO_SCHEMAS, 'notes', 'public').map((index) => index.name),
    ).toEqual(['ix_notes_title']);
    expect(
      parseIndexes(TWO_SCHEMAS, 'notes', 'kit', false).map(
        (index) => index.name,
      ),
    ).toEqual(['ix_kit_notes']);
  });

  it('keeps public.users as a dependency and drops auth.users only', () => {
    expect(
      extractDependencies(
        'user_id uuid references auth.users(id), profile references public.users(id)',
      ),
    ).toEqual(['users']);
    expect(extractDependencies('id uuid references auth.users')).toEqual([]);
  });

  it('reports the referenced table, not its schema', () => {
    const [column] = parseColumns(
      'create table public.t (owner uuid references auth.users(id));',
    );

    expect(column).toMatchObject({
      name: 'owner',
      isForeignKey: true,
      referencedTable: 'users',
      referencedColumn: 'id',
    });
  });
});

describe('one-line table definitions', () => {
  it('splits columns on top-level commas', () => {
    const columns = parseColumns(
      'create table public.prices (id uuid primary key, amount varchar(255) not null, note text);',
    );

    expect(columns.map((column) => column.name)).toEqual([
      'id',
      'amount',
      'note',
    ]);
    expect(columns[0]?.isPrimaryKey).toBe(true);
    expect(columns[1]?.nullable).toBe(false);
    expect(columns[2]).toMatchObject({ type: 'text', nullable: true });
  });
});

describe('function extraction edge cases', () => {
  it('reads $function$ bodies, $1 parameters and parenthesised types', () => {
    const functions = extractFunctionsFromContent(
      `
CREATE OR REPLACE FUNCTION public.find_user(email varchar(255), price numeric(10, 2) = 0)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  select id from public.users where email = $1;
$function$;
`,
      'dump.sql',
    );

    expect(functions).toHaveLength(1);
    expect(functions[0]).toMatchObject({
      name: 'find_user',
      returnType: 'uuid',
      securityLevel: 'definer',
      parameters: [
        { name: 'email', type: 'varchar(255)' },
        { name: 'price', type: 'numeric(10, 2)', defaultValue: '0' },
      ],
    });
  });

  it('only uses the comment directly above a function as its description', () => {
    const functions = extractFunctionsFromContent(SCHEMA, 'notes.sql');

    expect(functions[1]).toMatchObject({
      name: 'purge_notes',
      description: 'No description available',
    });
  });
});

describe('parseEnumDefinitions', () => {
  it('keeps the schema and values containing commas or quotes', () => {
    expect(
      parseEnumDefinitions("create type kit.label as enum ('a, b', 'it''s');"),
    ).toEqual([{ schema: 'kit', name: 'label', values: ['a, b', "it's"] }]);
  });
});

describe('SQL comments', () => {
  const COMMENTED = `
-- Create table for roles permissions
/* create table public.ghost (id int); */
/* outer /* create table nested_ghost (id int); */ still a comment */
-- create or replace function public.ghost_fn() returns void
-- create index ghost_idx on public.real (id);
-- create type public.ghost_enum as enum ('a');
-- this column references the accounts table
create table if not exists public.real (
  -- the id; it's a "key" (really)
  id int primary key, -- trailing comment, with a comma
  /* note: references public.ghost (id) */
  name text not null
);

create index real_name_idx on public.real (name);

-- Real function
create or replace function public.real_fn() returns int
language sql as $$ select 1; $$;

create type public.real_enum as enum ('x', 'y'); -- create type public.other as enum ('z');
`;

  it('ignores tables, functions, indexes, enums and dependencies in comments', () => {
    expect(extractTableNames(COMMENTED)).toEqual(['real']);
    expect(extractFunctionNames(COMMENTED)).toEqual(['real_fn']);
    expect(extractDependencies(COMMENTED)).toEqual([]);
    expect(parseIndexes(COMMENTED, 'real').map((index) => index.name)).toEqual([
      'real_name_idx',
    ]);
    expect(
      parseEnumDefinitions(COMMENTED).map((definition) => definition.name),
    ).toEqual(['real_enum']);
    expect(extractTableDefinition(COMMENTED, 'public', 'ghost')).toBeNull();
    expect(
      extractTableDefinition(COMMENTED, 'public', 'nested_ghost'),
    ).toBeNull();
  });

  it('keeps comment-like text inside string literals', () => {
    expect(
      parseEnumDefinitions(
        "create type public.marks as enum ('--', '/*', 'a');",
      )[0]?.values,
    ).toEqual(['--', '/*', 'a']);
  });

  it('parses a table whose body contains comments with quotes and parentheses', () => {
    const definition = extractTableDefinition(COMMENTED, 'public', 'real')!;
    const columns = parseColumns(definition);

    expect(columns.map((column) => column.name)).toEqual(['id', 'name']);
    expect(columns[0]).toMatchObject({ type: 'int', isPrimaryKey: true });
    expect(columns[1]).toMatchObject({
      type: 'text',
      nullable: false,
      isForeignKey: false,
    });
    expect(parseForeignKeys(definition)).toEqual([]);
  });

  it('still reads function descriptions from comments', () => {
    const [fn] = extractFunctionsFromContent(COMMENTED, 'x.sql');

    expect(fn).toMatchObject({ name: 'real_fn', description: 'Real function' });
  });
});

describe('column types and constraints', () => {
  const TABLE = `
create table public.prices (
  id uuid primary key default extensions.uuid_generate_v4 (),
  amount numeric(10, 2) not null default 0 check (amount >= 0),
  code varchar(255) unique,
  at timestamp(3) with time zone not null default now(),
  expires_at timestamptz default (now() + interval '1 month'),
  label text default coalesce(null, 'a, b') not null,
  checksum text,
  unique_code text not null,
  tags varchar(50)[] default '{}'::varchar[],
  owner uuid references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts (id),
  state text check (
    state in ('a', 'b')
    and state is not null
  ),
  ratio double precision,
  check (amount < 1000000),
  unique(code, amount)
);`;

  const columns = parseColumns(TABLE);
  const byName = Object.fromEntries(columns.map((c) => [c.name, c]));

  it('keeps every column, including names starting with keywords', () => {
    expect(columns.map((column) => column.name)).toEqual([
      'id',
      'amount',
      'code',
      'at',
      'expires_at',
      'label',
      'checksum',
      'unique_code',
      'tags',
      'owner',
      'account_id',
      'state',
      'ratio',
    ]);
  });

  it('reads types with parentheses, commas and several words', () => {
    expect(byName.amount?.type).toBe('numeric(10, 2)');
    expect(byName.code?.type).toBe('varchar(255)');
    expect(byName.at?.type).toBe('timestamp(3) with time zone');
    expect(byName.tags?.type).toBe('varchar(50)[]');
    expect(byName.ratio?.type).toBe('double precision');
  });

  it('keeps the constraints after a type with commas', () => {
    expect(byName.amount).toMatchObject({
      nullable: false,
      defaultValue: '0',
    });
    expect(byName.at).toMatchObject({ nullable: false, defaultValue: 'now()' });
    expect(byName.unique_code?.nullable).toBe(false);
  });

  it('reads default expressions with function calls and commas', () => {
    expect(byName.id?.defaultValue).toBe('extensions.uuid_generate_v4 ()');
    expect(byName.expires_at?.defaultValue).toBe(
      "(now() + interval '1 month')",
    );
    expect(byName.label).toMatchObject({
      defaultValue: "coalesce(null, 'a, b')",
      nullable: false,
    });
    expect(byName.tags?.defaultValue).toBe("'{}'::varchar[]");
  });

  it('does not read nullability from inside a check constraint', () => {
    expect(byName.state).toMatchObject({ type: 'text', nullable: true });
  });

  it('reads references with and without a space before the column list', () => {
    expect(byName.owner).toMatchObject({
      isForeignKey: true,
      referencedTable: 'users',
      referencedColumn: 'id',
      nullable: true,
    });
    expect(byName.account_id).toMatchObject({
      isForeignKey: true,
      referencedTable: 'accounts',
      referencedColumn: 'id',
      nullable: false,
    });
  });

  it('finds the whole statement when a constraint spans lines', () => {
    const definition = extractTableDefinition(TABLE, 'public', 'prices');

    expect(definition?.trim().endsWith('unique(code, amount)\n);')).toBe(true);
  });
});

describe('parseForeignKeys', () => {
  it('reads a last foreign key without ON DELETE before the closing line', () => {
    expect(
      parseForeignKeys(`create table t (
  pa int,
  pb int,
  foreign key (pa, pb) references s.parent (a, b)
);`),
    ).toMatchObject([
      {
        columns: ['pa', 'pb'],
        referencedTable: 'parent',
        referencedColumns: ['a', 'b'],
      },
    ]);
  });
});
