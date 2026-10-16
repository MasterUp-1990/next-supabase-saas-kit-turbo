import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import postgres from 'postgres';

import {
  buildLocalDatabaseUrl,
  resolveSupabaseConfig,
} from '../../lib/supabase-config';
import {
  READ_ONLY_TOOL,
  buildErrorResponse,
  buildStructuredResponse,
} from '../../lib/tool-response';
import { type DatabaseDeps, createDatabaseService } from './database.service';
import {
  EmptyInputSchema,
  GetAllEnumsOutputSchema,
  GetDatabaseFunctionsOutputSchema,
  GetDatabaseSummaryOutputSchema,
  GetDatabaseTablesOutputSchema,
  GetEnumInfoInputSchema,
  GetEnumInfoOutputSchema,
  GetFunctionDetailsInputSchema,
  GetFunctionDetailsOutputSchema,
  GetSchemaBySectionInputSchema,
  GetSchemaBySectionOutputSchema,
  GetSchemaContentInputSchema,
  GetSchemaContentOutputSchema,
  GetSchemaFilesOutputSchema,
  GetSchemasByTopicInputSchema,
  GetSchemasByTopicOutputSchema,
  GetTableInfoInputSchema,
  GetTableInfoOutputSchema,
  SearchDatabaseFunctionsInputSchema,
  SearchDatabaseFunctionsOutputSchema,
} from './schema';

import { readFile, readdir, stat } from 'node:fs/promises';
import { Socket } from 'node:net';

export function registerDatabaseTools(
  server: McpServer,
  rootPath?: string,
  deps: DatabaseDeps = createDatabaseDeps(rootPath),
) {
  const service = createDatabaseService(deps);

  server.registerTool(
    'get_schema_files',
    {
      title: 'List schema files',
      description:
        'List the declarative schema files (source of truth for the current database state) with their tables, functions and topics.',
      inputSchema: EmptyInputSchema,
      outputSchema: GetSchemaFilesOutputSchema,
      annotations: READ_ONLY_TOOL,
    },
    async () => {
      try {
        return buildStructuredResponse(await service.listSchemaFiles());
      } catch (error) {
        return buildErrorResponse('get_schema_files', error);
      }
    },
  );

  server.registerTool(
    'get_schema_content',
    {
      title: 'Read a schema file',
      description:
        'Read one declarative schema file by name (current database state).',
      inputSchema: GetSchemaContentInputSchema,
      outputSchema: GetSchemaContentOutputSchema,
      annotations: READ_ONLY_TOOL,
    },
    async (input) => {
      try {
        const parsed = GetSchemaContentInputSchema.parse(input);

        return buildStructuredResponse(await service.getSchemaContent(parsed));
      } catch (error) {
        return buildErrorResponse('get_schema_content', error);
      }
    },
  );

  server.registerTool(
    'get_schemas_by_topic',
    {
      title: 'Find schema files by topic',
      description:
        'Find schema files by topic (accounts, auth, billing, permissions, teams, notifications, storage, admin). Fastest way to locate relevant SQL.',
      inputSchema: GetSchemasByTopicInputSchema,
      outputSchema: GetSchemasByTopicOutputSchema,
      annotations: READ_ONLY_TOOL,
    },
    async (input) => {
      try {
        const parsed = GetSchemasByTopicInputSchema.parse(input);

        return buildStructuredResponse(await service.getSchemasByTopic(parsed));
      } catch (error) {
        return buildErrorResponse('get_schemas_by_topic', error);
      }
    },
  );

  server.registerTool(
    'get_schema_by_section',
    {
      title: 'Find a schema file by section',
      description:
        'Get the schema file whose header declares the given section name (Accounts, Permissions, ...).',
      inputSchema: GetSchemaBySectionInputSchema,
      outputSchema: GetSchemaBySectionOutputSchema,
      annotations: READ_ONLY_TOOL,
    },
    async (input) => {
      try {
        const parsed = GetSchemaBySectionInputSchema.parse(input);

        return buildStructuredResponse(
          await service.getSchemaBySection(parsed),
        );
      } catch (error) {
        return buildErrorResponse('get_schema_by_section', error);
      }
    },
  );

  server.registerTool(
    'get_database_functions',
    {
      title: 'List database functions',
      description:
        'List database functions in the public and kit schemas with parameters, return type, SECURITY DEFINER/INVOKER and source file. Uses the live database when available, schema files otherwise.',
      inputSchema: EmptyInputSchema,
      outputSchema: GetDatabaseFunctionsOutputSchema,
      annotations: READ_ONLY_TOOL,
    },
    async () => {
      try {
        return buildStructuredResponse(await service.getFunctions());
      } catch (error) {
        return buildErrorResponse('get_database_functions', error);
      }
    },
  );

  server.registerTool(
    'get_function_details',
    {
      title: 'Describe a database function',
      description:
        'Get one database function by name (optionally schema-qualified). SECURITY DEFINER functions bypass RLS; treat them carefully.',
      inputSchema: GetFunctionDetailsInputSchema,
      outputSchema: GetFunctionDetailsOutputSchema,
      annotations: READ_ONLY_TOOL,
    },
    async (input) => {
      try {
        const parsed = GetFunctionDetailsInputSchema.parse(input);

        return buildStructuredResponse(
          await service.getFunctionDetails(parsed),
        );
      } catch (error) {
        return buildErrorResponse('get_function_details', error);
      }
    },
  );

  server.registerTool(
    'search_database_functions',
    {
      title: 'Search database functions',
      description:
        'Search database functions by name, description, purpose or return type.',
      inputSchema: SearchDatabaseFunctionsInputSchema,
      outputSchema: SearchDatabaseFunctionsOutputSchema,
      annotations: READ_ONLY_TOOL,
    },
    async (input) => {
      try {
        const parsed = SearchDatabaseFunctionsInputSchema.parse(input);

        return buildStructuredResponse(await service.searchFunctions(parsed));
      } catch (error) {
        return buildErrorResponse('search_database_functions', error);
      }
    },
  );

  server.registerTool(
    'get_database_summary',
    {
      title: 'Database overview',
      description:
        'Overview of tables, enums and functions grouped by topic. Good first call before deeper lookups.',
      inputSchema: EmptyInputSchema,
      outputSchema: GetDatabaseSummaryOutputSchema,
      annotations: READ_ONLY_TOOL,
    },
    async () => {
      try {
        return buildStructuredResponse(await service.getSummary());
      } catch (error) {
        return buildErrorResponse('get_database_summary', error);
      }
    },
  );

  server.registerTool(
    'get_database_tables',
    {
      title: 'List tables',
      description:
        'List project tables in the public and kit schemas with their source schema file and topic.',
      inputSchema: EmptyInputSchema,
      outputSchema: GetDatabaseTablesOutputSchema,
      annotations: READ_ONLY_TOOL,
    },
    async () => {
      try {
        return buildStructuredResponse(await service.getTables());
      } catch (error) {
        return buildErrorResponse('get_database_tables', error);
      }
    },
  );

  server.registerTool(
    'get_table_info',
    {
      title: 'Describe a table',
      description:
        'Columns, foreign keys, indexes and the CREATE TABLE statement for one table (tableName may be schema.table). Live database data when available, schema-file parsing otherwise.',
      inputSchema: GetTableInfoInputSchema,
      outputSchema: GetTableInfoOutputSchema,
      annotations: READ_ONLY_TOOL,
    },
    async (input) => {
      try {
        const parsed = GetTableInfoInputSchema.parse(input);

        return buildStructuredResponse(await service.getTableInfo(parsed));
      } catch (error) {
        return buildErrorResponse('get_table_info', error);
      }
    },
  );

  server.registerTool(
    'get_enum_info',
    {
      title: 'Describe an enum',
      description:
        'Get one enum type with all of its values (name as listed, or schema.name).',
      inputSchema: GetEnumInfoInputSchema,
      outputSchema: GetEnumInfoOutputSchema,
      annotations: READ_ONLY_TOOL,
    },
    async (input) => {
      try {
        const parsed = GetEnumInfoInputSchema.parse(input);

        return buildStructuredResponse(await service.getEnumInfo(parsed));
      } catch (error) {
        return buildErrorResponse('get_enum_info', error);
      }
    },
  );

  server.registerTool(
    'get_all_enums',
    {
      title: 'List enums',
      description: 'List every enum type in the public schema with its values.',
      inputSchema: EmptyInputSchema,
      outputSchema: GetAllEnumsOutputSchema,
      annotations: READ_ONLY_TOOL,
    },
    async () => {
      try {
        return buildStructuredResponse(await service.listEnums());
      } catch (error) {
        return buildErrorResponse('get_all_enums', error);
      }
    },
  );
}

