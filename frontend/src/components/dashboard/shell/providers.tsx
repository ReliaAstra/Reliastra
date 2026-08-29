'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { getRefreshToken, useAppStore } from '@/stores/app-store';
import { api, bootstrapSession } from '@/lib/dashboard/api';

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

/**
 * Session bootstrap for the console.
 *
 * The refresh token in localStorage is only a convenience to obtain a fresh
 * access token — every entitlement decision (plan, trial, admin) is made by
 * the backend from the resulting JWT. Without a session the console routes
 * to the shared sign-in screen instead of rendering fabricated demo data.
 *
 * The bootstrap effect is guarded by a ref so React StrictMode's double
 * invocation cannot race the single-use refresh token against itself.
 */
export function DashboardProviders({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);
  const router = useRouter();
  const setHydrated = useAppStore((s) => s.setHydrated);
  const setSessionState = useAppStore((s) => s.setSessionState);
  const setSession = useAppStore((s) => s.setSession);
  const setOnline = useAppStore((s) => s.setOnline);
  const sessionState = useAppStore((s) => s.sessionState);
  const bootstrapped = useRef(false);
  const enterDemoMode = useAppStore((s) => s.enterDemoMode);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    let cancelled = false;

    const redirectToSignIn = () => {
      if (cancelled) return;
      setSessionState('unauthenticated');
      router.replace('/login');
    };

    const refresh =
      getRefreshToken() ??
      (typeof window !== 'undefined'
        ? window.localStorage.getItem('partner_refresh_token')
        : null);

    if (!refresh) {
      setHydrated(true);
      setSessionState('unauthenticated');
      router.replace('/login');
      return;
    }

    (async () => {
      try {
        const session = await bootstrapSession();
        if (!session) throw new Error('session rejected');
        if (!cancelled) setSession(session.user, session.org, session.plan);
      } catch {
        redirectToSignIn();
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, setHydrated, setSessionState, setSession]);

  // Route away the moment the backend rejects an expired session.
  useEffect(() => {
    if (sessionState === 'expired') {
      router.replace('/login?expired=1');
    }
  }, [sessionState, router]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [setOnline]);

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          className: 'rs-toast-in',
          style: {
            background: '#111827',
            border: '1px solid #1E293B',
            color: '#F8FAFC',
            boxShadow: 'none',
          },
        }}
      />
    </QueryClientProvider>
  );
}
