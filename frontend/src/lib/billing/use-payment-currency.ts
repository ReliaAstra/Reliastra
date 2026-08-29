'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_PAYMENT_CURRENCY,
  type PaymentCurrencyInfo,
} from './currency';

/**
 * The one billing-currency read shared by every payment surface.
 *
 * `/v1/billing/currency` is the backend's authoritative answer (it is the same
 * resolver that picks the amount and currency sent to Paystack). A module-level
 * cache keeps the pricing page, the upgrade modal and the billing page on a
 * single request, and a failed request falls back to the last-known-good
 * default rather than dropping the disclosure.
 */
let cached: PaymentCurrencyInfo | null = null;
let inflight: Promise<PaymentCurrencyInfo | null> | null = null;

function load(): Promise<PaymentCurrencyInfo | null> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch('/api/v1/billing/currency', { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<PaymentCurrencyInfo>) : null))
      .then((value) => {
        if (value && typeof value.payment_currency === 'string') cached = value;
        return cached;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function usePaymentCurrency(): {
  currency: PaymentCurrencyInfo;
  resolved: boolean;
} {
  const [currency, setCurrency] = useState<PaymentCurrencyInfo>(
    cached ?? DEFAULT_PAYMENT_CURRENCY
  );
  const [resolved, setResolved] = useState(cached !== null);

  useEffect(() => {
    let alive = true;
    void load().then((value) => {
      if (!alive) return;
      if (value) setCurrency(value);
      setResolved(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { currency, resolved };
}
