'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
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
  const [accessFailure, setAccessFailure] = useState<'expired' | 'denied' | null>(null);

  const overviewQuery = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: adminApi.overview,
    staleTime: 45_000,
    refetchInterval: 60_000,
  });

  // Every admin API request dispatches this event on 401/403. Clearing the
  // whole query cache prevents a stale customer, financial, or support view
  // from remaining visible after a session expires or permissions change.
  useEffect(() => {
    const onExpired = () => {
      queryClient.clear();
      setAccessFailure('expired');
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
  }, [queryClient]);

  const error = overviewQuery.error;
  const errorState = accessFailure ||
    (error instanceof AdminApiError && error.status === 401
      ? 'expired'
      : error instanceof AdminApiError && error.status === 403
        ? 'denied'
        : null);

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
