import { expect, test } from '@playwright/test';

import { AuthPageObject } from '../authentication/auth.po';
import { seedSubscription } from '../utils/subscriptions';
import { UserBillingPageObject } from './user-billing.po';

// Seeds rows directly, so it needs no Stripe and is not gated behind
// ENABLE_BILLING_TESTS (which only ignores `*-billing.spec.ts`).
test.describe('Canonical subscription', () => {
  test('billing page shows the active subscription when an account has several', async ({
    page,
  }) => {
    const auth = new AuthPageObject(page);
    const po = new UserBillingPageObject(page);
    const email = auth.createRandomEmail();

    const { user } = await auth.bootstrapUser({
      email,
      name: 'Two Subscriptions User',
    });

    // the active row is the older one: "active first" must beat "newest first"
    await seedSubscription({
      accountId: user.id,
      subscriptionId: `sub_active_${user.id}`,
      active: true,
      status: 'active',
    });

    await seedSubscription({
      accountId: user.id,
      subscriptionId: `sub_canceled_${user.id}`,
      active: false,
      status: 'canceled',
    });

    await auth.loginAsUser({ email, next: '/home/billing' });

    await expect(po.billing.getStatus()).toContainText('Active');
  });
});
