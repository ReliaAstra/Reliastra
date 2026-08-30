'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import {
  ApiError,
  api,
  restoreSession,
  type CheckoutQuote,
  type InitializePaymentResult,
} from '@/lib/dashboard/api';
import { invalidateBilling } from '@/lib/dashboard/queries';
import { useAppStore } from '@/stores/app-store';
import { launchPaystackTransaction } from '@/lib/billing/paystack-inline';
import {
  CHECKOUT_FAILURE_COPY,
  fromProviderCallback,
  toCheckoutFailure,
  type CheckoutFailureCopy,
} from '@/lib/billing/checkout-errors';

import { CheckoutSkeleton } from './checkout-skeleton';
import { CheckoutFailure } from './checkout-failure';
import { CheckoutUnavailable } from './checkout-unavailable';
import { SignedOutPrompt } from './signed-out-prompt';
import { PaymentConfirmation } from './payment-confirmation';
import { OrderSummary } from './order-summary';
import { PaymentMethodPanel } from './payment-method-panel';

/**
 * RELIASTRA's checkout.
 *
 * This is the whole product surface between "I want Pro" and "my plan is
 * active", and it is deliberately not a payment form. What the page owns:
 *
 *   - the plan, the interval and the product price, read from a backend quote;
 *   - the exact amount that will be charged and the currency it settles in;
 *   - the explanation of why a USD price is charged in NGN;
 *   - the payment methods a *global* customer can actually use;
 *   - the resulting subscription state, after server-side verification.
 *
 * What it does not own, and will never pretend to: the card. Payment completes
 * inside Paystack's own secure surface, launched over this page from an access
 * code our backend minted. RELIASTRA has no card field, no card route, and no
 * reason to want one.
 *
 * ### The state machine
 *
 *     restoring → loading → review → preparing → paying → verifying → success
 *                    │          │         │          │         │
 *                    │          │         └──────────┴─────────┴──→ failed
 *                    └── signed-out            └── unavailable
 *
 * `success` is reachable only from a `verified: true` answer from our backend —
 * never from the provider's callback and never from the browser being redirected
 * back. A redirect is a navigation, not a receipt.
 *
 * ### Resuming
 *
 * If the browser leaves for the hosted fallback and returns with
 * `?reference=…`, the page goes straight to `verifying` and finishes the same
 * way. A mobile browser that discards the tab during the hand-off lands on the
 * same path — which is the point: the reference outlives the page.
 */

export type CheckoutPhase =
  | 'restoring'
  | 'signed-out'
  | 'loading'
  | 'review'
  | 'preparing'
  | 'paying'
  | 'verifying'
  | 'success'
  | 'failed'
  | 'unavailable';

export type CheckoutInterval = 'monthly' | 'annual';

/** RELIASTRA's only self-serve plan. Not a choice the page offers: the backend
 *  decides what is chargeable, and a hardcoded menu here would be a second
 *  source of truth about pricing. */
const CHECKOUT_PLAN = 'pro';

/** What the confirmation screen restates, all of it from the verification. */
export interface VerifiedPayment {
  reference: string;
  amount_display?: string | null;
  currency?: string | null;
  product_price_display?: string | null;
  display_plan?: string | null;
  billing_interval?: string | null;
  activated?: boolean;
  duplicate_payment?: boolean;
}

