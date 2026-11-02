import { serialize } from '../serialize';

type Level = 'info' | 'error' | 'warn' | 'debug';

// objects are serialised first so errors keep their props and causes, and an
// odd value (circular, throwing getter) can't throw or lose the entry
function write(level: Level) {
  return (...args: unknown[]) => {
    try {
      console[level](
        ...args.map((arg) => (typeof arg === 'object' ? serialize(arg) : arg)),
      );
    } catch {
      // logging must never break the caller
    }
  };
}

const Logger = {
  info: write('info'),
  error: write('error'),
  warn: write('warn'),
  debug: write('debug'),
  fatal: write('error'),
};

export { Logger };
