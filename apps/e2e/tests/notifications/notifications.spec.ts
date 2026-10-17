import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { NotificationsPageObject } from './notifications.po';

test.describe('Notifications', () => {
  test('shows notifications without an expiry and hides expired ones', async ({
    page,
  }) => {
    const auth = new AuthPageObject(page);
    const notifications = new NotificationsPageObject(page);
    const email = auth.createRandomEmail();

    const { user } = await auth.bootstrapUser({
      email,
      name: 'Notifications User',
    });

    // the personal account id is the user id
    await notifications.seed({
      accountId: user.id,
      body: 'Default expiry notification',
    });

    await notifications.seed({
      accountId: user.id,
      body: 'Never expiring notification',
      expiresAt: null,
    });

    await notifications.seed({
      accountId: user.id,
      body: 'Expired notification',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    await auth.loginAsUser({ email, next: '/home' });

    await notifications.open();

    const items = notifications.getItems();

    await expect(items.filter({ hasText: 'Default expiry' })).toBeVisible();
    await expect(items.filter({ hasText: 'Never expiring' })).toBeVisible();
    await expect(items).toHaveCount(2);
  });
});
