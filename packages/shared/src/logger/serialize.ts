const MAX_DEPTH = 10;

/**
 * Turns a log value into plain data. Never throws: a value that can't be read
 * becomes `"[unserializable]"`, so one bad field doesn't lose the rest of the
 * entry. Circular references become `"[circular]"`, values nested deeper than
 * 10 levels `"[max depth]"`. Errors keep their own props (e.g. Postgres
 * `code`, `detail`) and `cause`.
 */
export function serialize(value: unknown) {
  return serializeValue(value, new WeakSet(), 0);
}

function serializeValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  try {
    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime())
        ? 'Invalid Date'
        : value.toISOString();
    }

    if (seen.has(value)) {
      return '[circular]';
    }

    if (depth >= MAX_DEPTH) {
      return '[max depth]';
    }

    // only ancestors count as circular; a value shared by siblings is logged twice
    seen.add(value);

    try {
      return serializeObject(value, (item) =>
        serializeValue(item, seen, depth + 1),
      );
    } finally {
      seen.delete(value);
    }
  } catch {
    return '[unserializable]';
  }
}

function serializeObject(value: object, next: (item: unknown) => unknown) {
  if (value instanceof Error) {
    // own props keep driver details (`code`, `detail`, `constraint`); `cause`
    // holds the original error for wrapped ones
    return {
      ...serializeEntries(value, next),
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value.cause === undefined ? {} : { cause: next(value.cause) }),
    };
  }

  if (Array.isArray(value)) {
    return value.map(next);
  }

  if (value instanceof Map) {
    return Object.fromEntries(
      [...value].map(([key, item]) => [String(key), next(item)]),
    );
  }

  if (value instanceof Set) {
    return [...value].map(next);
  }

  if ('toJSON' in value && typeof value.toJSON === 'function') {
    return next(value.toJSON());
  }

  return serializeEntries(value, next);
}

function serializeEntries(value: object, next: (item: unknown) => unknown) {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, next(item)]),
  );
}
