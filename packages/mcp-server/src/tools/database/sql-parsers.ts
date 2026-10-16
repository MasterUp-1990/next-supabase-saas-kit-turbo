import type {
  DatabaseFunction,
  EnumInfo,
  FunctionParameter,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from './schema';

/**
 * Regex-based extraction from declarative schema files. These are fallbacks
 * for when the local database is not reachable, and metadata helpers for
 * mapping live objects back to their source file. They are intentionally
 * forgiving rather than a full SQL parser.
 */

const IDENTIFIER = '[a-zA-Z_][a-zA-Z0-9_$]*';

/** An unquoted identifier or a double-quoted one ("User", "my ""odd"" name"). */
const NAME = `(?:"(?:[^"]|"")+"|${IDENTIFIER})`;

/** `name` or `schema.name`, capturing the schema (optional) and the name. */
const QUALIFIED = `(?:(${NAME})\\s*\\.\\s*)?(${NAME})`;

export interface QualifiedName {
  /** Null when the SQL left the name unqualified. */
  schema: string | null;
  name: string;
}

export function unquoteIdentifier(value: string) {
  return value.startsWith('"') && value.endsWith('"') && value.length > 1
    ? value.slice(1, -1).replace(/""/g, '"')
    : value;
}

/**
 * Split `schema.table`, `"My Schema"."Table"` or `table` into its parts,
 * honouring quotes so dots inside quoted names do not split them.
 */
export function splitQualifiedName(value: string): string[] {
  const parts = value.match(/"(?:[^"]|"")*"|[^.]+/g) ?? [];

  return parts.map((part) => unquoteIdentifier(part.trim()));
}

function matchQualified(content: string, prefix: string): QualifiedName[] {
  const seen = new Set<string>();
  const names: QualifiedName[] = [];

  for (const match of maskSqlComments(content).matchAll(
    new RegExp(`${prefix}${QUALIFIED}`, 'gi'),
  )) {
    const schema = match[1] ? unquoteIdentifier(match[1]) : null;
    const name = unquoteIdentifier(match[2]!);
    const key = `${schema ?? ''}.${name}`;

    if (seen.has(key)) continue;

    seen.add(key);
    names.push({ schema, name });
  }

  return names;
}

const CREATE_TABLE_PREFIX =
  'create\\s+(?:(?:global\\s+|local\\s+)?(?:temp|temporary|unlogged)\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?';

/** Tables declared in the file, with the schema they were qualified with. */
export function extractQualifiedTableNames(content: string): QualifiedName[] {
  return matchQualified(content, CREATE_TABLE_PREFIX);
}

export function extractTableNames(content: string): string[] {
  return uniqueNames(extractQualifiedTableNames(content));
}

export function extractFunctionNames(content: string): string[] {
  return uniqueNames(
    matchQualified(content, 'create\\s+(?:or\\s+replace\\s+)?function\\s+'),
  );
}

/** Tables referenced by foreign keys, leaving out Supabase's auth schema. */
export function extractDependencies(content: string): string[] {
  return uniqueNames(
    matchQualified(content, 'references\\s+').filter(
      (ref) => ref.schema !== 'auth',
    ),
  );
}

function uniqueNames(names: QualifiedName[]) {
  return [...new Set(names.map((entry) => entry.name))];
}

/**
 * Headers look like:
 *   * Section: Accounts
 *   * We create the schema for the accounts. ...
 * The description is the first prose line after the Section line.
 */
export function extractSectionHeader(content: string) {
  const lines = content.split('\n');
  const sectionIndex = lines.findIndex((line) => /\*\s*Section:/i.test(line));

  if (sectionIndex === -1) {
    return { section: 'Unknown', description: 'No description available' };
  }

  const section =
    lines[sectionIndex]!.match(/Section:\s*([^\n*]+)/i)?.[1]?.trim() ||
    'Unknown';

  let description = 'No description available';

  for (const line of lines.slice(sectionIndex + 1, sectionIndex + 6)) {
    const text = line.replace(/^\s*\*+\s?/, '').trim();

    if (text.length === 0 || /^[-=*/]+$/.test(text)) continue;

    description = text;
    break;
  }

  return { section, description };
}

/**
 * The CREATE TABLE statement for `schema.tableName`. An unqualified
 * `create table tableName` only counts when `allowUnqualified` is set, i.e.
 * when `schema` is the schema unqualified names resolve to.
 */
