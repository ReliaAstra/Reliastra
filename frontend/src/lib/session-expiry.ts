/**
 * Session-expiry classification and diagnostics.
 *
 * A signed-out customer and a customer standing in front of a broken backend
 * look identical from the UI, and until now they were identical in the code
 * too: every failure on the auth path collapsed into one "your session has
 * expired" message with nothing logged. That made the single most common
 * support report - "I keep getting logged out" - undiagnosable from the
 * browser.
 *
 * This module is the one place that decides what an auth failure *means*, and
 * the one place that writes it to the console. Both jobs have a hard rule:
 *
 *   Nothing here may ever log an access token, a refresh token, a cookie or
 *   an Authorization header. Only a status code, a machine-readable kind, the
 *   request path and the API's own error `code` are allowed through.
 */

/** Why an authenticated request or a refresh attempt failed. */
export type AuthFailureKind =
  /** 401/403 - the server rejected the session. This one is terminal. */
  | 'unauthorized'
  /** 429 - too many requests. Transient; the session is still valid. */
  | 'rate_limited'
  /** 5xx - the server failed. Transient; the session is still valid. */
  | 'server_error'
  /** 502 from the Next proxy - the backend was unreachable. Transient. */
  | 'proxy_unavailable'
  /** Any other 4xx. */
  | 'client_error'
  /** The request never completed (offline, DNS, CORS, aborted). */
  | 'network'
  /** A response arrived that could not be parsed. */
  | 'malformed'
  /** No token was present at all. */
  | 'no_session';

export interface AuthFailure {
  kind: AuthFailureKind;
  /** HTTP status when there was a response. */
  status?: number;
  /** Request path - never a query string, which can carry identifiers. */
  path?: string;
  /** The API envelope's machine-readable code, e.g. `TOKEN_EXPIRED`. */
  code?: string;
}

export interface AuthFailureInput {
  status?: number;
  path?: string;
  code?: string;
  /** Set when `fetch` itself threw. */
  thrown?: unknown;
  /** Set when the body could not be parsed. */
  malformed?: boolean;
  /** Set when no token was available to send. */
  noSession?: boolean;
}

/** Error codes the backend uses for a session the client cannot recover. */
const TERMINAL_CODES = new Set([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'TOKEN_EXPIRED',
  'INVALID_TOKEN',
]);

/** The proxy's own "upstream unreachable" code (see lib/backend-proxy.ts). */
const PROXY_UNAVAILABLE_CODE = 'BACKEND_UNAVAILABLE';

/**
 * Decide what a failure means.
 *
 * The distinction that matters most: `unauthorized` is the only kind that may
 * destroy a session. Every other kind is a transient infrastructure problem,
 * and wiping the refresh token for one of those turns a 30-second blip into a
 * forced re-login.
 */
export function classifyAuthFailure(input: AuthFailureInput): AuthFailure {
  const path = safePath(input.path);

  if (input.noSession) return { kind: 'no_session', path };
  if (input.thrown !== undefined) {
    return { kind: 'network', path, code: errorName(input.thrown) };
  }
  if (input.malformed) return { kind: 'malformed', status: input.status, path };

  const status = input.status;
  if (status === undefined) return { kind: 'network', path };
  if (input.code === PROXY_UNAVAILABLE_CODE || status === 502) {
    return { kind: 'proxy_unavailable', status, path, code: input.code };
  }
  if (status === 401 || status === 403) {
    return { kind: 'unauthorized', status, path, code: input.code };
  }
  if (status === 429) return { kind: 'rate_limited', status, path, code: input.code };
  if (status >= 500) return { kind: 'server_error', status, path, code: input.code };
  return { kind: 'client_error', status, path, code: input.code };
}

/**
 * True only when the server itself rejected the session.
 *
 * Rate limits, 5xx, proxy failures and network errors are NOT session expiry:
 * they are reasons to retry. Treating them as expiry is what deletes a valid
 * refresh token and logs a customer out of a working account.
 */
export function isSessionInvalid(failure: AuthFailure): boolean {
  if (failure.kind === 'no_session') return true;
  if (failure.kind !== 'unauthorized') return false;
  // A 403 carrying a non-terminal code is an authorization problem on one
  // resource, not a dead session.
  if (failure.status === 403 && failure.code && !TERMINAL_CODES.has(failure.code)) {
    return false;
  }
  return true;
}

/** Human-readable, secret-free one-liner for the console. */
export function describeAuthFailure(failure: AuthFailure): string {
  const parts: string[] = [`kind=${failure.kind}`];
  if (failure.status !== undefined) parts.push(`status=${failure.status}`);
  if (failure.code) parts.push(`code=${failure.code}`);
  if (failure.path) parts.push(`path=${failure.path}`);
  return parts.join(' ');
}

/**
 * Log a session-ending event.
 *
 * Callers pass structured fields only; the message is assembled here so no
 * call site can interpolate a token into it. `redact` is a second line of
 * defence for anything that arrives through `detail`.
 */
export function logSessionEnd(
  stage: 'refresh' | 'request' | 'bootstrap' | 'explicit',
  failure: AuthFailure,
  detail?: string
): void {
  const message = `[session] ended at ${stage}: ${describeAuthFailure(failure)}`;
  const safe = redact(detail);
  if (isSessionInvalid(failure)) {
    console.warn(safe ? `${message} - ${safe}` : message);
  } else {
    // Not a dead session: say so explicitly, because the UI is about to show
    // "signed out" and the distinction is the whole point of this module.
    console.warn(
      `${message} - session is still valid; this was a transient failure, ` +
        'not an expiry'
    );
  }
}

/** Log a non-fatal auth-path failure (a failed refresh that was retried, etc.). */
export function logAuthWarning(
  stage: 'refresh' | 'request' | 'bootstrap',
  failure: AuthFailure,
  detail?: string
): void {
  const message = `[session] ${stage} failed: ${describeAuthFailure(failure)}`;
  const safe = redact(detail);
  console.warn(safe ? `${message} - ${safe}` : message);
}

/**
 * Strip anything that looks like a credential.
 *
 * Defence in depth: callers only ever pass short literals, but a future caller
 * might paste an error object that embeds a request header.
 */
export function redact(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/(bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, '$1[redacted]')
    // Header values can legitimately contain spaces ("Basic dXNlcjpwdw=="), so
    // these must consume up to the `;` delimiter - stopping at whitespace
    // would leave the credential itself in the log line.
    .replace(/(authorization:\s*)[^;]*/gi, '$1[redacted]')
    .replace(/(cookie:\s*)[^;]*/gi, '$1[redacted]')
    .replace(/eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/g, '[redacted-jwt]')
    .slice(0, 300);
}

/** Keep only the path portion - query strings can carry identifiers. */
function safePath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const withoutQuery = path.split('?')[0];
  return withoutQuery.length > 120 ? `${withoutQuery.slice(0, 120)}…` : withoutQuery;
}

function errorName(thrown: unknown): string {
  if (thrown instanceof Error) return thrown.name;
  return typeof thrown === 'string' ? 'Error' : 'UnknownError';
}
