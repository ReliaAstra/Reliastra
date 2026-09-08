'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { getRefreshToken, useAppStore } from '@/stores/app-store';
import { api, restoreSession } from '@/lib/dashboard/api';
import { BootSplash } from '@/components/shared/boot-splash';

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
 * access token - every entitlement decision (plan, trial, admin) is made by
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
  const hydrated = useAppStore((s) => s.hydrated);
  const bootstrapped = useRef(false);
  const enterDemoMode = useAppStore((s) => s.enterDemoMode);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    // NOTE: deliberately no `cancelled` flag here.
    //
    // `bootstrapped` is a one-shot ref that survives StrictMode's synthetic
    // unmount/remount, so the second mount returns early and never restarts
    // the bootstrap. A cleanup that cancelled the first run therefore had
    // nothing to supersede it: `setHydrated(true)` was skipped, `hydrated`
    // stayed false, and every console route sat on the boot splash forever in
    // development. Everything written below lands in the global Zustand store
    // rather than component state, so writing after unmount is safe.
    const redirectToSignIn = () => {
      setSessionState('unauthenticated');
      router.replace('/login');
    };

    // Customer and partner sessions are deliberately separate namespaces.
    const refresh = getRefreshToken();

    if (!refresh) {
      setHydrated(true);
      setSessionState('unauthenticated');
      router.replace('/login');
      return;
    }

    (async () => {
      try {
        const session = await restoreSession();
        if (!session) throw new Error('session rejected');
        setSession(session.user, session.org, session.plan);
      } catch {
        redirectToSignIn();
      } finally {
        setHydrated(true);
      }
    })();
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

  // Gate the console on a resolved, authenticated session.
  //
  // `hydrated` was written by the bootstrap effect above but never read, so
  // every console route rendered its full chrome - top bar, sidebar and page
  // content - to an unauthenticated visitor, and only redirected once the
  // effect fired. Queries were already gated by `useSessionReady()`, so this
  // produced no 401 storm, but it did serve console UI (and its HTML) to
  // anonymous visitors and flash it before bouncing to /login.
  //
  // While the session resolves, or while an unauthenticated redirect is in
  // flight, render the splash instead. Children never mount, so their hooks
  // never run.
  if (!hydrated || sessionState !== 'authenticated') {
    return <BootSplash />;
  }

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
