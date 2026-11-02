'use client';

import { useCallback } from 'react';

import { useRouter } from 'next/navigation';

import type { Provider } from '@supabase/supabase-js';

import { If } from '@kit/ui/if';
import { Separator } from '@kit/ui/separator';
import { Trans } from '@kit/ui/trans';

import { MagicLinkAuthContainer } from './magic-link-auth-container';
import { OauthProviders } from './oauth-providers';
import { OtpSignInContainer } from './otp-sign-in-container';
import { PasskeySignInContainer } from './passkey-sign-in-container';
import { PasswordSignInContainer } from './password-sign-in-container';

export function SignInMethodsContainer(props: {
  paths: {
    callback: string;
    joinTeam: string;
    returnPath: string;
  };

  providers: {
    password: boolean;
    magicLink: boolean;
    otp: boolean;
    passkey: boolean;
    oAuth: Provider[];
  };

  captchaSiteKey?: string;
}) {
  const router = useRouter();

  const onSignIn = useCallback(() => {
    const returnPath = props.paths.returnPath || '/home';

    router.replace(returnPath);
  }, [props.paths.returnPath, router]);

  // whether any email-based method (which renders a form) is enabled
  const hasEmailMethod =
    props.providers.password ||
    props.providers.magicLink ||
    props.providers.otp;

  // whether any non-email method (passkey or OAuth) is enabled
  const hasExternalMethod =
    props.providers.passkey || props.providers.oAuth.length > 0;

  return (
    <>
      <If condition={props.providers.password}>
        <PasswordSignInContainer
          onSignIn={onSignIn}
          captchaSiteKey={props.captchaSiteKey}
        />
      </If>

      <If condition={props.providers.magicLink}>
        <MagicLinkAuthContainer
          redirectUrl={props.paths.callback}
          shouldCreateUser={false}
          captchaSiteKey={props.captchaSiteKey}
        />
      </If>

      <If condition={props.providers.otp}>
        <OtpSignInContainer
          shouldCreateUser={false}
          captchaSiteKey={props.captchaSiteKey}
        />
      </If>

      <If condition={hasExternalMethod}>
        <If condition={hasEmailMethod}>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>

            <div className="relative flex justify-center text-[0.6rem] uppercase">
              <span className="bg-background text-muted-foreground px-2">
                <Trans i18nKey="auth.orContinueWith" />
              </span>
            </div>
          </div>
        </If>

        <div className={'flex-col space-y-2'}>
          <If condition={props.providers.passkey}>
            <PasskeySignInContainer
              onSignIn={onSignIn}
              captchaSiteKey={props.captchaSiteKey}
            />
          </If>

          <If condition={props.providers.oAuth.length}>
            <OauthProviders
              enabledProviders={props.providers.oAuth}
              shouldCreateUser={false}
              paths={{
                callback: props.paths.callback,
                returnPath: props.paths.returnPath,
              }}
            />
          </If>
        </div>
      </If>
    </>
  );
}
