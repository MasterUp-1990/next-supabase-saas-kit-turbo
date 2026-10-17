import { getSupabaseAdminClient } from './supabase-admin-client';

/**
 * Write a subscription the way the billing webhooks do, through
 * `upsert_subscription`, without going through the provider's checkout.
 */
export async function seedSubscription(params: {
  accountId: string;
  subscriptionId: string;
  active: boolean;
  status: 'active' | 'canceled';
}) {
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const { error } = await getSupabaseAdminClient().rpc('upsert_subscription', {
    target_account_id: params.accountId,
    target_customer_id: `cus_${params.accountId}`,
    target_subscription_id: params.subscriptionId,
    active: params.active,
    status: params.status,
    billing_provider: 'stripe',
    cancel_at_period_end: false,
    currency: 'usd',
    period_starts_at: now.toISOString(),
    period_ends_at: periodEnd.toISOString(),
    line_items: [
      {
        id: `si_${params.subscriptionId}`,
        product_id: 'starter',
        // Starter Monthly in billing.sample.config.ts
        variant_id: 'price_1NNwYHI1i3VnbZTqI2UzaHIe',
        type: 'flat',
        price_amount: 999,
        quantity: 1,
        interval: 'month',
        interval_count: 1,
      },
    ],
  });

  if (error) {
    throw new Error(`Failed to seed subscription: ${error.message}`);
  }
}
