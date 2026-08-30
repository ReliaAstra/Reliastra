import { Suspense } from 'react';

import { CheckoutExperience } from '@/components/checkout/checkout-experience';
import { CheckoutSkeleton } from '@/components/checkout/checkout-skeleton';

export const dynamic = 'force-dynamic';

/**
 * `/checkout` — RELIASTRA's payment surface.
 *
 * The page takes a plan and a billing interval from the query string and
 * nothing else. It is not a security boundary and does not pretend to be one:
 * the plan id is re-normalized server-side, the price is re-resolved from
 * RELIASTRA's published payment catalog, and any figure a client tried to
 * smuggle in has nowhere to be read. `force-dynamic` keeps the response
 * per-customer and uncached, since the quote embeds the organization's name and
 * billing email.
 *
 * `Suspense` is required by `useSearchParams` in the client tree, and its
 * fallback is the same skeleton the data load uses, so a slow read and a fast
 * one render the identical frame.
 */
export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutSkeleton />}>
      <CheckoutExperience />
    </Suspense>
  );
}