export function extractTableDefinition(
  content: string,
  schema: string,
  tableName: string,
  allowUnqualified = true,
): string | null {
  const schemaPart = `${identifierPattern(schema)}\\s*\\.\\s*`;
  const tableRegex = new RegExp(
    `\\b${CREATE_TABLE_PREFIX}` +
      (allowUnqualified ? `(?:${schemaPart})?` : schemaPart) +
      `${identifierPattern(tableName)}\\s*\\(`,
    'gi',
  );

  const masked = maskSqlComments(content);

  for (const match of masked.matchAll(tableRegex)) {
    const open = match.index + match[0].length - 1;
    const close = findClosingParen(masked, open);

    if (close === -1) continue;

    // The statement runs on to its semicolon (INHERITS, PARTITION BY, ...).
    const semicolon = findTopLevel(masked, ';', close);
    const end = semicolon === -1 ? close + 1 : semicolon + 1;

    // Sliced from the original so the statement keeps its comments.
    return content.slice(match.index, end);
  }

  return null;
}

/** Matches an identifier written bare or double-quoted. */
function identifierPattern(name: string) {
  const quoted = escapeRegex(name.replace(/"/g, '""'));

  return /^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(name)
    ? `(?:"${quoted}"|${escapeRegex(name)})`
    : `"${quoted}"`;
}

/** Words that start a table constraint rather than a column definition. */
const TABLE_CONSTRAINT_STARTS = new Set([
  'constraint',
  'primary',
  'foreign',
  'unique',
  'check',
  'exclude',
  'like',
]);

/** Words that end a column's type or default expression. */
const COLUMN_CONSTRAINT_KEYWORDS = new Set([
  'constraint',
  'not',
  'null',
  'default',
  'primary',
  'references',
  'unique',
  'check',
  'generated',
  'collate',
  'deferrable',
  'initially',
]);

export function parseColumns(tableDefinition: string): TableColumn[] {
  const masked = maskSqlComments(tableDefinition);
  const open = masked.indexOf('(');
  const close = open === -1 ? -1 : findClosingParen(masked, open);

  if (close === -1) return [];

  const columns: TableColumn[] = [];

  // Split on top-level commas, not lines, so one-line definitions and
  // types such as numeric(10, 2) parse too.
  for (const item of splitTopLevel(masked.slice(open + 1, close))) {
    const tokens = tokenize(item);
    const first = tokens[0];

    if (!first || TABLE_CONSTRAINT_STARTS.has(keywordOf(first) ?? '')) {
      continue;
    }

    if (!new RegExp(`^${NAME}$`).test(first)) continue;

    const column = parseColumnTokens(tokens.slice(1));

    if (!column) continue;

    columns.push({ name: unquoteIdentifier(first), ...column });
  }

  return columns;
}

/** Type and constraints of one column, read token by token. */
function parseColumnTokens(tokens: string[]): Omit<TableColumn, 'name'> | null {
  let index = 0;
  const type: string[] = [];

  while (index < tokens.length && !isColumnKeyword(tokens[index]!)) {
    type.push(tokens[index++]!);
  }

  if (type.length === 0) return null;

  let notNull = false;
  let isPrimaryKey = false;
  let isForeignKey = false;
  let defaultValue: string | undefined;
  let referencedTable: string | undefined;
  let referencedColumn: string | undefined;

  while (index < tokens.length) {
    const token = tokens[index]!;
    const keyword = keywordOf(token);
    const next = tokens[index + 1]?.toLowerCase();

    index++;

    if (keyword === 'not' && next === 'null') {
      notNull = true;
      index++;
    } else if (keyword === 'primary' && next === 'key') {
      isPrimaryKey = true;
      index++;
    } else if (keyword === 'constraint' || keyword === 'collate') {
      index++;
    } else if (keyword === 'check' && token.length === keyword.length) {
      index++;
    } else if (keyword === 'default') {
      const expression: string[] = [];

      while (index < tokens.length && !isColumnKeyword(tokens[index]!)) {
        expression.push(tokens[index++]!);
      }

      // `default null` is the one keyword a default can be.
      if (
        expression.length === 0 &&
        keywordOf(tokens[index] ?? '') === 'null'
      ) {
        expression.push(tokens[index++]!);
      }

      if (expression.length > 0) defaultValue = expression.join(' ');
    } else if (keyword === 'generated') {
      // GENERATED ALWAYS AS (expr) STORED / ... AS IDENTITY [(options)]
      while (index < tokens.length) {
        const word = keywordOf(tokens[index++]!);

        if (word === 'stored') break;

        if (word === 'identity') {
          if (tokens[index]?.startsWith('(')) index++;
          break;
        }
      }
    } else if (keyword === 'references') {
      isForeignKey = true;

      const target = tokens[index++] ?? '';
      const match = target.match(
        new RegExp(`^${QUALIFIED}\\s*(?:\\(([\\s\\S]*)\\))?$`),
      );

      referencedTable = optionalUnquote(match?.[2]);

      let columnList = match?.[3];

      if (columnList === undefined && tokens[index]?.startsWith('(')) {
        columnList = tokens[index++]!.slice(1, -1);
      }

      referencedColumn = optionalUnquote(columnList?.trim() || undefined);

      // MATCH FULL, ON DELETE SET NULL, ON UPDATE NO ACTION, ...
      while (index < tokens.length) {
        const word = keywordOf(tokens[index]!);

        if (word === 'match') {
          index += 2;
        } else if (word === 'on') {
          const action = keywordOf(tokens[index + 2] ?? '');

          index += action === 'set' || action === 'no' ? 4 : 3;
        } else {
          break;
        }
      }
    }
  }

  return {
    type: type.join(' '),
    nullable: !notNull && !isPrimaryKey,
    defaultValue,
    isPrimaryKey,
    isForeignKey,
    referencedTable,
    referencedColumn,
  };
}

/**
 * Split a column definition on whitespace, keeping quoted text and
 * parenthesised groups whole: `numeric(10, 2)`, `now()`, `'a b'`,
 * `"My Column"` and `(x > 0)` are one token each.
 */
function tokenize(value: string): string[] {
  const tokens: string[] = [];
  let index = 0;

  while (index < value.length) {
    if (/\s/.test(value[index]!)) {
      index++;
      continue;
    }

    const start = index;

    while (index < value.length && !/\s/.test(value[index]!)) {
      const char = value[index]!;

      if (char === "'" || char === '"') {
        index = skipQuoted(value, index);
      } else if (char === '(') {
        const close = findClosingParen(value, index);

        index = close === -1 ? value.length : close + 1;
      } else {
        index++;
      }
    }

    tokens.push(value.slice(start, index));
  }

  return tokens;
}

/** The leading bare word of a token (`check` for `check(x > 0)`), lowercased. */
function keywordOf(token: string) {
  return token.match(/^([a-z_]+)(?:\(|$)/i)?.[1]?.toLowerCase();
}

function isColumnKeyword(token: string) {
  return COLUMN_CONSTRAINT_KEYWORDS.has(keywordOf(token) ?? '');
}

export function parseForeignKeys(tableDefinition: string): TableForeignKey[] {
  const foreignKeys: TableForeignKey[] = [];

  const fkRegex = new RegExp(
    `foreign\\s+key\\s*\\(([^)]+)\\)\\s*references\\s+(?:${NAME}\\s*\\.\\s*)?(${NAME})\\s*\\(([^)]+)\\)(?:\\s+on\\s+delete\\s+([a-z\\s]+?))?(?:\\s+on\\s+update\\s+([a-z\\s]+?))?(?=\\s*(?:,|\\)|$))`,
    'gi',
  );

  let match: RegExpExecArray | null;

  const masked = maskSqlComments(tableDefinition);

  while ((match = fkRegex.exec(masked)) !== null) {
    const [, columns, quotedTable, referencedColumns, onDelete, onUpdate] =
      match;

    const columnList = splitList(columns!).map(unquoteIdentifier);
    const referencedTable = unquoteIdentifier(quotedTable!);

    foreignKeys.push({
      name: `fk_${referencedTable}_${columnList.join('_')}`,
      columns: columnList,
      referencedTable,
      referencedColumns: splitList(referencedColumns!).map(unquoteIdentifier),
      onDelete: onDelete?.trim(),
      onUpdate: onUpdate?.trim(),
    });
  }

  return foreignKeys;
}

/**
 * Indexes created on `tableName`. With `schema`, indexes on a same-named
 * table qualified with another schema are left out; unqualified ones count
 * when `allowUnqualified` is set.
 */
export function parseIndexes(
  content: string,
  tableName: string,
  schema?: string,
  allowUnqualified = true,
): TableIndex[] {
  const indexes: TableIndex[] = [];

  const indexRegex = new RegExp(
    `create\\s+(unique\\s+)?index\\s+(?:concurrently\\s+)?(?:if\\s+not\\s+exists\\s+)?(${NAME})\\s+on\\s+(?:only\\s+)?(?:(${NAME})\\s*\\.\\s*)?${identifierPattern(tableName)}\\s*(?:using\\s+(\\w+)\\s*)?\\(([^)]+)\\)`,
    'gi',
  );

  let match: RegExpExecArray | null;

  const masked = maskSqlComments(content);

  while ((match = indexRegex.exec(masked)) !== null) {
    const [fullMatch, unique, indexName, indexSchema, method, columns] = match;

    if (schema !== undefined) {
      const matches = indexSchema
        ? unquoteIdentifier(indexSchema) === schema
        : allowUnqualified;

      if (!matches) continue;
    }

    indexes.push({
      name: unquoteIdentifier(indexName!),
      columns: splitList(columns!).map(unquoteIdentifier),
      unique: Boolean(unique),
      type: method?.toLowerCase() ?? 'btree',
      definition: content.slice(match.index, match.index + fullMatch.length),
    });
  }

  return indexes;
}

export interface EnumDefinition extends QualifiedName {
  values: string[];
}

export function parseEnumDefinitions(content: string): EnumDefinition[] {
  const enumRegex = new RegExp(
    `create\\s+type\\s+${QUALIFIED}\\s+as\\s+enum\\s*\\(([^)]*)\\)`,
    'gi',
  );

  return [...maskSqlComments(content).matchAll(enumRegex)].map((match) => ({
    schema: match[1] ? unquoteIdentifier(match[1]) : null,
    name: unquoteIdentifier(match[2]!),
    values: [...match[3]!.matchAll(/'((?:[^']|'')*)'/g)].map((value) =>
      value[1]!.replace(/''/g, "'"),
    ),
  }));
}

export function parseEnums(
  content: string,
  sourceFile: string,
): Record<string, EnumInfo> {
  const enums: Record<string, EnumInfo> = {};

  for (const { name, values } of parseEnumDefinitions(content)) {
    enums[name] = { name, values, sourceFile };
  }

  return enums;
}

export function extractFunctionsFromContent(
  content: string,
  sourceFile: string,
  defaultSchema = 'public',
): DatabaseFunction[] {
  const functions: DatabaseFunction[] = [];

  // Capture everything between "returns" and the body, then pick the header
  // apart: modifiers may sit on the same line or on their own. Bodies may use
  // any dollar-quote tag ($$, $function$) and contain $1-style parameters.
  // Neither the parameter list nor the header can contain ";", which keeps a
  // function without a dollar-quoted body from swallowing the next one.
  const functionRegex = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+${QUALIFIED}\\s*\\(([^;]*?)\\)\\s*returns?\\s+([^;]*?)\\$(\\w*)\\$([\\s\\S]*?)\\$\\5\\$`,
    'gi',
  );

  // Matched on the masked text; the description and body come from the
  // original, whose offsets are the same.
  const masked = maskSqlComments(content);

  let match: RegExpExecArray | null;

  while ((match = functionRegex.exec(masked)) !== null) {
    const [fullMatch, quotedSchema, quotedName, params, header, tag] = match;
    const bodyEnd = match.index + fullMatch.length - `$${tag}$`.length;
    const body = content.slice(bodyEnd - (match[6]?.length ?? 0), bodyEnd);

    if (!quotedName || !header) continue;

    const returnType = header
      .split(
        /\n|\s+(?:language|security|as|set|stable|volatile|immutable|strict|parallel)\b/i,
      )[0]!
      .trim();

    if (!returnType) continue;

    const securityLevel = /security\s+definer/i.test(header)
      ? 'definer'
      : 'invoker';

    const functionName = unquoteIdentifier(quotedName);
    const schema = quotedSchema
      ? unquoteIdentifier(quotedSchema)
      : defaultSchema;

    const description = extractDescription(
      content.substring(0, match.index),
      body,
    );

    functions.push({
      name: functionName,
      schema,
      parameters: parseParameterList(params ?? ''),
      returnType: returnType.trim(),
      description,
      purpose: derivePurpose(description, functionName),
      securityLevel,
      sourceFile,
    });
  }

  return functions;
}

/**
 * Parse `name type [DEFAULT value]` lists as produced by both schema files and
 * `pg_get_function_arguments`. IN/OUT/INOUT markers are ignored.
 */
export function parseParameterList(paramString: string): FunctionParameter[] {
  if (!paramString.trim()) return [];

  const parameters: FunctionParameter[] = [];

  for (const raw of splitTopLevel(paramString)) {
    const match = raw.match(
      new RegExp(
        `^(?:(?:IN|OUT|INOUT|VARIADIC)\\s+)?(${NAME})\\s+(.+?)(?:\\s+DEFAULT\\s+|\\s*=\\s*)(.+)$|^(?:(?:IN|OUT|INOUT|VARIADIC)\\s+)?(${NAME})\\s+(.+)$`,
        'is',
      ),
    );

    if (match) {
      const name = match[1] ?? match[4]!;
      const type = match[2] ?? match[5]!;
      const defaultValue = match[3];

      parameters.push({
        name: unquoteIdentifier(name.trim()),
        type: type!.trim(),
        defaultValue: defaultValue?.trim(),
      });

      continue;
    }

    const parts = raw.split(/\s+/);

    if (parts.length >= 2) {
      parameters.push({
        name: parts[0] ?? 'unnamed',
        type: parts.slice(1).join(' ').trim(),
      });
    }
  }

  return parameters;
}

/**
 * The `--` comment lines directly above the function (blank lines allowed in
 * between), else the first comment inside the body. A comment further up
 * belongs to whatever statement it sits on.
 */
function extractDescription(beforeFunction: string, body: string): string {
  const lines = beforeFunction.split('\n');

  // The text before the match ends with the partial line holding "create".
  if (lines[lines.length - 1]!.trim() === '') lines.pop();

  const comments: string[] = [];

  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]!.trim();

    if (line === '' && comments.length === 0) continue;

    const comment = line.match(/^--\s*(.*)$/);

    if (!comment) break;

    comments.unshift(comment[1]!.trim());
  }

  const leading = comments.find(Boolean);

  if (leading) return leading;

  const bodyCommentMatch = body.match(/--\s*(.+?)(?:\n|$)/);

  if (bodyCommentMatch?.[1]) {
    return bodyCommentMatch[1].trim();
  }

  return 'No description available';
}

const PURPOSE_MAP: Record<string, string> = {
  create_nonce: 'Create one-time authentication tokens for secure operations',
  verify_nonce: 'Verify and consume one-time tokens for authentication',
  is_mfa_compliant: 'Check if user has completed multi-factor authentication',
  team_account_workspace:
    'Load comprehensive team account data with permissions',
  has_role_on_account: 'Check if user has access to a specific account',
  has_permission: 'Verify user permissions for specific account operations',
  get_user_billing_account: 'Retrieve billing account information for user',
  create_team_account: 'Create new team account with proper permissions',
  invite_user_to_account: 'Send invitation to join team account',
  accept_invitation: 'Process and accept team invitation',
  transfer_account_ownership: 'Transfer account ownership between users',
  delete_account: 'Safely delete account and associated data',
};

export function derivePurpose(description: string, functionName: string) {
  const known = PURPOSE_MAP[functionName];

  if (known) return known;

  const name = functionName.toLowerCase();

  if (name.includes('create')) return 'Create database records with validation';
  if (name.includes('delete') || name.includes('remove'))
    return 'Delete records with proper authorization';
  if (name.includes('update') || name.includes('modify'))
    return 'Update existing records with validation';
  if (name.includes('get') || name.includes('fetch'))
    return 'Retrieve data with access control';
  if (name.includes('verify') || name.includes('validate'))
    return 'Validate data or permissions';
  if (name.includes('check') || name.includes('is_'))
    return 'Check conditions or permissions';
  if (name.includes('invite')) return 'Handle user invitations and access';
  if (name.includes('transfer'))
    return 'Transfer ownership or data between entities';

  return `Custom database function: ${description}`;
}

/** Topic of each schema file this kit ships. */
export const FILE_TOPIC_MAP: Record<string, string> = {
  '00-privileges.sql': 'security',
  '01-enums.sql': 'types',
  '02-config.sql': 'configuration',
  '03-accounts.sql': 'accounts',
  '04-roles.sql': 'permissions',
  '05-memberships.sql': 'teams',
  '06-roles-permissions.sql': 'permissions',
  '07-invitations.sql': 'teams',
  '08-billing-customers.sql': 'billing',
  '09-subscriptions.sql': 'billing',
  '10-orders.sql': 'billing',
  '11-notifications.sql': 'notifications',
  '12-one-time-tokens.sql': 'auth',
  '13-mfa.sql': 'auth',
  '14-super-admin.sql': 'admin',
  '15-account-views.sql': 'accounts',
  '16-storage.sql': 'storage',
  '17-roles-seed.sql': 'permissions',
};

export const KNOWN_TOPICS = [
  'accounts',
  'auth',
  'billing',
  'permissions',
  'teams',
  'notifications',
  'storage',
  'admin',
  'security',
  'types',
  'configuration',
];

export function determineTopic(fileName: string, content: string): string {
  const known = FILE_TOPIC_MAP[fileName];

  if (known) return known;

  const lower = content.toLowerCase();

  if (lower.includes('account') && lower.includes('team')) return 'accounts';
  if (lower.includes('subscription') || lower.includes('billing'))
    return 'billing';
  if (
    lower.includes('auth') ||
    lower.includes('mfa') ||
    lower.includes('token')
  )
    return 'auth';
  if (lower.includes('permission') || lower.includes('role'))
    return 'permissions';
  if (lower.includes('notification') || lower.includes('email'))
    return 'notifications';
  if (lower.includes('storage') || lower.includes('bucket')) return 'storage';
  if (lower.includes('admin') || lower.includes('super')) return 'admin';

  return 'general';
}

function splitList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Split on commas that are not inside parentheses or quotes. */
function splitTopLevel(value: string) {
  const items: string[] = [];
  let start = 0;
  let index = 0;

  while (index < value.length) {
    const char = value[index]!;

    if (char === "'" || char === '"') {
      index = skipQuoted(value, index);
    } else if (char === '(') {
      const close = findClosingParen(value, index);

      index = close === -1 ? value.length : close + 1;
    } else {
      if (char === ',') {
        items.push(value.slice(start, index));
        start = index + 1;
      }

      index++;
    }
  }

  items.push(value.slice(start));

  return items.map((item) => item.trim()).filter(Boolean);
}

/**
 * Blank out `-- line` and `/* block *\/` comments (block comments nest in
 * Postgres), leaving string literals and quoted identifiers alone. The
 * result has the same length and line breaks as the input, so offsets
 * found in it point at the same text in the original.
 */
export function maskSqlComments(sql: string): string {
  let result = '';
  let index = 0;

  while (index < sql.length) {
    const char = sql[index]!;
    const next = sql[index + 1];
    let end: number;

    if (char === "'" || char === '"') {
      end = skipQuoted(sql, index);
      result += sql.slice(index, end);
    } else if (char === '-' && next === '-') {
      end = sql.indexOf('\n', index);
      end = end === -1 ? sql.length : end;
      result += ' '.repeat(end - index);
    } else if (char === '/' && next === '*') {
      end = skipBlockComment(sql, index);
      result += sql.slice(index, end).replace(/[^\n]/g, ' ');
    } else {
      end = index + 1;
      result += char;
    }

    index = end;
  }

  return result;
}

function skipBlockComment(sql: string, start: number) {
  let depth = 0;
  let index = start;

  while (index < sql.length) {
    if (sql.startsWith('/*', index)) {
      depth++;
      index += 2;
    } else if (sql.startsWith('*/', index)) {
      depth--;
      index += 2;

      if (depth === 0) return index;
    } else {
      index++;
    }
  }

  return sql.length;
}

/** Index just past the quoted text starting at `start` ('' and "" escape). */
function skipQuoted(sql: string, start: number) {
  const quote = sql[start]!;
  let index = start + 1;

  while (index < sql.length) {
    if (sql[index] === quote) {
      if (sql[index + 1] === quote) {
        index += 2;
        continue;
      }

      return index + 1;
    }

    index++;
  }

  return sql.length;
}

/** Index of the parenthesis closing the one at `open`, or -1. */
function findClosingParen(sql: string, open: number) {
  let depth = 0;
  let index = open;

  while (index < sql.length) {
    const char = sql[index]!;

    if (char === "'" || char === '"') {
      index = skipQuoted(sql, index);
      continue;
    }

    if (char === '(') depth++;

    if (char === ')' && --depth === 0) return index;

    index++;
  }

  return -1;
}

/** Index of the first `target` at or after `from` outside quotes, or -1. */
function findTopLevel(sql: string, target: string, from: number) {
  let index = from;

  while (index < sql.length) {
    const char = sql[index]!;

    if (char === target) return index;

    index = char === "'" || char === '"' ? skipQuoted(sql, index) : index + 1;
  }

  return -1;
}

function optionalUnquote(value: string | undefined) {
  return value === undefined ? undefined : unquoteIdentifier(value);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
