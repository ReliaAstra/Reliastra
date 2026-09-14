/**
 * Which page views the traffic analytics are allowed to see.
 *
 * The admin "Pageviews" counter is an acquisition metric. It answers "how many
 * people came to look at RELIASTRA", and every derived number in that panel -
 * unique visitors, signup conversion, country mix - inherits whatever goes
 * into it. The person who owns the product is the single most prolific
 * non-customer visitor on the site: they open the landing page to check a
 * deploy, live-reload the dashboard twenty times, and click through the admin
 * panel while answering a ticket. So the beacon has to know the difference
 * between marketing traffic and the product being used by the people who build
 * it.
 *
 * Three rules, all evaluated client-side where possible so the request is
 * never even made:
 *
 *  1. Internal surfaces never report. The console, the admin panel, the client
 *     portal and the partner workspace are product usage, not page views.
 *  2. Non-production hostnames never report: localhost, tunnel hosts and
 *     preview deployments are not visitors.
 *  3. An opted-out browser never reports, and it says so through a cookie the
 *     proxy can see, so the exclusion also holds for requests the beacon does
 *     not control (see `analytics-gate.ts`).
 *
 * The backend repeats rules 1 (for `/admin`) and 3 and adds IP/CIDR
 * exclusion - see `backend/app/modules/analytics/exclusions.py`. Deliberate
 * duplication: the frontend filter is what stops the request, the backend
 * filter is what makes the guarantee true for anything that bypasses it.
 */

/** Cookie the browser sets to exclude itself, read by the Next proxy. */
export const ANALYTICS_OPT_OUT_COOKIE = 'reliastra_analytics_optout';

/** Header the proxy forwards that cookie through as (raw Cookies are not). */
export const ANALYTICS_OPT_OUT_HEADER = 'x-reliastra-analytics-opt-out';

/** Survives the cookie being cleared; the cookie survives the storage sweep. */
export const ANALYTICS_OPT_OUT_STORAGE_KEY = 'reliastra:analytics-optout';

/** Fired on window when the preference changes, so open tabs agree. */
export const ANALYTICS_OPT_OUT_EVENT = 'reliastra:analytics-optout-changed';

/**
 * Authenticated product surfaces. These are excluded as *surfaces*, not as
 * secrets: `/support` and `/portal` stay excluded because a customer using the
 * product is not a marketing page view.
 *
 * Matching is segment-exact, so `/agency` (console) never swallows `/agencies`
 * (the public marketing page) and `/admin` never swallows a slug that merely
 * starts with it.
 */
export const INTERNAL_PATH_PREFIXES: readonly string[] = [
  // Control plane.
  '/admin',
  // Customer console - the `(console)` route group has no URL segment.
  '/dashboard',
  '/dependencies',
  '/incidents',
  '/evidence',
  '/reports',
  '/clients',
  '/billing',
  '/settings',
  '/support',
  '/onboarding',
  '/agency',
  // Read-only customer surfaces reached by link, not by acquisition.
  '/portal',
  '/partner/dashboard',
];

/**
 * Public funnel pages that are intentionally still counted: `/login`,
 * `/signup`, `/verify-email`, `/reset-password` and `/checkout` are where
 * acquisition turns into a customer, so they belong in the denominator.
 */

function pathnameOf(pathname: string): string {
  const clean = pathname.split('?')[0]?.split('#')[0] ?? '';
  return clean.startsWith('/') ? clean : `/${clean}`;
}

export function isInternalSurfacePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathnameOf(pathname);
  return INTERNAL_PATH_PREFIXES.some((prefix) => {
    const clean = prefix.replace(/\/+$/, '');
    return path === clean || path.startsWith(`${clean}/`);
  });
}

/** Dev, tunnel and preview hosts: never a visitor, never a page view. */
export function isNonProductionHostname(hostname: string | null | undefined): boolean {
  if (!hostname) return true;
  const host = hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.invalid')
  ) {
    return true;
  }
  // Raw-address access is a container, a tunnel or a probe. Only the
  // non-routable ranges are dropped, because a one-off VPS reachable by IP
  // still has real visitors and must not silently stop counting them.
  const rawV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (rawV4) {
    const [a, b] = [Number(rawV4[1]), Number(rawV4[2])];
    return a === 127 || a === 10 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
  }
  // Arena/preview deployments and the usual tunnels.
  return (
    host.endsWith('.e2b.app') ||
    host.endsWith('.e2b.dev') ||
    host.endsWith('.e2b-preview.com') ||
    host.endsWith('.ngrok-free.app') ||
    host.endsWith('.ngrok.app') ||
    host.endsWith('.trycloudflare.com')
  );
}

/** Whether a report from this path on this host should be counted at all. */
export function shouldTrackVisit(pathname: string, hostname?: string | null): boolean {
  if (hostname !== undefined && isNonProductionHostname(hostname)) return false;
  return !isInternalSurfacePath(pathname);
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const needle = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const entry = part.trim();
    if (entry.startsWith(needle)) return decodeURIComponent(entry.slice(needle.length));
  }
  return null;
}

function writeCookie(name: string, value: string | null): void {
  if (typeof document === 'undefined') return;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:';
  // SameSite=None+Secure on HTTPS so the marker survives an app embedded in a
  // preview frame; Lax is enough on http://localhost and is what the browser
  // accepts there (Secure cookies cannot be set over plain http).
  const site = secure ? 'SameSite=None; Secure' : 'SameSite=Lax';
  document.cookie = value === null
    ? `${name}=; path=/; Max-Age=0; ${site}`
    : `${name}=${encodeURIComponent(value)}; path=/; Max-Age=31536000; ${site}`;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** True when this browser has excluded itself from traffic analytics. */
export function isAnalyticsOptedOut(): boolean {
  const fromCookie = readCookie(ANALYTICS_OPT_OUT_COOKIE);
  if (fromCookie !== null) return fromCookie === '1';
  const store = storage();
  if (!store) return false;
  try {
    return store.getItem(ANALYTICS_OPT_OUT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Persist the preference in both stores: the cookie is what the server sees on
 * the next beacon, localStorage is what survives a cookie sweep and what the
 * beacon checks before it spends a request.
 */
export function setAnalyticsOptOut(enabled: boolean): void {
  writeCookie(ANALYTICS_OPT_OUT_COOKIE, enabled ? '1' : null);
  const store = storage();
  try {
    if (enabled) store?.setItem(ANALYTICS_OPT_OUT_STORAGE_KEY, '1');
    else store?.removeItem(ANALYTICS_OPT_OUT_STORAGE_KEY);
  } catch {
    // Storage disabled (private mode): the cookie alone still works.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ANALYTICS_OPT_OUT_EVENT, { detail: { enabled } }));
  }
}
