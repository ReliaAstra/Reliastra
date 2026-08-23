/**
 * First-party acquisition attribution (FIRST TOUCH).
 *
 * Capture: when a visitor lands with UTM parameters, the touch is stored
 * WRITE-ONCE in localStorage (`reliastra_first_touch_v1`). Later visits
 * refresh only `reliastra_last_touch_v1`. At signup both are attached to
 * the register payload; the backend enforces immutability server-side too.
 *
 * Privacy: first-party, campaign strings only. Landing path is stored
 * without its query string; referrer is reduced to hostname. No cookies,
 * no third parties, no PII.
 *
 * Failure isolation: every function here is try/catch-wrapped - if storage
 * or parsing fails, the site works and signup proceeds without attribution.
 */

const FIRST_TOUCH_KEY = 'reliastra_first_touch_v1';
const LAST_TOUCH_KEY = 'reliastra_last_touch_v1';

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

export interface AttributionTouch {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  landing_path?: string;
  referrer_host?: string;
}

function safeGet(storage: Storage | undefined, key: string): AttributionTouch | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AttributionTouch;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function safeSet(storage: Storage | undefined, key: string, value: AttributionTouch): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Quota/private mode: attribution is best-effort by design.
  }
}

function referrerHost(): string | undefined {
  try {
    const raw = document.referrer;
    if (!raw) return undefined;
    const host = new URL(raw).hostname.toLowerCase();
    if (!host || host === window.location.hostname) return undefined; // self-referrer = direct
    return host;
  } catch {
    return undefined;
  }
}

/** Read UTMs (+ landing path + referrer host) from the current location. */
export function observeTouch(search: string, pathname: string): AttributionTouch | null {
  try {
    const params = new URLSearchParams(search);
    const touch: AttributionTouch = {};
    let sawUtm = false;
    for (const key of UTM_KEYS) {
      const value = params.get(key)?.trim().slice(0, 300); // hard client-side clamp
      if (value) {
        touch[key.slice(4)] = value; // strip "utm_" prefix -> snake_case field
        sawUtm = true;
      }
    }
    if (!sawUtm && !referrerHost()) return null; // nothing observable
    touch.landing_path = pathname.slice(0, 300) || '/';
    const host = referrerHost();
    if (host) touch.referrer_host = host;
    return touch;
  } catch {
    return null;
  }
}

/**
 * Call once per full page load (root-layout mount).
 * First touch is write-once; every load refreshes the last-touch mirror.
 */
export function captureAttribution(search: string, pathname: string): void {
  if (typeof window === 'undefined') return;
  const observed = observeTouch(search, pathname);
  if (!observed) return;

  if (typeof localStorage !== 'undefined' && !safeGet(localStorage, FIRST_TOUCH_KEY)) {
    // FIRST TOUCH: write exactly once. A Day-10 Google visit must never
    // overwrite a Day-1 YouTube capture.
    safeSet(localStorage, FIRST_TOUCH_KEY, observed);
  }
  if (typeof sessionStorage !== 'undefined') {
    safeSet(sessionStorage, LAST_TOUCH_KEY, observed);
  } else {
    safeSet(localStorage, LAST_TOUCH_KEY, observed);
  }
}

/**
 * Payload for POST /v1/auth/register. Returns undefined when there is
 * nothing recorded so the request body stays unchanged for direct signups.
 */
export function getSignupAttribution():
  | { first: AttributionTouch; last?: AttributionTouch }
  | undefined {
  try {
    const first =
      typeof localStorage !== 'undefined'
        ? safeGet(localStorage, FIRST_TOUCH_KEY)
        : null;
    if (!first) return undefined;
    const last =
      typeof sessionStorage !== 'undefined'
        ? safeGet(sessionStorage, LAST_TOUCH_KEY)
        : safeGet(localStorage, LAST_TOUCH_KEY);
    return { first, last: last ?? undefined };
  } catch {
    return undefined;
  }
}
