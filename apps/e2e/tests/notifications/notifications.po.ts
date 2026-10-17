import { Page } from '@playwright/test';

import { getSupabaseAdminClient } from '../utils/supabase-admin-client';

export class NotificationsPageObject {
  constructor(private readonly page: Page) {}

  async open() {
    await this.page.click('[data-test="notifications-trigger"]:visible');
  }

  getItems() {
    return this.page.locator(
      '[data-test="notifications-popover"]:visible [data-test="notification-item"]',
    );
  }

  /** Insert a notification directly, the way server-side producers do. */
  async seed(params: {
    accountId: string;
    body: string;
    expiresAt?: string | null;
  }) {
    const { error } = await getSupabaseAdminClient()
      .from('notifications')
      .insert({
        account_id: params.accountId,
        body: params.body,
        // omitted → the column default (one month from now)
        ...(params.expiresAt !== undefined
          ? { expires_at: params.expiresAt }
          : {}),
      });

    if (error) {
      throw new Error(`Failed to seed notification: ${error.message}`);
    }
  }
}
