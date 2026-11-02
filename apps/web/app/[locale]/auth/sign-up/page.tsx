import { Suspense } from 'react';

import Link from 'next/link';

import { getTranslations } from 'next-intl/server';

import { SignUpMethodsContainer } from '@kit/auth/sign-up';
import { Button } from '@kit/ui/button';
import { Heading } from '@kit/ui/heading';
import { Skeleton } from '@kit/ui/skeleton';
import { Trans } from '@kit/ui/trans';

import authConfig from '~/config/auth.config';
import pathsConfig from '~/config/paths.config';

interface SignUpPageProps {
  searchParams: Promise<{
    next?: string;
    email?: string;
  }>;
}

export const generateMetadata = async () => {
  const t = await getTranslations('auth');

  return {
    title: t('signUp'),
  };
};

const paths = {
  callback: pathsConfig.auth.callback,
  appHome: pathsConfig.app.home,
};

function SignUpPage({ searchParams }: SignUpPageProps) {
  return (
    <>
      <div className={'flex flex-col items-center'}>
        <Heading level={2} className={'tracking-tighter'}>
          <Trans i18nKey={'auth.signUpHeading'} />
        </Heading>
      </div>

      <Suspense fallback={<AuthFormFallback />}>
        <SignUpMethods searchParams={searchParams} />
      </Suspense>

      <div className={'flex justify-center'}>
        <Button
          render={
            <Link href={pathsConfig.auth.signIn}>
              <Trans i18nKey={'auth.alreadyHaveAnAccount'} />
            </Link>
          }
          variant={'link'}
          size={'sm'}
          nativeButton={false}
        />
      </div>
    </>
  );
}

export default SignUpPage;

function AuthFormFallback() {
  return (
    <div className={'flex w-full flex-col space-y-4'}>
      <Skeleton className={'h-10 w-full'} />
      <Skeleton className={'h-10 w-full'} />
      <Skeleton className={'h-10 w-full'} />
    </div>
  );
}

// `next` and `email` come from the request on the server, so the form
// renders the same on the server and in the browser
async function SignUpMethods({ searchParams }: SignUpPageProps) {
  const { next, email } = await searchParams;

  return (
    <SignUpMethodsContainer
      providers={authConfig.providers}
      displayTermsCheckbox={authConfig.displayTermsCheckbox}
      paths={paths}
      captchaSiteKey={authConfig.captchaTokenSiteKey}
      nextPath={next}
      defaultEmail={email}
    />
  );
}
