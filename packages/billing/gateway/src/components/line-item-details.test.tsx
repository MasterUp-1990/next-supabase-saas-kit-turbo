import { NextIntlClientProvider } from 'next-intl';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LineItemDetails } from './line-item-details';

const messages = {
  billing: {
    setupFee: 'plus a {setupFee} setup fee',
    flatSubscription: 'Flat subscription',
  },
};

function render(setupFee?: number) {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  return renderToString(
    <NextIntlClientProvider
      locale="en-US"
      messages={messages}
      timeZone="UTC"
      onError={() => {}}
    >
      <LineItemDetails
        currency="USD"
        lineItems={[
          {
            id: 'price_1',
            name: 'Base',
            cost: 10,
            type: 'flat',
            setupFee,
          },
        ]}
      />
    </NextIntlClientProvider>,
  );
}

describe('LineItemDetails', () => {
  it('renders a line item without a setup fee', () => {
    const html = render();

    expect(html).toContain('$10.00');
    expect(html).not.toContain('setup fee');
  });

  it('renders the setup fee when the item has one', () => {
    expect(render(5)).toContain('plus a $5.00 setup fee');
  });
});
