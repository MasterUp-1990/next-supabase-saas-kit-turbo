import type { AbstractIntlMessages } from 'next-intl';
import { createTranslator } from 'next-intl';

import { defaultLocale } from '@kit/i18n/default-locale';
import { getMessageFallback, withFallbackMessages } from '@kit/i18n/messages';

// The kit ships email messages in English only
const TEMPLATES_LOCALE = 'en';

export async function initializeEmailI18n(params: {
  language: string | undefined;
  namespace: string;
}) {
  // Without an explicit language, follow the app's default locale — otherwise
  // a non-English deployment still sends English emails.
  const language = params.language ?? defaultLocale;
  const locales = [...new Set([language, defaultLocale, TEMPLATES_LOCALE])];

  const messages = await Promise.all(
    locales.map((locale) => loadMessages(locale, params.namespace)),
  );

  return createEmailTranslator({
    locale: language,
    namespace: params.namespace,
    messages,
  });
}

/**
 * A translator for one email namespace. `messages` are ordered by preference:
 * a key missing in one is taken from the next, and a key missing in all of
 * them renders as `namespace.key`, like the app's translations.
 */
export function createEmailTranslator(params: {
  locale: string;
  namespace: string;
  messages: AbstractIntlMessages[];
}) {
  const merged = params.messages.reduceRight<Record<string, unknown>>(
    (fallback, messages) => withFallbackMessages({ messages, fallback }),
    {},
  );

  const translator = createTranslator({
    locale: params.locale,
    namespace: params.namespace,
    messages: { [params.namespace]: merged } as AbstractIntlMessages,
    getMessageFallback,
  });

  // Type-cast to make it compatible with the i18next API
  const t = translator as unknown as (
    key: string,
    values?: Record<string, unknown>,
  ) => string;

  return {
    t,
    language: params.locale,
  };
}

async function loadMessages(language: string, namespace: string) {
  try {
    const file = (await import(`../locales/${language}/${namespace}.json`)) as {
      default: AbstractIntlMessages;
    };

    return file.default ?? {};
  } catch {
    return {};
  }
}
