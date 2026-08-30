'use client';

import { getRefreshToken, storeSessionTokens } from '@/lib/session-storage';

/**
 * Single-flight refresh, shared by EVERY authenticated surface.
 *
 * The backend rotates refresh tokens: each successful refresh revokes the
 * presented token and mints a new one with `sequence + 1` in the same family.
 * If N requests hit a 401 in the same tick (a hard navigation mounts several
 * panels at once, or the customer console + partner SPA + admin console are
 * open together), each module-level single-flight used to be independent and
 * the losers replayed the just-spent token. The backend then treated the
 * replay as theft and revoked the WHOLE family — "signed out everywhere"
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

async function doRefresh(): Promise<RefreshedSession | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  try {
    const res = await fetch(REFRESH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
    };
    if (!data.access_token || !data.refresh_token) return null;
    storeSessionTokens(data.access_token, data.refresh_token);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    };
  } catch {
    return null;
  }
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
