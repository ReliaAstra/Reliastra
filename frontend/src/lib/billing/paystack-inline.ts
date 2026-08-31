/**
 * Paystack InlineJS — the provider's secure payment experience, launched from
 * inside RELIASTRA's checkout page.
 *
 * What this is for: the transaction is created by RELIASTRA's backend with the
 * secret key, and the browser receives only the *publishable* key and the
 * returned access code. Passing that access code to `resumeTransaction` opens
 * Paystack's own payment UI over our page, so the customer stays inside the
 * RELIASTRA checkout instead of being dropped onto a standalone payment page
 * and losing the context (their plan, their amount, their currency) that makes
 * the charge understandable. They see our screen; Paystack sees the card.
 *
 * What this is explicitly NOT: a card form. RELIASTRA never collects a card
 * number, expiry or CVC — not here, not anywhere. Paystack's own Cards API is
 * gated on the merchant holding PCI-DSS attestation (an Attestation of
 * Compliance issued by a QSA), which RELIASTRA does not, so "custom checkout"
 * here means *our* surrounding experience with *their* payment surface. The
 * asymmetry is deliberate: we own pricing, transparency and state; the
 * processor owns card data.
 *
 * Failure posture: if the script cannot be loaded (blocked by a network
 * policy, an offline laptop, an ad blocker), this reports "unavailable" and
 * the caller falls back to the hosted `authorization_url` redirect. A customer
 * must always have a working path to pay, and a blocked third-party script is
 * their environment's constraint — not a reason to lose the sale.
 */

/** Callbacks Paystack invokes on the transaction it is handling. */
export interface PaystackTransactionCallbacks {
  /** Customer finished successfully. Verify the reference server-side. */
  onSuccess?: (response: { reference: string; id?: number; message?: string }) => void;
  /** The checkout UI opened (not a payment event — never activate on this). */
  onLoad?: (response: { id: number; accessCode: string }) => void;
  /** The customer closed the payment window. */
  onCancel?: () => void;
  /** The provider errored. Its message is for logs; the UI maps it to state. */
  onError?: (error: { message?: string }) => void;
}

interface PaystackPopInstance {
  resumeTransaction: (
    accessCode: string,
    callbacks?: PaystackTransactionCallbacks
  ) => void;
  checkout?: (options: {
    accessCode: string;
    onSuccess?: PaystackTransactionCallbacks['onSuccess'];
    onCancel?: PaystackTransactionCallbacks['onCancel'];
    onLoad?: PaystackTransactionCallbacks['onLoad'];
    onError?: PaystackTransactionCallbacks['onError'];
  }) => void;
  newTransaction?: (
    options: PaystackTransactionCallbacks & {
      key: string;
      email: string;
      amount: number;
      currency?: string;
      reference?: string;
      channels?: string[];
      metadata?: Record<string, unknown>;
    }
  ) => void;
}

type PaystackConstructor = new () => PaystackPopInstance;

declare global {
  interface Window {
    PaystackPop?: PaystackConstructor;
  }
}

/** In-flight or completed loads, so a re-render never injects the script twice. */
const loading = new Map<string, Promise<PaystackConstructor | null>>();

/**
 * Inject Paystack's InlineJS once and return its constructor.
 *
 * Resolves to `null` rather than rejecting: every caller's correct response to
 * "the provider script is not available" is the same (fall back to the hosted
 * redirect), and a rejected promise in a payment path is a promise someone
 * forgets to catch. A 10s timeout covers a hung CDN better than waiting for a
 * browser that will never fire `load`.
 */
export function loadPaystackInline(scriptUrl: string): Promise<PaystackConstructor | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const existing = loading.get(scriptUrl);
  if (existing) return existing;

  const promise = new Promise<PaystackConstructor | null>((resolve) => {
    if (window.PaystackPop) {
      resolve(window.PaystackPop);
      return;
    }
    const id = 'reliastra-paystack-inline';
    let script = document.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = id;
      script.src = scriptUrl;
      script.async = true;
      // Paystack serves InlineJS without SRI pins and ships it under a rolling
      // filename, so there is no hash to assert here; the URL is HTTPS and is
      // supplied by our own backend rather than by page input.
      document.head.appendChild(script);
    }
    let settled = false;
    const doResolve = (value: PaystackConstructor | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const onError = () => {
      // P2 fix: evict failed load so a later retry (after ad-blocker disabled
      // or network recovers) can inject again instead of returning cached null
      // forever.
      loading.delete(scriptUrl);
      // Timeout and error both resolve null; the caller falls back and the
      // customer still gets a way to pay.
      window.setTimeout(() => doResolve(null), 0);
    };
    const onLoad = () => {
      const ctor = window.PaystackPop ?? null;
      if (!ctor) {
        // Script loaded but global not present — treat as failure and evict
        // so a provider-side change can be retried.
        loading.delete(scriptUrl);
      }
      doResolve(ctor);
    };
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    window.setTimeout(() => {
      if (!window.PaystackPop) {
        loading.delete(scriptUrl);
      }
      doResolve(window.PaystackPop ?? null);
    }, 10_000);
  });

  loading.set(scriptUrl, promise);
  return promise;
}

/**
 * Open Paystack's payment experience for an already-initialized transaction.
 *
 * Returns `true` when the popup was launched and `false` when the caller must
 * fall back to a redirect. `resumeTransaction` is used rather than
 * `newTransaction` because the transaction — amount, currency, channels —
 * already exists and was decided server-side; re-supplying those numbers in the
 * browser would hand the client exactly the pricing authority the whole
 * checkout is built to deny it.
 */
export async function launchPaystackTransaction(
  options: {
    scriptUrl: string;
    accessCode: string;
    callbacks: PaystackTransactionCallbacks;
  }
): Promise<boolean> {
  const PaystackPop = await loadPaystackInline(options.scriptUrl);
  if (!PaystackPop) return false;
  try {
    const popup = new PaystackPop();
    // V2 (https://js.paystack.co/v2/inline.js) prefers checkout({accessCode});
    // V1 used resumeTransaction(accessCode). Support both so the migration is
    // safe and wallets (Apple Pay paymentRequest) keep working.
    const anyPopup = popup as unknown as {
      checkout?: (opts: { accessCode: string } & PaystackTransactionCallbacks) => unknown;
      resumeTransaction?: (code: string, cb?: PaystackTransactionCallbacks) => unknown;
    };
    if (typeof anyPopup.checkout === 'function') {
      anyPopup.checkout({ accessCode: options.accessCode, ...options.callbacks });
    } else {
      popup.resumeTransaction(options.accessCode, options.callbacks);
    }
    return true;
  } catch {
    // A constructor that throws is an unknown provider-side change; the safe
    // answer is the hosted page, not a dead button.
    return false;
  }
}
