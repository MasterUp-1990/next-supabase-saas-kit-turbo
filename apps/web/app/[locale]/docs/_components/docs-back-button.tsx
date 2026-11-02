'use client';

import { Suspense } from 'react';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { ArrowLeftIcon } from 'lucide-react';

import { getSafeRedirectPath } from '@kit/shared/safe-redirect';
import { Button } from '@kit/ui/button';
import { Trans } from '@kit/ui/trans';

import appConfig from '~/config/app.config';

export function DocsBackButton() {
  return (
    <Suspense fallback={<BackLink href={'/'} />}>
      <DocsBackButtonLink />
    </Suspense>
  );
}

/**
 * Only the destination depends on `returnPath`, so the fallback renders the
 * same button pointing home and the header never shifts.
 */
function DocsBackButtonLink() {
  const searchParams = useSearchParams();
  const returnPath = searchParams.get('returnPath');

  return <BackLink href={getSafeRedirectPath(returnPath, '/') || '/'} />;
}

function BackLink({ href }: { href: string }) {
  return (
    <Button
      nativeButton={false}
      variant="link"
      render={
        <Link href={href}>
          <ArrowLeftIcon className="size-4" />{' '}
          <span className={'hidden sm:block'}>
            <Trans i18nKey="common.back" values={{ product: appConfig.name }} />
          </span>
        </Link>
      }
    />
  );
}
