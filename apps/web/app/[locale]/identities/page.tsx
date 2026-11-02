import { Suspense } from 'react';

import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { getTranslations } from 'next-intl/server';

import { AuthLayoutShell } from '@kit/auth/auth-layout';
import { getSafeRedirectPath } from '@kit/shared/safe-redirect';
import { requireUser } from '@kit/supabase/require-user';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Heading } from '@kit/ui/heading';
import { Trans } from '@kit/ui/trans';

import { AppLogo } from '~/components/app-logo';
import authConfig from '~/config/auth.config';
import pathsConfig from '~/config/paths.config';

import { IdentitiesStepWrapper } from './_components/identities-step-wrapper';

export const meta = async (): Promise<Metadata> => {
  const t = await getTranslations('auth');

  return {
    title: t('setupAccount'),
  };
};

type IdentitiesPageProps = {
  searchParams: Promise<{ next?: string }>;
};

/**
 * @name IdentitiesPage
 * @description Displays linked accounts and available authentication methods.
 */
function IdentitiesPage(props: IdentitiesPageProps) {
  return (
    <Suspense fallback={null}>
      <IdentitiesPageContent searchParams={props.searchParams} />
    </Suspense>
  );
}

/** The proxy already gated this route; fetchData's check is defence in depth. */
async function IdentitiesPageContent(props: IdentitiesPageProps) {
  const {
    nextPath,
    showPasswordOption,
    showEmailOption,
    oAuthProviders,
    enableIdentityLinking,
    requiresConfirmation,
  } = await fetchData(props);

  return (
    <AuthLayoutShell
      Logo={AppLogo}
      contentClassName="max-w-md overflow-y-hidden"
    >
      <div
        className={
          'flex max-h-[70vh] w-full flex-col items-center space-y-6 overflow-y-auto'
        }
      >
        <div className={'flex flex-col items-center gap-1'}>
          <Heading
            level={4}
            className="text-center"
            data-test="identities-page-heading"
          >
            <Trans i18nKey={'auth.linkAccountToSignIn'} />
          </Heading>

          <Heading
            level={6}
            className={'text-muted-foreground text-center text-sm'}
            data-test="identities-page-description"
          >
            <Trans i18nKey={'auth.linkAccountToSignInDescription'} />
          </Heading>
        </div>

        <IdentitiesStepWrapper
          nextPath={nextPath}
          showPasswordOption={showPasswordOption}
          showEmailOption={showEmailOption}
          oAuthProviders={oAuthProviders}
          enableIdentityLinking={enableIdentityLinking}
          requiresConfirmation={requiresConfirmation}
        />
      </div>
    </AuthLayoutShell>
  );
}

export default IdentitiesPage;

async function fetchData(props: IdentitiesPageProps) {
  const searchParams = await props.searchParams;
  await connection();

  const client = getSupabaseServerClient();
  const auth = await requireUser(client);

  // If not authenticated, redirect to sign in
  if (!auth.data) {
    throw redirect(pathsConfig.auth.signIn);
  }

  // Get the next path from URL params (where to redirect after setup)
  const nextPath = getSafeRedirectPath(searchParams.next, pathsConfig.app.home);

  // Available auth methods to add
  const showPasswordOption = authConfig.providers.password;

  // Show email option if password, magic link, or OTP is enabled
  const showEmailOption =
    authConfig.providers.password ||
    authConfig.providers.magicLink ||
    authConfig.providers.otp;

  const oAuthProviders = authConfig.providers.oAuth;
  const enableIdentityLinking = authConfig.enableIdentityLinking;

  // Only require confirmation if password or oauth providers are enabled
  const requiresConfirmation =
    authConfig.providers.password || oAuthProviders.length > 0;

  return {
    nextPath,
    showPasswordOption,
    showEmailOption,
    oAuthProviders,
    enableIdentityLinking,
    requiresConfirmation,
  };
}
