import { useCallback } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { useSupabase } from '@kit/supabase/hooks/use-supabase';

import { NOTIFICATIONS_QUERY_KEY } from './use-fetch-notifications';

export function useDismissNotification() {
  const client = useSupabase();
  const queryClient = useQueryClient();

  return useCallback(
    async (notification: number) => {
      // the initial fetch is cached and not refetched on mount, so drop the
      // notification from every cached list. Otherwise a remounted popover
      // would restore it from the stale cache.
      queryClient.setQueriesData<{ id: number }[] | null>(
        { queryKey: [NOTIFICATIONS_QUERY_KEY] },
        (existing) => existing?.filter((item) => item.id !== notification),
      );

      const { error } = await client
        .from('notifications')
        .update({ dismissed: true })
        .eq('id', notification);

      if (error) {
        await queryClient.invalidateQueries({
          queryKey: [NOTIFICATIONS_QUERY_KEY],
        });

        throw error;
      }
    },
    [client, queryClient],
  );
}
