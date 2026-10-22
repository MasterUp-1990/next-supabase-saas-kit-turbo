import { Suspense } from 'react';

import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { getTranslations } from 'next-intl/server';

import { MultiFactorChallengeContainer } from '@kit/auth/mfa';
import { getSafeRedirectPath } from '@kit/shared/utils';
import {
  InvalidSessionError,
  verifySessionAssurance,
} from '@kit/supabase/check-requires-mfa';
import { getSupabaseServerClient } from '@kit/supabase/server-client';
import { Skeleton } from '@kit/ui/skeleton';

import pathsConfig from '~/config/paths.config';

interface Props {
  searchParams: Promise<{
    next?: string;
  }>;
}

export const generateMetadata = async () => {
  const t = await getTranslations('auth');

  return {
    title: t('signIn'),
  };
};

function VerifyPage(props: Props) {
  return (
    <Suspense fallback={<ChallengeFallback />}>
      <MultiFactorChallenge searchParams={props.searchParams} />
    </Suspense>
  );
}

export default VerifyPage;

function ChallengeFallback() {
  return (
    <div className={'flex w-full flex-col space-y-4'}>
      <Skeleton className={'h-10 w-full'} />
      <Skeleton className={'h-10 w-full'} />
    </div>
  );
}

/**
 * Reading the session is what makes this route per-request, so it sits behind
 * the boundary: the auth card renders straight away and only the challenge
 * itself waits.
 */
async function MultiFactorChallenge(props: Props) {
  await connection();

  const client = getSupabaseServerClient();

  // A session the Auth server rejected goes to sign-in like any other
  // signed-out visitor; the proxy clears its cookie on the way.
  const session = await verifySessionAssurance(client).catch(
    (error: unknown) => {
      if (error instanceof InvalidSessionError) {
        return { claims: null };
      }

      throw error;
    },
  );

  if (!session.claims || !session.requiresMfa) {
    redirect(pathsConfig.auth.signIn);
  }

  const nextPath = (await props.searchParams).next;
  const redirectPath = getSafeRedirectPath(nextPath, pathsConfig.app.home);

  return (
    <MultiFactorChallengeContainer
      userId={session.claims.sub}
      paths={{
        redirectPath,
      }}
    />
  );
}
