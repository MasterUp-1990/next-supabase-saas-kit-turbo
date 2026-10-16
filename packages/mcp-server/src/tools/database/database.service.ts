import { assertSafeFileName } from '../../lib/safe-file-name';
import type {
  DatabaseFunction,
  EnumInfo,
  GetAllEnumsOutput,
  GetDatabaseFunctionsOutput,
  GetDatabaseSummaryOutput,
  GetDatabaseTablesOutput,
  GetEnumInfoInput,
  GetFunctionDetailsInput,
  GetSchemaBySectionInput,
  GetSchemaBySectionOutput,
  GetSchemaContentInput,
  GetSchemaContentOutput,
  GetSchemaFilesOutput,
  GetSchemasByTopicInput,
  GetSchemasByTopicOutput,
  GetTableInfoInput,
  ProjectTable,
  SchemaFile,
  SearchDatabaseFunctionsInput,
  SearchDatabaseFunctionsOutput,
  TableColumn,
  TableForeignKey,
  TableIndex,
  TableInfo,
} from './schema';
import {
  KNOWN_TOPICS,
  derivePurpose,
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
  parseForeignKeys,
  parseIndexes,
  parseParameterList,
  splitQualifiedName,
} from './sql-parsers';

import { join } from 'node:path';

type Row = Record<string, unknown>;

interface LoadedSchemaFile {
  file: SchemaFile;
  content: string;
}

/** Schemas whose tables and functions the tools list. */
const INCLUDE_SCHEMAS = ['public', 'kit'];

/** Schema that unqualified names in the schema files resolve to. */
const DEFAULT_SCHEMA = 'public';

/** Schemas whose enums the tools list. */
const ENUM_SCHEMAS = ['public'];

export interface DatabaseDeps {
  rootPath: string;
  readdir(path: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
  stat(path: string): Promise<{ mtime: Date }>;
  /**
   * Run a parameterised query against the local database. Implementations
   * should reject quickly when the database is unreachable; every caller
   * falls back to schema-file parsing.
   */
  query(text: string, params?: SqlParam[]): Promise<Row[]>;
  /** Release any pooled connections. Safe to call when nothing is open. */
  close?(): Promise<void>;
}

export type SqlParam = string | number | boolean | null;

const SCHEMA_FILES_NOTE =
  'Schema files under apps/web/supabase/schemas are the source of truth for the current database state. Prefer them over migrations.';

export function createDatabaseService(deps: DatabaseDeps) {
  return new DatabaseService(deps);
}

export class DatabaseService {
  constructor(private readonly deps: DatabaseDeps) {}

  get schemasDir() {
    return join(this.deps.rootPath, 'apps', 'web', 'supabase', 'schemas');
  }

  // Schema files ------------------------------------------------------------

  async getSchemaFiles(): Promise<SchemaFile[]> {
    return (await this.loadSchemaFiles()).map(({ file }) => file);
  }

  /** Schema files with their content, sorted by name. */
  private async loadSchemaFiles(): Promise<LoadedSchemaFile[]> {
    let names: string[];

    try {
      names = await this.deps.readdir(this.schemasDir);
    } catch {
      return [];
    }

    const files: LoadedSchemaFile[] = [];

    for (const name of names.filter((file) => file.endsWith('.sql'))) {
      const path = join(this.schemasDir, name);
      const content = await this.deps.readFile(path);
      const { mtime } = await this.deps.stat(path);
      const header = extractSectionHeader(content);

      files.push({
        content,
        file: {
          name,
          path,
          section: header.section,
          description: header.description,
          lastModified: mtime.toISOString(),
          tables: extractTableNames(content),
          functions: extractFunctionNames(content),
          dependencies: extractDependencies(content),
          topic: determineTopic(name, content),
        },
      });
    }

    return files.sort((a, b) => a.file.name.localeCompare(b.file.name));
  }

