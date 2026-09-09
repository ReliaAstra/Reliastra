/**
 * Partner referral identity: codes, cookies, destinations.
 *
 * Canonical public URL: `https://reliastra.com/r/{code}` (see
 * `settings.partner_referral_base_url` / `PARTNER_REFERRAL_PATH_PREFIX`).
 *
 * Two first-party cookies carry the same code for 90 days (the attribution
 * window in the partner terms):
 *
 *   - `ra_ref`      HttpOnly, set only by the `/r/{code}` resolver. Source of
 *                   truth at signup: the register proxy replays it as `ref_code`.
 *   - `ra_ref_pub`  Readable by the page so signup/landing can show “referred
 *                   by”. Not a secret — the code was in the URL.
 *
 * Failure isolation: every helper here is total. A malformed code, a missing
 * cookie or a private-mode storage failure returns null and never throws.
 */

export const REFERRAL_COOKIE = 'ra_ref';
export const REFERRAL_PUBLIC_COOKIE = 'ra_ref_pub';

/** 90 days, matching the partner-program attribution window. */
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

export const REFERRAL_UNAVAILABLE_PATH = '/referral-unavailable';

/** Default landing after a valid `/r/{code}` click. */
export const REFERRAL_DEFAULT_DESTINATION = '/';

/**
 * Partner (and PLG) codes look like `ADES-SC9C`: 4-char prefix, hyphen,
 * 4-char fragment. Accept a slightly wider well-formed set so a future
 * generator change does not 404 real links, but reject anything that could
 * be a path traversal or an open-redirect payload.
 */
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,30}[A-Z0-9]$/;

export function normalizeReferralCode(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  let value = String(raw).trim();
  try {
    value = decodeURIComponent(value).trim();
  } catch {
    /* already decoded, or not URI-encoded */
  }
  value = value.toUpperCase();
  if (value.length < 4 || value.length > 32) return null;
  if (value.includes('--') || value.includes('..')) return null;
  if (!CODE_RE.test(value)) return null;
  return value;
}

export function isWellFormedReferralCode(
  raw: string | null | undefined
): raw is string {
  return normalizeReferralCode(raw) !== null;
}

/**
 * Relative destination only. A crafted `to` cannot become an open redirect.
 * Mirrors `app.modules.partners.public_router._safe_destination`.
 */
export function safeReferralDestination(
  to: string | null | undefined,
  fallback: string = REFERRAL_DEFAULT_DESTINATION
): string {
  if (!to) return fallback;
  const value = to.trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('://')) {
    return fallback;
  }
  if (value.includes('\\') || value.includes('\0')) return fallback;
  return value;
}

export function readCookieFromHeader(
  header: string | null | undefined,
  name: string
): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== name) continue;
    try {
      return decodeURIComponent(trimmed.slice(eq + 1));
    } catch {
      return trimmed.slice(eq + 1);
    }
  }
  return null;
}

/**
 * Prefer the HttpOnly attribution cookie, then the public display cookie.
 * Either is enough for the register proxy to replay `ref_code`.
 */
export function readReferralCodeFromCookieHeader(
  header: string | null | undefined
): string | null {
  const httpOnly = normalizeReferralCode(
    readCookieFromHeader(header, REFERRAL_COOKIE)
  );
  if (httpOnly) return httpOnly;
  return normalizeReferralCode(
    readCookieFromHeader(header, REFERRAL_PUBLIC_COOKIE)
  );
}

/**
 * Merge a captured referral code into a register payload. Never overwrites a
 * well-formed `ref_code` the client already sent. Never throws.
 */
export function applyReferralToRegisterPayload(
  body: unknown,
  cookieHeader: string | null | undefined
): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const payload = body as Record<string, unknown>;
  const existing = normalizeReferralCode(
    typeof payload.ref_code === 'string' ? payload.ref_code : null
  );
  if (existing) {
    return { ...payload, ref_code: existing };
  }
  const fromCookie = readReferralCodeFromCookieHeader(cookieHeader);
  if (!fromCookie) return payload;
  return { ...payload, ref_code: fromCookie };
}

export function referralCookieAttrs(secure: boolean): {
  path: '/';
  maxAge: number;
  sameSite: 'lax';
  secure: boolean;
} {
  return {
    path: '/',
    maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
    secure,
  };
}

/** Client-side: persist the display cookie (cannot set HttpOnly). */
export function persistPublicReferralCookie(code: string): void {
  if (typeof document === 'undefined') return;
  const normalized = normalizeReferralCode(code);
  if (!normalized) return;
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:';
  const expires = new Date(
    Date.now() + REFERRAL_COOKIE_MAX_AGE_SECONDS * 1000
  ).toUTCString();
  const attrs = `Path=/; Expires=${expires}; SameSite=Lax${secure ? '; Secure' : ''}`;
  document.cookie = `${REFERRAL_PUBLIC_COOKIE}=${encodeURIComponent(normalized)}; ${attrs}`;
}

/** Client-side: read the display cookie (or a leftover non-HttpOnly `ra_ref`). */
export function getStoredReferralCode(): string | null {
  if (typeof document === 'undefined') return null;
  return readReferralCodeFromCookieHeader(document.cookie);
}

export function getReferralCodeFromSearch(search: string): string | null {
  try {
    const params = new URLSearchParams(
      search.startsWith('?') ? search.slice(1) : search
    );
    return normalizeReferralCode(params.get('ref'));
  } catch {
    return null;
  }
}

export function backendApiOrigin(): string {
  return (
    process.env.RELIASTRA_API_URL?.replace(/\/$/, '') ||
    'https://api.reliastra.com'
  );
}
