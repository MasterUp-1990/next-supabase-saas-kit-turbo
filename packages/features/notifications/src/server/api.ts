/**
 * @file API for notifications
 *
 * Only `service_role` may insert notifications, so this API takes the admin
 * client. A user-scoped client fails at runtime, not at compile time.
 *
 * Usage
 *
 * ```typescript
 * import { createNotificationsApi } from '@kit/notifications/api';
 * import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
 *
 * const api = createNotificationsApi(getSupabaseServerAdminClient());
 *
 * await api.createNotification({
 *  body: 'Hello, world!',
 *  account_id: '123',
 *  type: 'info',
 *  expires_at: null, // never expires; omit for the one-month default
 * });
 * ```
 *
 * The admin client bypasses RLS: validate that the caller may notify
 * `account_id` before calling this.
 */
import 'server-only';
import { SupabaseClient } from '@supabase/supabase-js';

import { Database } from '@kit/supabase/database';

import { createNotificationsService } from './notifications.service';

type Notification = Database['public']['Tables']['notifications'];

/**
 * @name createNotificationsApi
 * @param adminClient - from `getSupabaseServerAdminClient()`
 */
export function createNotificationsApi(adminClient: SupabaseClient<Database>) {
  return new NotificationsApi(adminClient);
}

/**
 * @name NotificationsApi
 */
class NotificationsApi {
  private readonly service: ReturnType<typeof createNotificationsService>;

  constructor(adminClient: SupabaseClient<Database>) {
    this.service = createNotificationsService(adminClient);
  }

  /**
   * @name createNotification
   * @description Create a new notification in the database
   * @param params
   */
  createNotification(params: Notification['Insert']) {
    return this.service.createNotification(params);
  }
}
