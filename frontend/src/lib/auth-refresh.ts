'use client';

import { getRefreshToken, storeSessionTokens } from '@/lib/session-storage';
import {
  classifyAuthFailure,
  isSessionInvalid,
  logAuthWarning,
  logSessionEnd,
} from '@/lib/session-expiry';

/**
 * Single-flight refresh, shared by EVERY authenticated surface.
 *
 * The backend rotates refresh tokens: each successful refresh revokes the
 * presented token and mints a new one with `sequence + 1` in the same family.
 * If N requests hit a 401 in the same tick (a hard navigation mounts several
 * panels at once, or the customer console + partner SPA + admin console are
 * open together), each module-level single-flight used to be independent and
 * the losers replayed the just-spent token. The backend then treated the
 * replay as theft and revoked the WHOLE family - "signed out everywhere"
 * with a perfectly valid session.
 *
 * This module owns the ONLY refresh mutex: every request layer
 * (`dashboard/api.ts`, `partner-api.ts`, `admin-api.ts`) awaits the same
 * promise, so exactly one refresh ever happens per rotation window and every
 * caller retries with the same rotated pair.
 */

export interface RefreshedSession {
  accessToken: string;
  refreshToken: string;
}

export const REFRESH_ENDPOINT = '/api/v1/auth/refresh';

let refreshPromise: Promise<RefreshedSession | null> | null = null;

/** Read only the envelope's machine-readable `code` from a failed response. */
async function readErrorCode(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: { code?: string } };
    return body?.error?.code;
  } catch {
    return undefined;
  }
}

async function doRefresh(): Promise<RefreshedSession | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;

  let res: Response;
  try {
    res = await fetch(REFRESH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
  } catch (thrown) {
    // Never log the token: only that the call did not complete, and why.
    logAuthWarning('refresh', classifyAuthFailure({ thrown, path: REFRESH_ENDPOINT }));
    return null;
  }

  if (!res.ok) {
    const failure = classifyAuthFailure({
      status: res.status,
      path: REFRESH_ENDPOINT,
      code: await readErrorCode(res),
    });
    // This is the log line that makes "I keep getting logged out" answerable:
    // a 429 here is a rate limit, a 502 is the backend being unreachable, and
    // only a 401 is an actual dead session.
    if (isSessionInvalid(failure)) {
      logSessionEnd('refresh', failure);
    } else {
      logAuthWarning('refresh', failure);
    }
    return null;
  }

  const data = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
  } | null;
  if (!data?.access_token || !data.refresh_token) {
    logAuthWarning(
      'refresh',
      classifyAuthFailure({ status: res.status, path: REFRESH_ENDPOINT, malformed: true })
    );
    return null;
  }
  storeSessionTokens(data.access_token, data.refresh_token);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  };
}

/** One refresh attempt, deduplicated across all callers. */
export function refreshSession(): Promise<RefreshedSession | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}
