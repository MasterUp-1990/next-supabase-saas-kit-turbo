'use client';

import { useCallback, useMemo, useState } from 'react';

import type { AuthMethod, LastAuthMethod } from '../utils/last-auth-method';
import {
  clearLastAuthMethod,
  getLastAuthMethod,
  saveLastAuthMethod,
} from '../utils/last-auth-method';

function createAuthMethod(
  method: AuthMethod,
  options?: {
    provider?: string;
    email?: string;
  },
): LastAuthMethod {
  return {
    method,
    provider: options?.provider,
    email: options?.email,
    timestamp: Date.now(),
  };
}

/**
 * Records the method a user signed in with. Safe to call from components that
 * render on the server: it only touches localStorage from event handlers.
 */
export function useRecordAuthMethod() {
  return useCallback(
    (...args: Parameters<typeof createAuthMethod>) =>
      saveLastAuthMethod(createAuthMethod(...args)),
    [],
  );
}

/**
 * Reads the last used auth method from localStorage during render, so only
 * call it below `use(browser())` inside a `<Suspense>` boundary.
 */
export function useLastAuthMethod() {
  const [lastAuthMethod, setLastAuthMethod] = useState<LastAuthMethod | null>(
    getLastAuthMethod,
  );

  // Save a new auth method - memoized to prevent unnecessary re-renders
  const recordAuthMethod = useCallback(
    (...args: Parameters<typeof createAuthMethod>) => {
      const authMethod = createAuthMethod(...args);

      saveLastAuthMethod(authMethod);
      setLastAuthMethod(authMethod);
    },
    [],
  );

  // Clear the stored auth method - memoized to prevent unnecessary re-renders
  const clearAuthMethod = useCallback(() => {
    clearLastAuthMethod();
    setLastAuthMethod(null);
  }, []);

  // Compute derived values using useMemo for performance
  const derivedData = useMemo(() => {
    if (!lastAuthMethod) {
      return {
        hasLastMethod: false,
        methodType: null,
        providerName: null,
        isOAuth: false,
      };
    }

    const isOAuth = lastAuthMethod.method === 'oauth';

    const providerName =
      isOAuth && lastAuthMethod.provider
        ? lastAuthMethod.provider.charAt(0).toUpperCase() +
          lastAuthMethod.provider.slice(1)
        : null;

    return {
      hasLastMethod: true,
      methodType: lastAuthMethod.method,
      providerName,
      isOAuth,
    };
  }, [lastAuthMethod]);

  return {
    lastAuthMethod,
    recordAuthMethod,
    clearAuthMethod,
    ...derivedData,
  };
}
