'use client';

import { useCallback } from 'react';

import { Fingerprint } from 'lucide-react';

import { useSignInWithPasskey } from '@kit/supabase/hooks/use-sign-in-with-passkey';
import { isPasskeyCeremonyCancelled } from '@kit/supabase/passkey-errors';
import { Button } from '@kit/ui/button';
import { If } from '@kit/ui/if';
import { LoadingOverlay } from '@kit/ui/loading-overlay';
import { Trans } from '@kit/ui/trans';

import { useCaptcha } from '../captcha/client';
import { useRecordAuthMethod } from '../hooks/use-last-auth-method';
import { AuthErrorAlert } from './auth-error-alert';
import { LastAuthMethodHint } from './last-auth-method-hint';

/**
 * @name PasskeySignInContainer
 * @description
 * Renders a button that signs the user in with a passkey (WebAuthn). The
 * button blends in with the OAuth providers so it floats seamlessly with the
 * other sign-in options.
 */
export function PasskeySignInContainer({
  onSignIn,
  captchaSiteKey,
}: {
  onSignIn?: (userId?: string) => unknown;
  captchaSiteKey?: string;
}) {
  const captcha = useCaptcha({ siteKey: captchaSiteKey });
  const signInMutation = useSignInWithPasskey();
  const recordAuthMethod = useRecordAuthMethod();

  const loading = signInMutation.isPending;
  const captchaLoading = !captcha.isReady;

  // dismissing the browser prompt is a routine action, not an error — don't
  // surface a destructive alert when the ceremony is cancelled by the user
  const error = isPasskeyCeremonyCancelled(signInMutation.error)
    ? null
    : signInMutation.error;

  const onClick = useCallback(async () => {
    try {
      const data = await signInMutation.mutateAsync({
        options: { captchaToken: captcha.token },
      });

      // Record successful passkey sign-in
      recordAuthMethod('passkey');

      if (onSignIn) {
        onSignIn(data?.user?.id);
      }
    } catch {
      // the user cancelled the ceremony or the credential was rejected
    } finally {
      captcha.reset();
    }
  }, [captcha, onSignIn, recordAuthMethod, signInMutation]);

  return (
    <>
      <If condition={loading}>
        <LoadingOverlay />
      </If>

      <div className={'flex w-full flex-1 flex-col space-y-3'}>
        <Button
          className={'relative flex w-full gap-x-3 text-center'}
          data-test={'passkey-sign-in-button'}
          variant={'outline'}
          disabled={loading || captchaLoading}
          onClick={onClick}
        >
          <Fingerprint className={'h-4 w-4'} />

          <span>
            <Trans i18nKey={'auth.signInWithPasskey'} />
          </span>

          <LastAuthMethodHint
            type="passkey"
            className="absolute right-0 translate-x-[50%] translate-y-[-50%]"
          />
        </Button>

        {captcha.field}

        <AuthErrorAlert error={error} />
      </div>
    </>
  );
}