  /** Tables each schema file declares, keyed by "schema.table". */
  private tableFileMapping(schemaFiles: LoadedSchemaFile[]) {
    const mapping = new Map<
      string,
      { schema: string; name: string; file: SchemaFile }
    >();

    for (const { file, content } of schemaFiles) {
      for (const table of extractQualifiedTableNames(content)) {
        const schema = table.schema ?? DEFAULT_SCHEMA;
        const key = `${schema}.${table.name}`;

        if (!mapping.has(key)) {
          mapping.set(key, { schema, name: table.name, file });
        }
      }
    }

    return mapping;
  }

  async listSchemaFiles(): Promise<GetSchemaFilesOutput> {
    const files = await this.getSchemaFiles();

    return {
      files,
      total: files.length,
      schemas_dir: this.schemasDir,
      note: SCHEMA_FILES_NOTE,
    };
  }

  async getSchemaContent(
    input: GetSchemaContentInput,
  ): Promise<GetSchemaContentOutput> {
    const fileName = assertSafeFileName(input.fileName, 'schema file name');
    const path = join(this.schemasDir, fileName);

    try {
      return { fileName, path, content: await this.deps.readFile(path) };
    } catch {
      throw new Error(`Schema file "${fileName}" not found`);
    }
  }

  async getSchemasByTopic(
    input: GetSchemasByTopicInput,
  ): Promise<GetSchemasByTopicOutput> {
    const term = input.topic.toLowerCase();

    const files = (await this.getSchemaFiles()).filter((file) =>
      [file.topic, file.section, file.description, file.name].some((field) =>
        field.toLowerCase().includes(term),
      ),
    );

    return {
      topic: input.topic,
      files,
      total: files.length,
      available_topics: KNOWN_TOPICS,
    };
  }

  async getSchemaBySection(
    input: GetSchemaBySectionInput,
  ): Promise<GetSchemaBySectionOutput> {
    const files = await this.getSchemaFiles();
    const term = input.section.toLowerCase();

    return {
      section: input.section,
      file: files.find((file) => file.section.toLowerCase() === term) ?? null,
      available_sections: files.map((file) => file.section),
    };
  }

  // Functions ---------------------------------------------------------------

  async getFunctions(): Promise<GetDatabaseFunctionsOutput> {
    const loaded = await this.loadSchemaFiles();
    const schemaFiles = loaded.map(({ file }) => file);

    const rows = await this.tryQuery(`
      SELECT
        p.proname AS function_name,
        n.nspname AS schema_name,
        pg_get_function_result(p.oid) AS return_type,
        pg_get_function_arguments(p.oid) AS parameters,
        p.prosecdef AS is_definer,
        obj_description(p.oid, 'pg_proc') AS description
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname IN ('public', 'kit')
        AND p.prokind = 'f'
      ORDER BY n.nspname, p.proname
    `);

    if (rows) {
      const fileMapping = buildNameMapping(schemaFiles, 'functions');

      return {
        source: 'database',
        total: rows.length,
        functions: rows.map((row) => {
          const name = asString(row.function_name);
          const schema = asString(row.schema_name);
          const description = asString(
            row.description,
            'No description available',
          );

          return {
            name,
            schema,
            returnType: asString(row.return_type, 'unknown'),
            parameters: parseParameterList(asString(row.parameters)),
            securityLevel: row.is_definer ? 'definer' : 'invoker',
            description,
            purpose: derivePurpose(description, name),
            sourceFile: fileMapping.get(`${schema}.${name}`) ?? 'unknown',
          };
        }),
      };
    }

    const functions: DatabaseFunction[] = [];

    for (const { file, content } of loaded) {
      functions.push(
        ...extractFunctionsFromContent(
          content,
          file.name,
          DEFAULT_SCHEMA,
        ).filter((fn) => INCLUDE_SCHEMAS.includes(fn.schema)),
      );
    }

    functions.sort((a, b) => a.name.localeCompare(b.name));

    return { source: 'schema_files', total: functions.length, functions };
  }