export function CheckoutExperience() {
  const searchParams = useSearchParams();
  const accessToken = useAppStore((s) => s.accessToken);
  const org = useAppStore((s) => s.org);
  const queryClient = useQueryClient();

  const initialInterval: CheckoutInterval =
    searchParams.get('interval') === 'annual' ? 'annual' : 'monthly';

  const [phase, setPhase] = useState<CheckoutPhase>('restoring');
  const [interval, setIntervalState] = useState<CheckoutInterval>(initialInterval);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [session, setSession] = useState<InitializePaymentResult | null>(null);
  const [failure, setFailure] = useState<CheckoutFailureCopy | null>(null);
  const [verified, setVerified] = useState<VerifiedPayment | null>(null);
  /** True while the browser is leaving for the hosted fallback page. */
  const [handingOff, setHandingOff] = useState(false);

  const resumedRef = useRef(false);
  const verifyingRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const alive = useCallback(() => mountedRef.current, []);

  // ── Session gate ─────────────────────────────────────────────────────────
  // Checkout is organization-scoped, not public: the quote carries the billing
  // organization's name and the payer's email. An anonymous visitor is invited
  // to sign in *without losing this page*, which is what makes a
  // payment-in-progress recoverable.
  useEffect(() => {
    if (accessToken && org) return;
    let cancelled = false;
    void restoreSession().then((restored) => {
      if (!cancelled && !restored) setPhase('signed-out');
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, org]);

  const loadQuote = useCallback(
    async (which: CheckoutInterval) => {
      setPhase('loading');
      setFailure(null);
      try {
        const next = await api.checkoutQuote(CHECKOUT_PLAN, which);
        if (!alive()) return;
        setQuote(next);
        // A quote that cannot be honoured is a state of its own: the CTA must
        // not exist on a screen whose price is not real.
        setPhase(next.available ? 'review' : 'unavailable');
      } catch (error) {
        if (!alive()) return;
        if (error instanceof ApiError && error.status === 401) {
          setPhase('signed-out');
          return;
        }
        // A failed quote never leaves a stale price on screen and never fills a
        // figure in locally: the customer retries, or we say why.
        setFailure(toCheckoutFailure(error));
        setPhase('failed');
      }
    },
    [alive]
  );

  // First load, and every deliberate interval change.
  useEffect(() => {
    if (!accessToken || !org) return;
    if (phase === 'success' || phase === 'verifying' || phase === 'paying') return;
    void loadQuote(interval);
    // `phase` is deliberately not a dependency: moving between review and paying
    // must not re-quote, or the number under the customer's finger could change
    // while they are paying.
  }, [accessToken, org, interval, loadQuote]);

  // ── Verification: the only path to "paid" ────────────────────────────────
  const verify = useCallback(
    async (reference: string) => {
      if (verifyingRef.current === reference) return;
      verifyingRef.current = reference;
      setPhase('verifying');
      setHandingOff(false);
      try {
        const result = await api.verifyTransaction(reference);
        if (!alive()) return;
        if (result.verified) {
          setVerified({
            reference: result.reference || reference,
            amount_display: result.amount_display,
            currency: result.currency,
            product_price_display: result.product_price_display,
            display_plan: result.display_plan,
            billing_interval: result.billing_interval,
            activated: result.activated,
            duplicate_payment: result.duplicate_payment,
          });
          setPhase('success');
          // Put the reference in the address bar. A confirmation the customer
          // cannot reload is a confirmation they cannot trust — and without it,
          // a refresh would land back on the review step, one click from paying
          // for a period they have already bought. `replaceState` rather than a
          // router navigation: this page must not re-render (or re-quote) as a
          // side effect of recording what already happened.
          if (typeof window !== 'undefined' && !searchParams.get('reference')) {
            const url = new URL(window.location.href);
            url.searchParams.set('plan', CHECKOUT_PLAN);
            url.searchParams.set('reference', result.reference || reference);
            url.searchParams.delete('status');
            url.searchParams.delete('pay_ref');
            window.history.replaceState(null, '', `${url.pathname}${url.search}`);
          }
          // Entitlement just changed server-side; drop the caches that still
          // describe the old plan.
          invalidateBilling(queryClient);
          return;
        }
        // `verified: false` is a real outcome the backend has already
        // classified (pending, declined, replayed, duplicate). Its slug picks
        // the state; its sentence replaces our default copy where it is better.
        const base = (result.reason && CHECKOUT_FAILURE_COPY[result.reason]) ||
          CHECKOUT_FAILURE_COPY.transaction_not_paid;
        setFailure({
          ...base,
          body: result.reason_message ?? base.body,
        });
        setPhase('failed');
      } catch (error) {
        if (!alive()) return;
        // Losing the session while confirming a payment must not look like the
        // payment failed. The reference is still in the URL, so signing back in
        // lands here and finishes the verification it started — the route into
        // the signed-out screen is deliberate, and it says so.
        if (error instanceof ApiError && error.status === 401) {
          setPhase('signed-out');
          return;
        }
        setFailure(toCheckoutFailure(error));
        setPhase('failed');
      } finally {
        verifyingRef.current = null;
      }
    },
    [alive, queryClient, searchParams]
  );

  // Returned from the provider with a reference? Finish the job.
  useEffect(() => {
    if (!accessToken || !org || resumedRef.current) return;
    const reference = searchParams.get('reference') || searchParams.get('pay_ref');
    if (!reference) return;
    resumedRef.current = true;
    // The address bar keeps the reference on purpose: reloading must re-verify
    // (the backend is idempotent per reference) rather than strand a paid
    // customer on an empty review screen.
    void verify(reference);
  }, [accessToken, org, searchParams, verify]);

  // ── Launch the payment experience ────────────────────────────────────────
  const continueToPayment = useCallback(async () => {
    if (!quote) return;
    setPhase('preparing');
    setFailure(null);
    let created: InitializePaymentResult;
    try {
      // The only inputs are the plan and the interval. Amount, currency and
      // channels are the backend's, from the same resolution that produced the
      // numbers this page is showing.
      created = await api.initializePayment(
        quote.plan,
        quote.billing_interval,
        'international_card',
        quote.price_token
      );
    } catch (error) {
      if (!alive()) return;
      if (error instanceof ApiError && error.status === 401) {
        setPhase('signed-out');
        return;
      }
      // A repricing while this page sat open is the one failure where the
      // figures on screen are known to be wrong, so the quote is discarded
      // rather than offered back for another attempt — retry has to re-price
      // before it can re-offer a CTA.
      if (error instanceof ApiError && error.reason === 'quote_stale') {
        setQuote(null);
      }
      setFailure(toCheckoutFailure(error));
      setPhase('failed');
      return;
    }
    if (!alive()) return;
    setSession(created);
    resumedRef.current = true;

    const scriptUrl = created.inline_js_url;
    if (created.inline_js_enabled && created.public_key && created.access_code && scriptUrl) {
      const launched = await launchPaystackTransaction({
        scriptUrl,
        accessCode: created.access_code,
        callbacks: {
          onSuccess: (response) => {
            // Not proof of payment — a prompt to ask the backend. Entitlement
            // is decided by verification, never by this callback.
            void verify(response.reference || created.reference);
          },
          onCancel: () => {
            if (!alive()) return;
            setFailure(fromProviderCallback('cancel'));
            setPhase('failed');
          },
          onError: (error) => {
            if (!alive()) return;
            setFailure(fromProviderCallback('error', error?.message));
            setPhase('failed');
          },
        },
      });
      if (launched) {
        if (alive()) setPhase('paying');
        return;
      }
      // InlineJS could not load (network policy, extension, offline). The hosted
      // page is the same server-priced transaction, so nobody is stuck.
    }

    if (!alive() || !created.authorization_url) {
      if (alive()) {
        setFailure(CHECKOUT_FAILURE_COPY.paystack_unavailable);
        setPhase('failed');
      }
      return;
    }
    setHandingOff(true);
    // A plain navigation, not a router push: this is a cross-origin hand-off to
    // the payment provider and the router has no business unmounting mid-flight.
    window.location.assign(created.authorization_url);
  }, [quote, alive, verify]);

  const retry = useCallback(() => {
    setFailure(null);
    setSession(null);
    setHandingOff(false);
    if (quote?.available) {
      setPhase('review');
      return;
    }
    void loadQuote(interval);
  }, [quote, interval, loadQuote]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (phase === 'signed-out') {
    return <SignedOutPrompt interval={interval} />;
  }

  if (phase === 'unavailable' && quote) {
    return <CheckoutUnavailable quote={quote} />;
  }

  if (phase === 'failed') {
    return (
      <CheckoutFailure
        failure={failure ?? CHECKOUT_FAILURE_COPY.network_interrupted}
        quote={quote}
        session={session}
        onRetry={retry}
        onRefresh={() => void loadQuote(interval)}
      />
    );
  }

  if (phase === 'success') {
    return <PaymentConfirmation verified={verified} quote={quote} />;
  }

  if (phase === 'restoring' || phase === 'loading' || !quote) {
    return <CheckoutSkeleton />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_384px] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0 space-y-5">
        <OrderSummary
          quote={quote}
          interval={interval}
          onIntervalChange={(next) => {
            if (next === interval) return;
            setIntervalState(next);
          }}
        />
      </div>

      <PaymentMethodPanel
        quote={quote}
        phase={phase}
        handingOff={handingOff}
        session={session}
        onContinue={continueToPayment}
      />
    </div>
  );
}
