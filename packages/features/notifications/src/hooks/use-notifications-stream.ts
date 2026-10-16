import { useEffect } from 'react';

import { useSupabase } from '@kit/supabase/hooks/use-supabase';

import { Notification } from '../types';

export function useNotificationsStream({
  onNotifications,
  accountIds,
  enabled,
}: {
  onNotifications: (notifications: Notification[]) => void;
  accountIds: string[];
  enabled: boolean;
}) {
  const client = useSupabase();

  // callers usually pass an inline array; key the subscription on its
  // contents so a re-render does not resubscribe the channel
  const accountIdsKey = accountIds.join(', ');

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const channel = client.channel('notifications-channel');

    const subscription = channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          filter: `account_id=in.(${accountIdsKey})`,
          table: 'notifications',
        },
        (payload) => {
          onNotifications([payload.new as Notification]);
        },
      )
      .subscribe();

    return () => {
      void subscription?.unsubscribe();
    };
  }, [client, onNotifications, accountIdsKey, enabled]);
}
