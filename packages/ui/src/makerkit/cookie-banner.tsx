'use client';

import { Suspense, use, useCallback, useMemo, useState } from 'react';
import { browser } from 'react-dom';

import { Button } from '../shadcn/button';
import { Dialog, DialogContent } from '../shadcn/dialog';
import { Heading } from '../shadcn/heading';
import { Trans } from './trans';

// configure this as you wish
const COOKIE_CONSENT_STATUS = 'cookie_consent_status';

enum ConsentStatus {
  Accepted = 'accepted',
  Rejected = 'rejected',
  Unknown = 'unknown',
}

/**
 * Renders in the browser only, after hydration: consent lives in
 * localStorage, so a server render would not match.
 */
export function CookieBanner() {
  return (
    <Suspense fallback={null}>
      <CookieBannerDialog />
    </Suspense>
  );
}

function CookieBannerDialog() {
  use(browser('reads cookie consent from localStorage'));

  const { status, accept, reject } = useCookieConsent();

  if (status !== ConsentStatus.Unknown) {
    return null;
  }

  return (
    <Dialog open modal={false}>
      <DialogContent
        className={`dark:shadow-primary-500/40 bg-background animate-in fade-in zoom-in-95 slide-in-from-bottom-16 fill-mode-both fixed bottom-0 w-full max-w-lg border p-6 shadow-2xl delay-1000 duration-1000 lg:bottom-[2rem] lg:left-[2rem] lg:h-48 lg:rounded-lg`}
      >
        <div className={'flex flex-col space-y-4'}>
          <div>
            <Heading level={3}>
              <Trans i18nKey={'cookieBanner.title'} />
            </Heading>
          </div>

          <div className={'text-gray-500 dark:text-gray-400'}>
            <Trans i18nKey={'cookieBanner.description'} />
          </div>

          <div className={'flex justify-end space-x-2.5'}>
            <Button variant={'ghost'} onClick={reject}>
              <Trans i18nKey={'cookieBanner.reject'} />
            </Button>

            <Button autoFocus onClick={accept}>
              <Trans i18nKey={'cookieBanner.accept'} />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useCookieConsent() {
  const initialState = getStatusFromLocalStorage();
  const [status, setStatus] = useState<ConsentStatus>(initialState);

  const accept = useCallback(() => {
    const status = ConsentStatus.Accepted;

    setStatus(status);
    storeStatusInLocalStorage(status);
  }, []);

  const reject = useCallback(() => {
    const status = ConsentStatus.Rejected;

    setStatus(status);
    storeStatusInLocalStorage(status);
  }, []);

  const clear = useCallback(() => {
    const status = ConsentStatus.Unknown;

    setStatus(status);
    storeStatusInLocalStorage(status);
  }, []);

  return useMemo(() => {
    return {
      clear,
      status,
      accept,
      reject,
    };
  }, [clear, status, accept, reject]);
}

// called from event handlers only, so it always runs in the browser
function storeStatusInLocalStorage(status: ConsentStatus) {
  localStorage.setItem(COOKIE_CONSENT_STATUS, status);
}

// `useCookieConsent` may render on the server, where there is no localStorage
function getStatusFromLocalStorage() {
  if (typeof localStorage === 'undefined') {
    return ConsentStatus.Unknown;
  }

  const status = localStorage.getItem(COOKIE_CONSENT_STATUS) as ConsentStatus;

  return status ?? ConsentStatus.Unknown;
}
