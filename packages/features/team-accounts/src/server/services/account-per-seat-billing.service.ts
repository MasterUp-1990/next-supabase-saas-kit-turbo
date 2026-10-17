import 'server-only';
import { SupabaseClient } from '@supabase/supabase-js';

import { createBillingGatewayService } from '@kit/billing-gateway';
import { getLogger } from '@kit/shared/logger';
import { Database } from '@kit/supabase/database';

import { createTeamAccountsApi } from '../api';

export function createAccountPerSeatBillingService(
  client: SupabaseClient<Database>,
) {
  return new AccountPerSeatBillingService(client);
}

/**
 * @name AccountPerSeatBillingService
 * @description Service for managing per-seat billing for accounts.
 */
class AccountPerSeatBillingService {
  private readonly namespace = 'accounts.per-seat-billing';

  constructor(private readonly client: SupabaseClient<Database>) {}

  /**
   * @name getPerSeatSubscriptionItem
   * @description Retrieves the per-seat subscription item for an account.
   * @param accountId
   */
  async getPerSeatSubscriptionItem(accountId: string) {
    const logger = await getLogger();
    const ctx = { accountId, name: this.namespace };

    logger.info(
      ctx,
      `Retrieving per-seat subscription item for account ${accountId}...`,
    );

    const { data, error } = await this.client
      .from('subscriptions')
      .select(
        `
          provider: billing_provider,
          id,
          subscription_items !inner (
            quantity,
            id,
            type,
            variant_id
          )
        `,
      )
      .eq('account_id', accountId)
      .eq('subscription_items.type', 'per_seat')
      // the per-seat filter applies first: among subscriptions with a
      // per-seat item, the active one, else the newest
      .order('active', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error(
        {
          ...ctx,
          error,
        },
        `Failed to get per-seat subscription item for account ${accountId}`,
      );

      throw error;
    }

    if (!data?.subscription_items) {
      logger.info(
        ctx,
        `Account is not subscribed to a per-seat subscription. Exiting...`,
      );

      return;
    }

    logger.info(
      ctx,
      `Per-seat subscription item found for account ${accountId}. Will update...`,
    );

    return data;
  }

  /**
   * @name increaseSeats
   * @description Increases the number of seats for an account by reconciling
   * the per-seat quantity to the current member count.
   * @param accountId
   */
  async increaseSeats(accountId: string) {
    return this.reconcileSeatsToMembersCount(accountId);
  }

  /**
   * @name decreaseSeats
   * @description Decreases the number of seats for an account by reconciling
   * the per-seat quantity to the current member count.
   * @param accountId
   */
  async decreaseSeats(accountId: string) {
    return this.reconcileSeatsToMembersCount(accountId);
  }

  /**
   * @name reconcileSeatsToMembersCount
   * @description Sets the per-seat subscription quantity to the account's
   * current member count.
   *
   * We intentionally compute the authoritative seat count from live membership
   * rather than mutating a cached quantity by ±1. The local
   * `subscription_items.quantity` is only reconciled asynchronously by the
   * provider webhook, so a ±1 delta off a stale value loses updates under
   * concurrent or rapid sequential membership changes, durably under-counting
   * paid seats. The membership row is always committed before this runs (an
   * invitation is accepted / a member removed before the seat update), so the
   * member count is accurate, and the provider write is an absolute set.
   * @param accountId
   */
  private async reconcileSeatsToMembersCount(accountId: string) {
    const logger = await getLogger();
    const subscription = await this.getPerSeatSubscriptionItem(accountId);

    if (!subscription) {
      return;
    }

    const subscriptionItems = subscription.subscription_items.filter((item) => {
      return item.type === 'per_seat';
    });

    if (!subscriptionItems.length) {
      return;
    }

    const api = createTeamAccountsApi(this.client);
    const quantity = (await api.getMembersCount(accountId)) ?? 1;

    const billingGateway = createBillingGatewayService(subscription.provider);

    const ctx = {
      name: this.namespace,
      accountId,
      subscriptionItems,
      quantity,
    };

    logger.info(
      ctx,
      `Reconciling seats for account ${accountId} to member count...`,
    );

    const promises = subscriptionItems.map(async (item) => {
      try {
        logger.info(
          {
            name: this.namespace,
            accountId,
            subscriptionItemId: item.id,
            quantity,
          },
          `Updating subscription item...`,
        );

        await billingGateway.updateSubscriptionItem({
          subscriptionId: subscription.id,
          subscriptionItemId: item.id,
          quantity,
        });

        logger.info(
          {
            name: this.namespace,
            accountId,
            subscriptionItemId: item.id,
            quantity,
          },
          `Subscription item updated successfully`,
        );
      } catch (error) {
        logger.error(
          {
            ...ctx,
            error,
          },
          `Failed to reconcile seats for account ${accountId}`,
        );
      }
    });

    await Promise.all(promises);
  }
}
