import { useEffect } from 'react';

import { useQuery } from '@tanstack/react-query';

import { useSupabase } from '@kit/supabase/hooks/use-supabase';

import { Notification } from '../types';
import { useNotificationsStream } from './use-notifications-stream';

export function useFetchNotifications({
  onNotifications,
  accountIds,
  realtime,
}: {
  onNotifications: (notifications: Notification[]) => unknown;
  accountIds: string[];
  realtime: boolean;
}) {
  const { data: initialNotifications } = useFetchInitialNotifications({
    accountIds,
  });

  useNotificationsStream({
    onNotifications,
    accountIds,
    enabled: realtime,
  });

  useEffect(() => {
    if (initialNotifications) {
      onNotifications(initialNotifications);
    }
  }, [initialNotifications, onNotifications]);
}

export const NOTIFICATIONS_QUERY_KEY = 'notifications';

function useFetchInitialNotifications(props: { accountIds: string[] }) {
  const client = useSupabase();

  return useQuery({
    queryKey: [NOTIFICATIONS_QUERY_KEY, ...props.accountIds],
    queryFn: async () => {
      const now = new Date().toISOString();

      const { data, error } = await client
        .from('notifications')
        .select(
          `id, 
           body, 
           dismissed, 
           type, 
           created_at, 
           link
           `,
        )
        .in('account_id', props.accountIds)
        .eq('dismissed', false)
        // a NULL expiry means "never expires"; `gt` alone would drop it
        .or(`expires_at.is.null,expires_at.gt."${now}"`)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        throw error;
      }

      return data;
    },
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