  async getFunctionDetails(
    input: GetFunctionDetailsInput,
  ): Promise<DatabaseFunction> {
    const { functions } = await this.getFunctions();
    const parts = splitQualifiedName(input.functionName.trim());
    const name = parts[parts.length - 1] ?? '';
    const schema = parts.length > 1 ? parts[parts.length - 2]! : null;

    const match = schema
      ? functions.find((fn) => fn.name === name && fn.schema === schema)
      : // Without a schema prefix prefer public, then anything else.
        (functions.find((fn) => fn.name === name && fn.schema === 'public') ??
        functions.find((fn) => fn.name === name));

    if (!match) {
      throw new Error(`Function "${input.functionName}" not found`);
    }

    return match;
  }

  async searchFunctions(
    input: SearchDatabaseFunctionsInput,
  ): Promise<SearchDatabaseFunctionsOutput> {
    const { functions } = await this.getFunctions();
    const term = input.query.toLowerCase();
    const parts = term.split('.');
    const nameTerm = parts[parts.length - 1]!;
    const schemaTerm = parts.length > 1 ? parts[0]! : null;

    const matches = functions.filter((fn) => {
      if (schemaTerm) {
        return (
          fn.schema.toLowerCase() === schemaTerm &&
          fn.name.toLowerCase().includes(nameTerm)
        );
      }

      return [fn.name, fn.description, fn.purpose, fn.returnType].some(
        (field) => field.toLowerCase().includes(term),
      );
    });

    return { query: input.query, functions: matches, total: matches.length };
  }

  // Tables ------------------------------------------------------------------

  async getTables(): Promise<GetDatabaseTablesOutput> {
    const fileMapping = this.tableFileMapping(await this.loadSchemaFiles());

    const rows = await this.tryQuery(`
      SELECT t.table_name, t.table_schema
      FROM information_schema.tables t
      WHERE t.table_schema IN ('public', 'kit')
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_schema, t.table_name
    `);

    const tables: ProjectTable[] = rows
      ? rows.map((row) => {
          const name = asString(row.table_name);
          const schema = asString(row.table_schema, DEFAULT_SCHEMA);
          const file = fileMapping.get(`${schema}.${name}`)?.file;

          return {
            name,
            schema,
            sourceFile: file?.name ?? 'database',
            topic: file?.topic ?? 'general',
          };
        })
      : [...fileMapping.values()]
          .filter(({ schema }) => INCLUDE_SCHEMAS.includes(schema))
          .map(({ schema, name, file }) => ({
            name,
            schema,
            sourceFile: file.name,
            topic: file.topic,
          }));

    return { tables, total: tables.length };
  }

  /**
   * Accepts "schema.table" (quoted or bare) in tableName; a schema given
   * there wins over the separate schema field. Columns, foreign keys and
   * indexes come from the live database; the schema file declaring the
   * table supplies its source file, topic and CREATE statement. Without the
   * table in the database, the schema file alone describes it.
   */
  async getTableInfo(input: GetTableInfoInput): Promise<TableInfo> {
    const qualified = splitQualifiedName(input.tableName.trim());
    const tableName = qualified[qualified.length - 1] ?? '';
    const schema =
      qualified.length > 1
        ? qualified[qualified.length - 2]!
        : input.schema || DEFAULT_SCHEMA;

    // Unqualified CREATE TABLE statements only declare default-schema tables.
    const allowUnqualified = schema === DEFAULT_SCHEMA;

    const [declared, liveColumns, liveForeignKeys, liveIndexes] =
      await Promise.all([
        this.findTableDefinition(schema, tableName, allowUnqualified),
        this.getColumnsFromDb(schema, tableName),
        this.getForeignKeysFromDb(schema, tableName),
        this.getIndexesFromDb(schema, tableName),
      ]);

    if (liveColumns) {
      return {
        name: tableName,
        schema,
        sourceFile: declared?.file.name ?? 'database',
        topic: declared?.file.topic ?? 'general',
        columns: liveColumns,
        foreignKeys: liveForeignKeys ?? [],
        indexes: liveIndexes ?? [],
        createStatement: declared?.definition ?? '',
        source: 'database',
      };
    }

    if (declared) {
      return {
        name: tableName,
        schema,
        sourceFile: declared.file.name,
        topic: declared.file.topic,
        columns: parseColumns(declared.definition),
        foreignKeys: parseForeignKeys(declared.definition),
        indexes: parseIndexes(
          declared.content,
          tableName,
          schema,
          allowUnqualified,
        ),
        createStatement: declared.definition,
        source: 'schema_files',
      };
    }

    throw new Error(
      `Table ${schema}.${tableName} not found in the database or the schema files`,
    );
  }

