'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { adminApi, AdminApiError } from '@/lib/admin-api';
import type { AdminOverviewResponse } from '@/types/admin';
import { AdminShell } from '@/components/admin/admin-shell';

interface AdminAccessContextValue {
  overview: AdminOverviewResponse;
}

const AdminAccessContext = createContext<AdminAccessContextValue | null>(null);

export function useAdminAccess() {
  const context = useContext(AdminAccessContext);
  if (!context) {
    throw new Error('useAdminAccess must be used within the verified Admin workspace.');
  }
  return context;
}

function createAdminQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (error instanceof AdminApiError && [0, 401, 403, 404, 422].includes(error.status)) {
            return false;
          }
          return failureCount < 1;
        },
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function AdminAccessGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [accessFailure, setAccessFailure] = useState<'expired' | 'denied' | null>(null);

  // The login page must never be gated: it is the entry point that mints the
  // session. Gating it causes an infinite loop - overview 401 -> expired event
  // -> redirect to /admin/login?next=/admin/login -> remount -> overview 401.
  // `usePathname()` can be null on the very first render; fall back to the
  // live location so the login page is never misclassified as gated.
  const currentPath =
    pathname ?? (typeof window !== 'undefined' ? window.location.pathname : null);
  const isLoginPage = currentPath === '/admin/login' || currentPath?.startsWith('/admin/login/');

  const overviewQuery = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: adminApi.overview,
    staleTime: 45_000,
    refetchInterval: 60_000,
    enabled: !isLoginPage,
  });

  // Every admin API request dispatches this event on 401/403. Clearing the
  // whole query cache prevents a stale customer, financial, or support view
  // from remaining visible after a session expires.
  //
  // The admin session is a SEPARATE security domain (HttpOnly admin cookies),
  // so "expired" routes to the dedicated /admin/login - never to the shared
  // customer sign-in. The customer/partner session is never touched here.
  useEffect(() => {
    const onExpired = () => {
      // Already on the login page - no redirect needed. Redirecting here
      // creates /admin/login?next=/admin/login and a constant refresh loop.
      if (window.location.pathname.startsWith('/admin/login')) {
        queryClient.clear();
        setAccessFailure('expired');
        return;
      }
      queryClient.clear();
      setAccessFailure('expired');
      router.replace(window.location.pathname === '/admin'
        ? '/admin/login'
        : `/admin/login?next=${encodeURIComponent(window.location.pathname)}`);
    };
    const onDenied = () => {
      queryClient.clear();
      setAccessFailure('denied');
    };
    window.addEventListener('reliastra:admin-expired', onExpired);
    window.addEventListener('reliastra:admin-denied', onDenied);
    return () => {
      window.removeEventListener('reliastra:admin-expired', onExpired);
      window.removeEventListener('reliastra:admin-denied', onDenied);
    };
  }, [queryClient, router]);

  const error = overviewQuery.error;
  const errorState = accessFailure ||
    (error instanceof AdminApiError && error.status === 401
      ? 'expired'
      : error instanceof AdminApiError && error.status === 403
        ? 'denied'
        : null);

  // Login route renders on its own - no overview probe, no AdminShell state.
  if (isLoginPage) {
    return <>{children}</>;
  }

  if (overviewQuery.isLoading && !errorState) {
    return <AdminShell state="loading">{null}</AdminShell>;
  }

  if (errorState) {
    return <AdminShell state={errorState}>{null}</AdminShell>;
  }

  if (overviewQuery.isError || !overviewQuery.data) {
    return (
      <AdminShell
        state="unavailable"
        onRetry={() => {
          setAccessFailure(null);
          overviewQuery.refetch();
        }}
      >
        {null}
      </AdminShell>
    );
  }

  return (
    <AdminAccessContext.Provider value={{ overview: overviewQuery.data }}>
      <AdminShell state="ready">{children}</AdminShell>
    </AdminAccessContext.Provider>
  );
}

export function AdminWorkspace({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createAdminQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AdminAccessGate>{children}</AdminAccessGate>
    </QueryClientProvider>
  );
}
