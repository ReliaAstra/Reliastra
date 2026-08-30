/**
 * Checkout failure states — RELIASTRA's wording, keyed by the backend's reason
 * slug.
 *
 * Why a table instead of showing `error.message`: the customer must never be
 * handed a provider's internal error text. "Amount must be greater than 100" or
 * "Invalid Authorization token" is not an explanation, and it exposes an
 * integration they never agreed to debug. So every failure the checkout can land
 * in has:
 *
 *   - a plain title stating what happened,
 *   - a sentence saying what it means for the money, and
 *   - the concrete next action.
 *
 * The slugs mirror `backend/app/core/checkout_reasons.py` (CheckoutReason);
 * `backend/tests/unit/test_checkout_failure_reasons.py` diffs the two lists,
 * because an unknown slug silently degrades into a generic error — precisely the
 * failure mode this table exists to remove.
 *
 * The distinction that drives the design is *has money moved?*. `cancelled` and
 * `card_declined` mean nothing was charged and a retry is cheap.
 * `verification_unavailable` means the customer may well have paid and must be
 * told to wait, not to pay again. Rendering those two identically is how a
 * company ends up double-charging somebody.
 */

import { ApiError } from '@/lib/dashboard/api';

export type CheckoutOutcomeTone = 'neutral' | 'attention' | 'problem';

export interface CheckoutFailureCopy {
  title: string;
  /** What it means for the customer's money. */
  body: string;
  /** The single next action. */
  action: string;
  tone: CheckoutOutcomeTone;
  /** Show "try again" — the same click is safe and meaningful. */
  retry: boolean;
  /** Offer support contact, because the customer may need a human. */
  support: boolean;
}

export const CHECKOUT_FAILURE_COPY: Record<string, CheckoutFailureCopy> = {
  card_declined: {
    title: 'Your card was declined',
    body: 'Nothing was charged. Your bank declined the payment, which is usually a limit, an address mismatch or a card that is not enabled for online transactions.',
    action: 'Try a different card, or contact your bank and retry.',
    tone: 'attention',
    retry: true,
    support: false,
  },
  authentication_required: {
    title: 'Authentication needed',
    body: 'Your bank asked you to confirm this payment (3-D Secure) and it was not completed. No charge was finalized.',
    action: 'Retry and complete the verification step your bank shows.',
    tone: 'attention',
    retry: true,
    support: false,
  },
  payment_cancelled: {
    title: 'Payment cancelled',
    body: 'You closed the payment window before it completed, so nothing was charged. Your plan is unchanged.',
    action: 'Continue when you are ready — the amount stays exactly as shown here.',
    tone: 'neutral',
    retry: true,
    support: false,
  },
  paystack_unavailable: {
    title: 'Payment service unavailable',
    body: 'We could not reach our payment provider, so no payment was started and nothing was charged.',
    action: 'Please try again in a moment.',
    tone: 'problem',
    retry: true,
    support: true,
  },
  verification_unavailable: {
    title: 'Confirming your payment',
    body: 'We could not reach the payment provider to confirm your payment yet. If you completed the charge, it is not lost — every payment is verified automatically.',
    action: 'Please wait a few minutes and refresh this page. Do not pay again.',
    tone: 'attention',
    retry: false,
    support: true,
  },
  transaction_not_found: {
    title: 'We cannot find that payment',
    body: 'That reference does not match a payment on our account. If you were charged, we can find it with the reference below.',
    action: 'Check the reference, or send it to billing@reliastra.com.',
    tone: 'problem',
    retry: true,
    support: true,
  },
  transaction_not_paid: {
    title: 'Payment not received yet',
    body: 'We have not received this payment. It may still be settling with your bank.',
    action: 'We will activate your plan automatically once it clears.',
    tone: 'attention',
    retry: false,
    support: true,
  },
  payment_pending: {
    title: 'Payment is processing',
    body: 'Your bank is still finalizing this payment. Nothing further is needed from you right now.',
    action: 'We will activate your plan as soon as it settles — check back shortly.',
    tone: 'neutral',
    retry: false,
    support: false,
  },
  payment_replayed: {
    title: 'Already applied',
    body: 'This payment has already been applied to your subscription, so we did not apply it twice.',
    action: 'View your billing history to see the charge.',
    tone: 'neutral',
    retry: false,
    support: false,
  },
  duplicate_payment: {
    title: 'We received a second payment',
    body: 'This period was already covered, so the additional payment has been recorded and applied rather than ignored. You will see both charges in your billing history.',
    action: 'Contact billing@reliastra.com if you would prefer a refund of the extra payment.',
    tone: 'attention',
    retry: false,
    support: true,
  },
  amount_below_plan_price: {
    title: 'Payment does not cover this plan',
    body: 'The amount collected is less than the published price for this plan, so we have not activated it automatically.',
    action: 'Contact billing@reliastra.com and we will reconcile it for you.',
    tone: 'problem',
    retry: false,
    support: true,
  },
  currency_mismatch: {
    title: 'Payment currency mismatch',
    body: 'This payment was collected in a different currency from the one RELIASTRA bills this plan in, so we have not applied it automatically.',
    action: 'Contact billing@reliastra.com and we will sort it out.',
    tone: 'problem',
    retry: false,
    support: true,
  },
  organization_mismatch: {
    title: 'We could not match this payment',
    body: 'This payment cannot be tied to your RELIASTRA workspace automatically.',
    action: 'Send the reference to billing@reliastra.com and we will apply it to the right account.',
    tone: 'problem',
    retry: false,
    support: true,
  },
  payment_channel_not_supported: {
    title: 'Unsupported payment method for this plan',
    body: 'This payment came back through a method RELIASTRA’s global checkout does not use, so it has not been applied automatically.',
    action: 'Contact billing@reliastra.com and we will reconcile it.',
    tone: 'problem',
    retry: false,
    support: true,
  },
  price_not_configured: {
    title: 'Online checkout is being finalized',
    body: 'Our price for this plan in your payment currency is being confirmed, so we are not taking payment here rather than quote you a figure we have not published.',
    action: 'Contact billing@reliastra.com and we will set up your subscription directly.',
    tone: 'attention',
    retry: false,
    support: true,
  },
  plan_not_self_serve: {
    title: 'This plan is set up with our team',
    body: 'Enterprise agreements are scoped and priced with us rather than through self-serve checkout.',
    action: 'Talk to sales and we will have it running for you.',
    tone: 'neutral',
    retry: false,
    support: true,
  },
  payment_method_unavailable: {
    title: 'Payment method unavailable',
    body: 'That method is not enabled for this checkout, so no payment was started.',
    action: 'Continue with an international card instead.',
    tone: 'attention',
    retry: true,
    support: false,
  },
  session_expired: {
    title: 'Your session expired',
    body:
      'You are no longer signed in, so this step could not be completed. Nothing on your account has changed — and if you had already paid, your payment is not lost: signing back in confirms it and applies it.',
    action: 'Sign in again and return to checkout — the amount will be exactly as shown here.',
    tone: 'attention',
    retry: false,
    // Deliberately not "try again": the same click fails the same way until the
    // session is restored, and a retry that re-sends a payment is the one
    // mistake a checkout must never make.
    support: true,
  },
  quote_stale: {
    title: 'Price updated',
    body: 'The price shown on this page is no longer the one our system has, so we stopped before charging.',
    action: 'Refresh to see the current price, then continue.',
    tone: 'attention',
    retry: true,
    support: false,
  },
  network_interrupted: {
    title: 'Connection interrupted',
    body: 'We lost the connection to RELIASTRA mid-checkout. We cannot tell from here whether your payment completed.',
    action: 'Reload this page — if you paid, your plan will activate; otherwise you can try again.',
    tone: 'attention',
    retry: false,
    support: false,
  },
};