  /** The first schema file declaring the table, with its CREATE statement. */
  private async findTableDefinition(
    schema: string,
    tableName: string,
    allowUnqualified: boolean,
  ) {
    for (const { file, content } of await this.loadSchemaFiles()) {
      const definition = extractTableDefinition(
        content,
        schema,
        tableName,
        allowUnqualified,
      );

      if (definition) return { file, content, definition };
    }

    return null;
  }

  // Enums -------------------------------------------------------------------

  /**
   * Enums keyed by name. Enums in the default schema keep their bare name; a
   * same-named enum in another listed schema is keyed and named "schema.name".
   */
  async getEnums(): Promise<Record<string, EnumInfo>> {
    return Object.fromEntries(
      (await this.loadEnums()).map(({ info }) => [info.name, info]),
    );
  }

  private async loadEnums(): Promise<
    Array<{ schema: string; bareName: string; info: EnumInfo }>
  > {
    const rows = await this.tryQuery(`
      SELECT
        n.nspname AS schema_name,
        t.typname AS enum_name,
        array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS enum_values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname IN (${ENUM_SCHEMAS.map((schema) => `'${schema}'`).join(', ')})
      GROUP BY n.nspname, t.typname
      ORDER BY n.nspname = '${DEFAULT_SCHEMA}' DESC, n.nspname, t.typname
    `);

    const found: Array<{
      schema: string;
      name: string;
      values: string[];
      sourceFile: string;
    }> = [];

    if (rows && rows.length > 0) {
      for (const row of rows) {
        found.push({
          schema: asString(row.schema_name, DEFAULT_SCHEMA),
          name: asString(row.enum_name),
          values: Array.isArray(row.enum_values)
            ? row.enum_values.map(String)
            : [],
          sourceFile: 'database',
        });
      }
    } else {
      for (const { file, content } of await this.loadSchemaFiles()) {
        for (const definition of parseEnumDefinitions(content)) {
          const schema = definition.schema ?? DEFAULT_SCHEMA;

          if (!ENUM_SCHEMAS.includes(schema)) continue;

          found.push({ ...definition, schema, sourceFile: file.name });
        }
      }

      found.sort(
        (a, b) =>
          Number(b.schema === DEFAULT_SCHEMA) -
          Number(a.schema === DEFAULT_SCHEMA),
      );
    }

    const enums = new Map<
      string,
      { schema: string; bareName: string; info: EnumInfo }
    >();

    for (const { schema, name, values, sourceFile } of found) {
      const existing = enums.get(name);

      // The same enum seen twice (a later file redefining it) replaces the
      // earlier one; a same-named enum in another schema gets its own key.
      const key =
        !existing || existing.schema === schema ? name : `${schema}.${name}`;

      enums.set(key, {
        schema,
        bareName: name,
        info: { name: key, values, sourceFile },
      });
    }

    return [...enums.values()];
  }

  async listEnums(): Promise<GetAllEnumsOutput> {
    const enums = Object.values(await this.getEnums());

    return { enums, total: enums.length };
  }

