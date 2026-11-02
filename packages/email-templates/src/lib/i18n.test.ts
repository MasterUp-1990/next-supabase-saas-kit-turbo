import { describe, expect, it, vi } from 'vitest';

import { createEmailTranslator, initializeEmailI18n } from './i18n';

describe('createEmailTranslator', () => {
  const create = (messages: Record<string, string>[]) =>
    createEmailTranslator({
      locale: 'de',
      namespace: 'invite-email',
      messages,
    });

  it('takes a key the locale lacks from the next messages', () => {
    const { t } = create([
      { subject: 'Einladung' },
      { subject: 'Invitation', hello: 'Hello {name}' },
    ]);

    expect(t('subject')).toBe('Einladung');
    expect(t('hello', { name: 'Ada' })).toBe('Hello Ada');
  });

  it('renders a key missing everywhere as namespace.key', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { t } = create([{}, {}]);

    expect(t('subject')).toBe('invite-email.subject');
  });
});

describe('initializeEmailI18n', () => {
  it('falls back to the English templates for a locale without files', async () => {
    const { t } = await initializeEmailI18n({
      language: 'xx',
      namespace: 'invite-email',
    });

    expect(t('subject')).toBe('You have been invited to join a team');
  });

  it('renders a namespace without files as namespace.key', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { t } = await initializeEmailI18n({
      language: 'en',
      namespace: 'missing-email',
    });

    expect(t('subject')).toBe('missing-email.subject');
  });
});