const GENERIC_FAILURE: CheckoutFailureCopy = {
  title: 'We could not complete the payment',
  body: 'Nothing was changed on your account. If you were charged, we will match it automatically.',
  action: 'Try again, or contact billing@reliastra.com.',
  tone: 'problem',
  retry: true,
  support: true,
};

/** Every slug the UI has copy for — asserted against the backend's registry. */
export const CHECKOUT_FAILURE_REASONS = Object.keys(CHECKOUT_FAILURE_COPY);

export function failureCopyFor(reason?: string | null): CheckoutFailureCopy {
  if (!reason) return GENERIC_FAILURE;
  return CHECKOUT_FAILURE_COPY[reason] ?? GENERIC_FAILURE;
}

/**
 * Normalize anything the checkout catches into displayable copy.
 *
 * A 401 is treated as a session expiry wherever it comes from — including the
 * shared API client, which raises its own sentence for it — because the correct
 * action ("sign in again, the amount will not change") is not the generic one.
 * A transport failure (fetch rejecting, no HTTP status at all) is reported as an
 * interruption rather than a refusal, since the customer's payment may have
 * completed while the browser was offline.
 */
export function toCheckoutFailure(error: unknown): CheckoutFailureCopy {
  if (error instanceof ApiError) {
    if (error.status === 401) return CHECKOUT_FAILURE_COPY.session_expired;
    return failureCopyFor(error.reason);
  }
  if (error instanceof Error && /session has expired/i.test(error.message)) {
    return CHECKOUT_FAILURE_COPY.session_expired;
  }
  return CHECKOUT_FAILURE_COPY.network_interrupted ?? GENERIC_FAILURE;
}

/**
 * The failure a *provider callback* reported, translated into our vocabulary.
 *
 * InlineJS hands back `{ message }` from Paystack. It is logged, never shown:
 * the customer gets one of our states. The only signal worth extracting is
 * whether the flow was cancelled versus errored, because those are different
 * truths about the money.
 */
export function fromProviderCallback(
  kind: 'cancel' | 'error',
  providerMessage?: string
): CheckoutFailureCopy & { detail?: string } {
  if (kind === 'cancel') {
    return CHECKOUT_FAILURE_COPY.payment_cancelled;
  }
  // "Declined" is the one case where the provider's words carry a fact the
  // customer can act on; it is matched rather than displayed.
  if (/declin|insufficient|do not honour|not authorised/i.test(providerMessage ?? '')) {
    return CHECKOUT_FAILURE_COPY.card_declined;
  }
  if (/3-?d|secure|authentication|verify/i.test(providerMessage ?? '')) {
    return CHECKOUT_FAILURE_COPY.authentication_required;
  }
  return CHECKOUT_FAILURE_COPY.paystack_unavailable;
}