type PostgresClient = ReturnType<typeof postgres>;

interface ConnectionTarget {
  url: string;
  host: string;
  port: number;
}

/**
 * Filesystem + database dependencies for the database tools.
 *
 * The postgres client is created lazily and shared. Before every query the
 * target port is probed with a short TCP connect: postgres.js applies an
 * escalating reconnect backoff that would otherwise stall each query for tens
 * of seconds while Supabase is stopped, defeating the schema-file fallback.
 */
export function createDatabaseDeps(rootPath = process.cwd()): DatabaseDeps {
  let target: Promise<ConnectionTarget> | null = null;
  let client: PostgresClient | null = null;

  function resolveTarget() {
    target ??= (async () => {
      const explicit = process.env.DATABASE_URL;

      if (explicit) {
        const parsed = new URL(explicit);

        return {
          url: explicit,
          host: parsed.hostname || '127.0.0.1',
          port: Number(parsed.port) || 5432,
        };
      }

      const { ports } = await resolveSupabaseConfig(rootPath);

      return {
        url: buildLocalDatabaseUrl(ports.db),
        host: '127.0.0.1',
        port: ports.db,
      };
    })();

    return target;
  }

  function getClient(url: string) {
    client ??= postgres(url, {
      prepare: false,
      max: 3,
      idle_timeout: 30,
      connect_timeout: 5,
    });

    return client;
  }

  return {
    rootPath,
    readdir(path) {
      return readdir(path);
    },
    readFile(path) {
      return readFile(path, 'utf8');
    },
    async stat(path) {
      const result = await stat(path);
      return { mtime: result.mtime };
    },
    async query(text, params = []) {
      const { url, host, port } = await resolveTarget();

      if (!(await isPortOpen(host, port))) {
        throw new Error(`Database is not reachable at ${host}:${port}`);
      }

      const rows = await getClient(url).unsafe(text, params);

      return [...rows] as Record<string, unknown>[];
    },
    async close() {
      const current = client;
      client = null;

      await current?.end({ timeout: 5 });
    },
  };
}

function isPortOpen(host: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = new Socket();

    const finish = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(300);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

export { createDatabaseService, type DatabaseDeps } from './database.service';
export type {
  DatabaseFunction,
  EnumInfo,
  ProjectTable,
  SchemaFile,
  TableInfo,
} from './schema';
