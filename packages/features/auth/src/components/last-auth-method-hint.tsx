'use client';

import { Suspense, use } from 'react';
import { browser } from 'react-dom';

import { Badge } from '@kit/ui/badge';
import { Trans } from '@kit/ui/trans';
import { cn } from '@kit/ui/utils';

import { useLastAuthMethod } from '../hooks/use-last-auth-method';
import { AuthMethod } from '../utils/last-auth-method';

interface LastAuthMethodHintProps {
  className?: string;
  name?: string;
  type: AuthMethod;
}

// the last method lives in localStorage, so the hint renders in the browser
// only, after hydration
export function LastAuthMethodHint(props: LastAuthMethodHintProps) {
  return (
    <Suspense fallback={null}>
      <LastAuthMethodHintImpl {...props} />
    </Suspense>
  );
}

function LastAuthMethodHintImpl({
  className,
  type,
  name,
}: LastAuthMethodHintProps) {
  use(browser('reads the last auth method from localStorage'));

  const { hasLastMethod, methodType, isOAuth, providerName } =
    useLastAuthMethod();

  // Don't show anything until loaded or if no last method
  if (!hasLastMethod || methodType !== type) {
    return null;
  }

  if (isOAuth) {
    if (providerName !== name) {
      return null;
    }
  }

  return (
    <Badge
      data-test="last-auth-method-hint"
      className={cn(
        'animate-in fade-in-50 zoom-in scale-75 bg-blue-500 text-white duration-500 dark:bg-blue-400 dark:text-black',
        className,
      )}
    >
      <Trans i18nKey="auth.lastUsedMethod" />
    </Badge>
  );
}
