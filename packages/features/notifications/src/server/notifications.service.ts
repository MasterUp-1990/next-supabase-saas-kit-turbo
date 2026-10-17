import 'server-only';
import { SupabaseClient } from '@supabase/supabase-js';

import { Database } from '@kit/supabase/database';

type Notification = Database['public']['Tables']['notifications'];

// Postgres `insufficient_privilege`: only service_role may insert notifications
const INSUFFICIENT_PRIVILEGE = '42501';

export function createNotificationsService(
  adminClient: SupabaseClient<Database>,
) {
  return new NotificationsService(adminClient);
}

class NotificationsService {
  constructor(private readonly adminClient: SupabaseClient<Database>) {}

  async createNotification(params: Notification['Insert']) {
    const { error } = await this.adminClient
      .from('notifications')
      .insert(params);

    if (error) {
      if (error.code === INSUFFICIENT_PRIVILEGE) {
        throw new Error(
          'Notification insert denied (42501). Only service_role may insert notifications: pass getSupabaseServerAdminClient() to createNotificationsApi',
          { cause: error },
        );
      }

      throw error;
    }
  }
}
