'use client';

import { Suspense } from 'react';

import { useSearchParams } from 'next/navigation';

import type { Provider } from '@supabase/supabase-js';

import { isSafeRedirectPath } from '@kit/shared/safe-redirect';
import { If } from '@kit/ui/if';
import { Separator } from '@kit/ui/separator';
import { Trans } from '@kit/ui/trans';

import { MagicLinkAuthContainer } from './magic-link-auth-container';
import { OauthProviders } from './oauth-providers';
import { OtpSignInContainer } from './otp-sign-in-container';
import { EmailPasswordSignUpContainer } from './password-sign-up-container';

interface SignUpMethodsContainerProps {
  paths: {
    callback: string;
    appHome: string;
  };

  providers: {
    password: boolean;
    magicLink: boolean;
    otp: boolean;
    // NB: passkey sign-up is not supported — passkeys authenticate an existing
    // account, so they only appear on the sign-in page.
    passkey: boolean;
    oAuth: Provider[];
  };

  displayTermsCheckbox?: boolean;
  captchaSiteKey?: string;

  /** Path to continue to after the email link; ignored unless safe. Prefer reading it from `searchParams` on the server. */
  nextPath?: string;

  /** Prefills the email field. Prefer reading it from `searchParams` on the server. */
  defaultEmail?: string;
}

/**
 * Pass `nextPath` and `defaultEmail` from the page's `searchParams`. When
 * neither prop is passed (pages written before they existed), `next` and
 * `email` are read with `useSearchParams()` instead: the form renders without
 * them on the server and with them once the browser has the URL.
 */
export function SignUpMethodsContainer(props: SignUpMethodsContainerProps) {
  const hasParamsFromPage = 'nextPath' in props || 'defaultEmail' in props;

  if (hasParamsFromPage) {
    return <SignUpMethods {...props} />;
  }

  return (
    <Suspense fallback={<SignUpMethods {...props} />}>
      <SignUpMethodsFromSearchParams {...props} />
    </Suspense>
  );
}

function SignUpMethodsFromSearchParams(props: SignUpMethodsContainerProps) {
  const searchParams = useSearchParams();

  return (
    <SignUpMethods
      {...props}
      nextPath={searchParams.get('next') ?? undefined}
      defaultEmail={searchParams.get('email') ?? undefined}
    />
  );
}

function SignUpMethods(props: SignUpMethodsContainerProps) {
  const redirectUrl = getCallbackPath({
    callback: props.paths.callback,
    nextPath: props.nextPath,
  });

  const defaultValues = { email: props.defaultEmail ?? '' };

  return (
    <>
      <If condition={props.providers.password}>
        <EmailPasswordSignUpContainer
          emailRedirectTo={redirectUrl}
          defaultValues={defaultValues}
          displayTermsCheckbox={props.displayTermsCheckbox}
          captchaSiteKey={props.captchaSiteKey}
        />
      </If>

      <If condition={props.providers.otp}>
        <OtpSignInContainer
          shouldCreateUser={true}
          captchaSiteKey={props.captchaSiteKey}
        />
      </If>

      <If condition={props.providers.magicLink}>
        <MagicLinkAuthContainer
          redirectUrl={redirectUrl}
          shouldCreateUser={true}
          defaultValues={defaultValues}
          displayTermsCheckbox={props.displayTermsCheckbox}
          captchaSiteKey={props.captchaSiteKey}
        />
      </If>

      <If condition={props.providers.oAuth.length}>
        <If
          condition={
            props.providers.magicLink ||
            props.providers.password ||
            props.providers.otp
          }
        >
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>

            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background text-muted-foreground px-2 text-[0.6rem]">
                <Trans i18nKey="auth.orContinueWith" />
              </span>
            </div>
          </div>
        </If>

        <OauthProviders
          enabledProviders={props.providers.oAuth}
          shouldCreateUser={true}
          paths={{
            callback: props.paths.callback,
            returnPath: props.paths.appHome,
          }}
        />
      </If>
    </>
  );
}

// a relative path; the forms resolve it against the origin at submit time
function getCallbackPath(params: { callback: string; nextPath?: string }) {
  const { callback, nextPath } = params;

  // Only pass through the next param if it's a safe internal path
  if (!nextPath || !isSafeRedirectPath(nextPath)) {
    return callback;
  }

  const query = new URLSearchParams({ next: nextPath });

  return `${callback}?${query.toString()}`;
}