  /** Accepts the enum's name as listed, or "schema.name". */
  async getEnumInfo(input: GetEnumInfoInput): Promise<EnumInfo> {
    const enums = await this.loadEnums();
    const parts = splitQualifiedName(input.enumName.trim());
    const name = parts[parts.length - 1] ?? '';
    const schema = parts.length > 1 ? parts[parts.length - 2]! : null;

    const match =
      enums.find(({ info }) => info.name === input.enumName) ??
      enums.find(
        (entry) =>
          entry.bareName === name &&
          (schema === null
            ? entry.schema === DEFAULT_SCHEMA
            : entry.schema === schema),
      ) ??
      (schema === null
        ? enums.find((entry) => entry.bareName === name)
        : undefined);

    if (!match) {
      throw new Error(
        `Enum "${input.enumName}" not found. Available enums: ${enums.map(({ info }) => info.name).join(', ') || 'none'}`,
      );
    }

    return match.info;
  }

  // Summary -----------------------------------------------------------------

  async getSummary(): Promise<GetDatabaseSummaryOutput> {
    const [{ tables }, enums, { functions }] = await Promise.all([
      this.getTables(),
      this.getEnums(),
      this.getFunctions(),
    ]);

    const tablesByTopic: Record<string, string[]> = {};

    for (const table of tables) {
      (tablesByTopic[table.topic] ??= []).push(table.name);
    }

    return {
      overview: {
        totalTables: tables.length,
        totalEnums: Object.keys(enums).length,
        totalFunctions: functions.length,
      },
      tables,
      enums: Object.values(enums),
      functions: functions.map(({ name, schema, purpose, sourceFile }) => ({
        name,
        schema,
        purpose,
        sourceFile,
      })),
      tablesByTopic,
    };
  }

  // Live-database helpers ---------------------------------------------------

  // Keys come from pg_constraint / pg_index rather than information_schema:
  // constraint_column_usage hides tables the current role does not own
  // (e.g. auth.users) and cannot pair up the columns of composite keys.

  private async getColumnsFromDb(
    schema: string,
    tableName: string,
  ): Promise<TableColumn[] | null> {
    const rows = await this.tryQuery(
      `
      SELECT
        c.column_name,
        -- data_type says only USER-DEFINED / ARRAY for enums and arrays, and
        -- drops lengths; format_type gives the declared type.
        format_type(att.atttypid, att.atttypmod) AS data_type,
        c.is_nullable,
        c.column_default,
        EXISTS (
          SELECT 1
          FROM pg_constraint pk
          WHERE pk.conrelid = rel.oid
            AND pk.contype = 'p'
            AND att.attnum = ANY(pk.conkey)
        ) AS is_primary_key,
        fk.referenced_table IS NOT NULL AS is_foreign_key,
        fk.referenced_table,
        fk.referenced_column
      FROM information_schema.columns c
      JOIN pg_namespace ns ON ns.nspname = c.table_schema
      JOIN pg_class rel ON rel.relnamespace = ns.oid AND rel.relname = c.table_name
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attname = c.column_name
      LEFT JOIN LATERAL (
        SELECT ref.relname AS referenced_table, ref_att.attname AS referenced_column
        FROM pg_constraint con
        CROSS JOIN LATERAL unnest(con.conkey, con.confkey) AS k(attnum, ref_attnum)
        JOIN pg_class ref ON ref.oid = con.confrelid
        JOIN pg_attribute ref_att
          ON ref_att.attrelid = con.confrelid AND ref_att.attnum = k.ref_attnum
        WHERE con.conrelid = rel.oid
          AND con.contype = 'f'
          AND k.attnum = att.attnum
        ORDER BY con.conname
        LIMIT 1
      ) fk ON true
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY c.ordinal_position
    `,
      [schema, tableName],
    );

    if (!rows || rows.length === 0) return null;

    return rows.map((row) => ({
      name: asString(row.column_name),
      type: asString(row.data_type),
      nullable: row.is_nullable === 'YES',
      defaultValue: optionalString(row.column_default),
      isPrimaryKey: Boolean(row.is_primary_key),
      isForeignKey: Boolean(row.is_foreign_key),
      referencedTable: optionalString(row.referenced_table),
      referencedColumn: optionalString(row.referenced_column),
    }));
  }

