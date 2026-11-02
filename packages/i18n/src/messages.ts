type Messages = Record<string, unknown>;

function isMessages(value: unknown): value is Messages {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns `messages` with every key it lacks taken from `fallback` (the
 * default locale), recursively, so a half-translated locale shows the default
 * language for the gaps instead of raw keys. Inputs are not mutated.
 */
export function withFallbackMessages(params: {
  messages: Messages;
  fallback: Messages;
}): Messages {
  const { messages, fallback } = params;

  // `Object.fromEntries` keeps a `__proto__` key as a plain property
  const own = Object.entries(messages).map(([key, value]) => {
    const fallbackValue = Object.hasOwn(fallback, key)
      ? fallback[key]
      : undefined;

    const merged =
      isMessages(value) && isMessages(fallbackValue)
        ? withFallbackMessages({ messages: value, fallback: fallbackValue })
        : value;

    return [key, merged] as const;
  });

  const missing = Object.entries(fallback).filter(
    ([key]) => !Object.hasOwn(messages, key),
  );

  return Object.fromEntries([...missing, ...own]);
}

/**
 * What a missing message renders: the full `namespace.key` path, so it can be
 * found in the message files.
 */
export function getMessageFallback(info: { namespace?: string; key: string }) {
  return [info.namespace, info.key].filter(Boolean).join('.');
}
