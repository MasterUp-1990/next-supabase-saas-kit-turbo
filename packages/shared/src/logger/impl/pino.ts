import pino, { type LoggerOptions } from 'pino';

import { serialize } from '../serialize';

// written by pino itself; a field with one of these names would add a
// duplicate JSON key that wins when the line is parsed
const RESERVED_KEYS = ['level', 'time', 'msg'];

function isPlainFields(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && !(value instanceof Error)
  );
}

/**
 * Serialises every entry with `serialize` (never throws, keeps error props
 * and causes, handles circular, Map, Set, Date and bigint) and drops fields
 * that would spoof `level`, `time` or `msg`.
 */
export const pinoOptions = {
  browser: {
    asObject: true,
  },
  level: 'debug',
  base: {
    env: process.env.NODE_ENV,
  },
  errorKey: 'error',
  serializers: {
    // `serialize` already turned errors into plain objects
    error: (value: unknown) => value,
  },
  hooks: {
    // `logger.info({ msg: 'x' })` keeps `x` as the message, since the
    // formatter below drops a `msg` field
    logMethod(args, method) {
      const [fields, message] = args as unknown[];

      try {
        if (
          message === undefined &&
          isPlainFields(fields) &&
          typeof fields.msg === 'string'
        ) {
          const { msg, ...rest } = fields;

          return method.apply(this, [rest, msg]);
        }
      } catch {
        // a hostile field: log the original arguments
      }

      return method.apply(this, args);
    },
  },
  formatters: {
    log(object) {
      const entries = serialize(object) as Record<string, unknown>;

      return Object.fromEntries(
        Object.entries(entries).filter(([key]) => !RESERVED_KEYS.includes(key)),
      );
    },
  },
} satisfies LoggerOptions;

/**
 * @name Logger
 * @description A logger implementation using Pino
 */
const Logger = pino(pinoOptions);

export { Logger };
