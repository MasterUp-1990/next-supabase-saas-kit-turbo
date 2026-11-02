import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger as ConsoleLogger } from './impl/console';
import { pinoOptions } from './impl/pino';

function createCapture() {
  const lines: string[] = [];
  const logger = pino(pinoOptions, { write: (line) => lines.push(line) });

  const entries = () =>
    lines.map((line) => JSON.parse(line) as Record<string, unknown>);

  return { logger, lines, entries };
}

describe('pino logger', () => {
  it('does not let fields spoof level, time or msg', () => {
    const { logger, lines, entries } = createCapture();

    logger.warn({ level: 'debug', msg: 'spoofed', time: 0, ok: 1 }, 'real');

    expect(lines[0]!.match(/"level"/g)).toHaveLength(1);
    expect(lines[0]!.match(/"msg"/g)).toHaveLength(1);
    expect(entries()[0]).toMatchObject({ level: 40, msg: 'real', ok: 1 });
    expect(entries()[0]!.time).not.toBe(0);
  });

  it('keeps a msg field as the message when no message is given', () => {
    const { logger, entries } = createCapture();

    logger.info({ msg: 'from field', a: 1 });

    expect(entries()[0]).toMatchObject({ msg: 'from field', a: 1 });
  });

  it('keeps error own props and cause', () => {
    const { logger, entries } = createCapture();

    const pgError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'users_email_key',
    });

    logger.error({ error: new Error('Failed query', { cause: pgError }) }, 'x');

    expect(entries()[0]).toMatchObject({
      error: {
        name: 'Error',
        message: 'Failed query',
        cause: {
          message: 'duplicate key',
          code: '23505',
          constraint: 'users_email_key',
        },
      },
    });
  });

  it('serialises an error passed as the first argument', () => {
    const { logger, entries } = createCapture();
    const error = Object.assign(new TypeError('bad input'), { code: 'E1' });

    logger.error(error, 'failed');

    expect(entries()[0]).toMatchObject({
      error: { name: 'TypeError', message: 'bad input', code: 'E1' },
      msg: 'failed',
    });
  });

  it('serialises nested errors, Map, Set, dates and bigint', () => {
    const { logger, entries } = createCapture();

    logger.info(
      {
        context: { cause: new Error('inner') },
        map: new Map([['k', 1]]),
        set: new Set(['x']),
        at: new Date('nope'),
        big: BigInt('12345678901234567890'),
      },
      'values',
    );

    expect(entries()[0]).toMatchObject({
      context: { cause: { name: 'Error', message: 'inner' } },
      map: { k: 1 },
      set: ['x'],
      at: 'Invalid Date',
      big: '12345678901234567890',
    });
  });

  it('never throws when a field getter throws, and keeps other fields', () => {
    const { logger, entries } = createCapture();

    const hostile = {
      get secret() {
        throw new Error('getter exploded');
      },
    };

    expect(() => logger.warn({ userId: 'u1', hostile }, 'boom')).not.toThrow();
    expect(entries()[0]).toMatchObject({
      userId: 'u1',
      hostile: '[unserializable]',
    });
  });

  it('replaces circular references and keeps shared ones', () => {
    const { logger, entries } = createCapture();
    const node: Record<string, unknown> = { id: 1 };
    const shared = { id: 2 };

    node.self = node;

    logger.info({ node, a: shared, b: shared }, 'graph');

    expect(entries()[0]).toMatchObject({
      node: { id: 1, self: '[circular]' },
      a: { id: 2 },
      b: { id: 2 },
    });
  });

  it('logs a __proto__ key from parsed input as a plain field', () => {
    const { logger, lines } = createCapture();

    logger.info(JSON.parse('{"__proto__": {"admin": true}, "ok": 1}'), 'p');

    expect(lines[0]).toContain('"__proto__":{"admin":true}');
  });
});

describe('console logger', () => {
  const levels = ['debug', 'info', 'warn', 'error'] as const;

  beforeEach(() => {
    for (const level of levels) {
      vi.spyOn(console, level).mockImplementation(() => {});
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes fields and message through to the console method', () => {
    ConsoleLogger.info({ userId: 'u1' }, 'hello');

    expect(console.info).toHaveBeenCalledWith({ userId: 'u1' }, 'hello');
  });

  it('writes fatal to console.error', () => {
    ConsoleLogger.fatal({ a: 1 }, 'down');

    expect(console.error).toHaveBeenCalledWith({ a: 1 }, 'down');
  });

  it('keeps error props and cause', () => {
    const pgError = Object.assign(new Error('duplicate key'), {
      code: '23505',
    });

    ConsoleLogger.error({ error: new Error('Failed', { cause: pgError }) });

    const [entry] = vi.mocked(console.error).mock.calls[0]!;

    expect(entry).toMatchObject({
      error: { message: 'Failed', cause: { code: '23505' } },
    });
  });

  it('never throws, even when a getter or console itself throws', () => {
    const hostile = {
      get secret() {
        throw new Error('getter exploded');
      },
    };

    ConsoleLogger.warn({ hostile }, 'boom');

    expect(console.warn).toHaveBeenCalledWith(
      { hostile: '[unserializable]' },
      'boom',
    );

    vi.mocked(console.info).mockImplementation(() => {
      throw new Error('console down');
    });

    expect(() => ConsoleLogger.info('x')).not.toThrow();
  });
});
