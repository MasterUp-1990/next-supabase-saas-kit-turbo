import { Suspense } from 'react';

import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { getTranslations } from 'next-intl/server';

import { AuthLayoutShell } from '@kit/auth/auth-layout';
import { UpdatePasswordForm } from '@kit/auth/password-reset';
import { getSafeRedirectPath } from '@kit/shared/safe-redirect';
import { requireUser } from '@kit/supabase/require-user';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { AppLogo } from '~/components/app-logo';
import pathsConfig from '~/config/paths.config';

export const generateMetadata = async () => {
  const t = await getTranslations('auth');

  return {
    title: t('updatePassword'),
  };
};

const Logo = () => <AppLogo href={''} />;

interface UpdatePasswordPageProps {
  searchParams: Promise<{
    callback?: string;
  }>;
}

function UpdatePasswordPage(props: UpdatePasswordPageProps) {
  return (
    <AuthLayoutShell Logo={Logo}>
      <Suspense fallback={null}>
        <UpdatePasswordFormContainer searchParams={props.searchParams} />
      </Suspense>
    </AuthLayoutShell>
  );
}

/** The proxy already gated this route; this check is defence in depth. */
async function UpdatePasswordFormContainer({
  searchParams,
}: {
  searchParams: UpdatePasswordPageProps['searchParams'];
}) {
  await connection();

  const client = getSupabaseServerClient();

  const result = await requireUser(client, {
    next: pathsConfig.auth.passwordUpdate,
    signInPath: pathsConfig.auth.signIn,
    mfaVerifyPath: pathsConfig.auth.verifyMfa,
  });

  if (result.error) {
    return redirect(result.redirectTo);
  }

  const { callback } = await searchParams;
  const redirectTo = getSafeRedirectPath(callback, pathsConfig.app.home);

  return <UpdatePasswordForm redirectTo={redirectTo} />;
}

export default UpdatePasswordPage;
