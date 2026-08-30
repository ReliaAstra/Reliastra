'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { CHECKOUT_FAILURE_COPY } from '@/lib/billing/checkout-errors';

/**
 * Sign-in, without losing the checkout.
 *
 * A customer who reached checkout — perhaps from a link in an email, perhaps
 * after a session timeout while paying — is shown the way in with their intent
 * preserved in the return URL. Redirecting them to a bare login page with no
 * context is how checkouts are abandoned; the amount they were about to pay
 * should still be on screen when they come back.
 *
 * The URL is carried through verbatim rather than rebuilt, because the
 * reference we verify against lives there: dropping it would send a customer
 * who has already paid back to an empty review screen, which is how a paid
 * plan ends up looking like a failed one.
 */
export function SignedOutPrompt({ interval }: { interval: 'monthly' | 'annual' }) {
  const searchParams = useSearchParams();
  const reference =
    searchParams.get('reference') || searchParams.get('pay_ref') || null;
  const query = searchParams.toString();
  const next = encodeURIComponent(
    query ? `/checkout?${query}` : `/checkout?plan=pro&interval=${interval}`
  );

  // A payment in flight is a different truth from a page that was never
  // started: here we cannot say "nothing was charged", because we do not know
  // that yet — only verification does. So the session-expiry wording, which is
  // written to be accurate in both directions, is used instead.
  const copy = reference ? CHECKOUT_FAILURE_COPY.session_expired : null;

  return (
    <section
      aria-labelledby="checkout-signin-heading"
      className="mx-auto max-w-[520px]"
      data-testid="checkout-signed-out"
    >
      <div className="rounded-2xl border border-rs-border-subtle bg-rs-elevated px-5 py-6 text-center sm:px-6 sm:py-7">
        {copy ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-rs-degraded-bg px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-rs-degraded">
            Payment being confirmed
          </span>
        ) : null}
        <h2
          id="checkout-signin-heading"
          className="mt-3 text-[19px] font-semibold tracking-tight text-rs-text"
        >
          {copy ? copy.title : 'Sign in to continue'}
        </h2>
        <p className="mx-auto mt-2 max-w-[42ch] text-[13.5px] leading-relaxed text-rs-text-secondary">
          {copy
            ? copy.body
            : 'Checkout is tied to your RELIASTRA workspace, so the plan and the exact amount are confirmed against your account. Nothing has been charged.'}
        </p>
        {reference ? (
          <p className="mx-auto mt-2 max-w-[44ch] font-mono text-[11.5px] text-rs-text-tertiary">
            Payment reference {reference}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href={`/login?next=${next}`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-rs-brand px-5 text-[13.5px] font-semibold text-white transition-colors hover:bg-rs-brand-hover"
          >
            {copy ? 'Sign in to confirm' : 'Sign in'}
          </Link>
          <Link
            href="/signup"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-rs-border px-5 text-[13.5px] font-semibold text-rs-text transition-colors hover:bg-rs-hover"
          >
            Create an account
          </Link>
        </div>
      </div>
    </section>
  );
}
