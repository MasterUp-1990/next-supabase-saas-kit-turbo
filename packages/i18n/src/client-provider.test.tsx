import { useTranslations } from 'next-intl';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { I18nClientProvider } from './client-provider';

function Missing() {
  const t = useTranslations('auth');

  return <span>{t('missingKey')}</span>;
}

describe('I18nClientProvider', () => {
  it('renders a missing key as namespace.key', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const html = renderToString(
      <I18nClientProvider locale="en" messages={{ auth: {} }}>
        <Missing />
      </I18nClientProvider>,
    );

    expect(html).toContain('auth.missingKey');
  });
});