  private async getForeignKeysFromDb(
    schema: string,
    tableName: string,
  ): Promise<TableForeignKey[] | null> {
    const rows = await this.tryQuery(
      `
      SELECT
        con.conname AS constraint_name,
        array_agg(att.attname::text ORDER BY k.ord) AS columns,
        ref.relname AS foreign_table_name,
        array_agg(ref_att.attname::text ORDER BY k.ord) AS foreign_columns,
        ${FK_ACTION('confdeltype')} AS delete_rule,
        ${FK_ACTION('confupdtype')} AS update_rule
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      JOIN pg_class ref ON ref.oid = con.confrelid
      CROSS JOIN LATERAL unnest(con.conkey, con.confkey)
        WITH ORDINALITY AS k(attnum, ref_attnum, ord)
      JOIN pg_attribute att
        ON att.attrelid = con.conrelid AND att.attnum = k.attnum
      JOIN pg_attribute ref_att
        ON ref_att.attrelid = con.confrelid AND ref_att.attnum = k.ref_attnum
      WHERE con.contype = 'f'
        AND ns.nspname = $1
        AND rel.relname = $2
      GROUP BY con.oid, con.conname, ref.relname, con.confdeltype, con.confupdtype
      ORDER BY con.conname
    `,
      [schema, tableName],
    );

    if (!rows) return null;

    return rows.map((row) => ({
      name: asString(row.constraint_name),
      columns: asStringList(row.columns),
      referencedTable: asString(row.foreign_table_name),
      referencedColumns: asStringList(row.foreign_columns),
      onDelete: optionalString(row.delete_rule),
      onUpdate: optionalString(row.update_rule),
    }));
  }

  private async getIndexesFromDb(
    schema: string,
    tableName: string,
  ): Promise<TableIndex[] | null> {
    // Key columns in index order; expressions come back as their SQL text.
    const rows = await this.tryQuery(
      `
      SELECT
        ic.relname AS indexname,
        pg_get_indexdef(ix.indexrelid) AS indexdef,
        ix.indisunique AS is_unique,
        am.amname AS method,
        ARRAY(
          SELECT COALESCE(a.attname::text, pg_get_indexdef(ix.indexrelid, k, true))
          FROM generate_series(1, ix.indnkeyatts) AS k
          LEFT JOIN pg_attribute a
            ON a.attrelid = ix.indrelid AND a.attnum = ix.indkey[k - 1]
           AND ix.indkey[k - 1] <> 0
          ORDER BY k
        ) AS columns
      FROM pg_index ix
      JOIN pg_class rel ON rel.oid = ix.indrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      JOIN pg_class ic ON ic.oid = ix.indexrelid
      JOIN pg_am am ON am.oid = ic.relam
      WHERE ns.nspname = $1
        AND rel.relname = $2
        AND NOT ix.indisprimary
      ORDER BY ic.relname
    `,
      [schema, tableName],
    );

    if (!rows) return null;

    return rows.map((row) => ({
      name: asString(row.indexname),
      columns: asStringList(row.columns),
      unique: Boolean(row.is_unique),
      type: asString(row.method, 'btree'),
      definition: asString(row.indexdef),
    }));
  }

  /** Returns null when the database is unreachable or the query fails. */
  private async tryQuery(text: string, params: SqlParam[] = []) {
    try {
      return await this.deps.query(text, params);
    } catch {
      return null;
    }
  }
}

function buildNameMapping(schemaFiles: SchemaFile[], key: 'functions') {
  const mapping = new Map<string, string>();

  for (const file of schemaFiles) {
    for (const name of file[key]) {
      mapping.set(`public.${name}`, file.name);
      mapping.set(`kit.${name}`, file.name);
      mapping.set(name, file.name);
    }
  }

  return mapping;
}

/** The rule names information_schema.referential_constraints reports. */
const FK_ACTION = (column: string) => `
  CASE con.${column}
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END`;

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);

  return asString(value).split(',').filter(Boolean);
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;

  return String(value);
}

function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;

  return String(value);
}
