'use client';

import { getSafeRedirectPath } from '@kit/shared/safe-redirect';
import { useSignOut } from '@kit/supabase/hooks/use-sign-out';
import { Button } from '@kit/ui/button';
import { Trans } from '@kit/ui/trans';

export function SignOutInvitationButton(
  props: React.PropsWithChildren<{
    nextPath: string;
  }>,
) {
  const signOut = useSignOut();

  return (
    <Button
      variant={'ghost'}
      onClick={async () => {
        await signOut.mutateAsync();

        // Validate the path to prevent open redirect attacks
        const safePath = getSafeRedirectPath(props.nextPath, '/');

        window.location.assign(safePath);
      }}
    >
      <Trans i18nKey={'teams.signInWithDifferentAccount'} />
    </Button>
  );
}
