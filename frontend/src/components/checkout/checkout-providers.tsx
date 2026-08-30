'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Query client for the checkout route.
 *
 * Deliberately NOT the console's `DashboardProviders`: that wrapper redirects
 * an anonymous visitor to `/login` as soon as it mounts. Checkout wants the
 * opposite behaviour — keep the customer on the page, show them exactly what
 * they are about to pay, and let them sign in without losing the context — so
 * it takes the cache layer without the auth gate. The gate still exists where it
 * belongs: every billing endpoint answers 401/403 on its own merits, and this
 * page renders its signed-out state from that.
 */
export function CheckoutProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
        },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
