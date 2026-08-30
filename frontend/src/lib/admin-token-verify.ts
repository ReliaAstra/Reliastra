import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Server-side verification of the ADMIN-console JWT family.
 *
 * The admin token is a standard HS256 JWT minted by the backend:
 *
 *   header:  { alg: "HS256", typ: "JWT" }
 *   payload: { sub, iat, nbf, exp, jti, type: "admin_access", aud: "reliastra-admin",
 *              username }
 *   secret:  ADMIN_TOKEN_SECRET (same value as the backend; injected into the
 *            frontend env so the proxy can verify before serving admin HTML)
 *
 * This is a hand-rolled HS256 verification with Node's `crypto` module —
 * deliberately no `jose`/`jsonwebtoken` dependency. It is used ONLY for the
 * admin surface's server-side gate (proxy + /api/admin route handler); the
 * backend remains the authority for every admin operation.
 */

export const ADMIN_TOKEN_AUDIENCE = 'reliastra-admin';
export const ADMIN_TOKEN_TYPE_ACCESS = 'admin_access';
export const ADMIN_TOKEN_TYPE_REFRESH = 'admin_refresh';

export interface AdminTokenClaims {
  sub: string;
  type: string;
  aud: string;
  username: string;
  jti: string;
  exp: number;
  iat?: number;
  nbf?: number;
}

function b64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = padded.length % 4;
  const withPadding = remainder === 0 ? padded : padded + '='.repeat(4 - remainder);
  return Buffer.from(withPadding, 'base64');
}

function decodeSegment<T>(segment: string): T {
  const json = b64urlDecode(segment).toString('utf8');
  return JSON.parse(json) as T;
}

function getAdminSecret(): string | null {
  const secret = process.env.ADMIN_TOKEN_SECRET;
  return secret && secret.trim().length >= 32 ? secret : null;
}

/**
 * Verify an admin-console JWT (signature, expiry, audience, token type).
 *
 * Returns the claims on success or `null` on ANY failure (missing/invalid
 * secret, malformed token, bad signature, wrong audience, wrong type,
 * expired, not-yet-valid). The admin surface fail-closes: an undecodable
 * token is treated exactly like no token.
 */
export function verifyAdminToken(
  token: string | null | undefined,
  expectedType?: 'admin_access' | 'admin_refresh'
): AdminTokenClaims | null {
  if (!token) return null;
  const secret = getAdminSecret();
  if (!secret) return null; // fail-closed when the secret is not wired up

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) return null;

  let header: { alg?: string; typ?: string };
  let payload: Record<string, unknown>;
  try {
    header = decodeSegment<{ alg?: string; typ?: string }>(headerB64);
    payload = decodeSegment<Record<string, unknown>>(payloadB64);
  } catch {
    return null;
  }

  if (header.alg !== 'HS256') return null;

  // Constant-time signature comparison.
  const signingInput = `${headerB64}.${payloadB64}`;
  const expected = createHmac('sha256', secret).update(signingInput).digest();
  const actual = b64urlDecode(signatureB64);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp);
  const iat = Number(payload.iat ?? 0);
  const nbf = Number(payload.nbf ?? 0);
  if (!Number.isFinite(exp) || exp <= now) return null;
  if (nbf > now) return null;
  const skew = 30; // tolerate 30s of clock skew on issuance
  if (iat > now + skew) return null;

  if (payload.aud !== ADMIN_TOKEN_AUDIENCE) return null;
  const type = payload.type;
  if (typeof type !== 'string') return null;
  if (expectedType && type !== expectedType) return null;
  if (type !== ADMIN_TOKEN_TYPE_ACCESS && type !== ADMIN_TOKEN_TYPE_REFRESH) {
    return null;
  }
  if (typeof payload.username !== 'string' || !payload.username) return null;
  if (typeof payload.sub !== 'string' || !payload.sub) return null;
  if (typeof payload.jti !== 'string' || !payload.jti) return null;

  return payload as unknown as AdminTokenClaims;
}

export function adminSecretConfigured(): boolean {
  return getAdminSecret() !== null;
}
