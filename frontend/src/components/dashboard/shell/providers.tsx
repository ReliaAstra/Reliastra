'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { getRefreshToken, useAppStore } from '@/stores/app-store';
import { api } from '@/lib/dashboard/api';

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

export function DashboardProviders({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);
  const setHydrated = useAppStore((s) => s.setHydrated);
  const setSession = useAppStore((s) => s.setSession);
  const setAccessToken = useAppStore((s) => s.setAccessToken);
  const setOnline = useAppStore((s) => s.setOnline);
  const enterDemoMode = useAppStore((s) => s.enterDemoMode);

  useEffect(() => {
    const refresh = getRefreshToken();
    if (!refresh) {
      enterDemoMode();
      setHydrated(true);
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refresh }),
        });
        if (!res.ok) throw new Error('refresh');
        const data = await res.json();
        if (data.access_token) setAccessToken(data.access_token);
        const [user, org, plan] = await Promise.all([api.me(), api.org(), api.plan()]);
        setSession(user, org, plan);
      } catch {
        enterDemoMode();
      } finally {
        setHydrated(true);
      }
    })();
  }, [setHydrated, setSession, setAccessToken, enterDemoMode]);

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
