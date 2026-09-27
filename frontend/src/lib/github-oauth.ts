'use client';

/**
 * GitHub OAuth client flow.
 *
 * The secret never touches this layer: the frontend builds the public
 * authorize URL from the backend's config, GitHub returns a one-time code
 * to the callback page, and the code is POSTed (never placed in a URL) to
 * `/v1/auth/github/exchange`, where the backend swaps it with the secret.
 * The CSRF `state` is minted here, kept in `sessionStorage`, and verified
 * by the callback page before any network call happens.
 */

import { readApiError } from './api-error';

const STATE_KEY = 'reliastra_github_oauth_state';
const NEXT_KEY = 'reliastra_github_oauth_next';

export interface GitHubOAuthConfig {
  enabled: boolean;
  client_id: string | null;
  redirect_uri: string | null;
}

export interface GitHubSession {
  access_token: string;
  refresh_token: string;
  is_new_user: boolean;
  email: string;
  full_name: string;
}

const SCOPES = ['read:user', 'user:email'] as const;

export function newOAuthState(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export function rememberOAuthState(state: string, next: string | null): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(STATE_KEY, state);
  if (next) window.sessionStorage.setItem(NEXT_KEY, next);
  else window.sessionStorage.removeItem(NEXT_KEY);
}

export function consumeOAuthState(): { state: string | null; next: string | null } {
  if (typeof window === 'undefined') return { state: null, next: null };
  const state = window.sessionStorage.getItem(STATE_KEY);
  const next = window.sessionStorage.getItem(NEXT_KEY);
  window.sessionStorage.removeItem(STATE_KEY);
  window.sessionStorage.removeItem(NEXT_KEY);
  return { state, next };
}

export function buildAuthorizeUrl(config: {
  client_id: string;
  redirect_uri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: config.client_id,
    redirect_uri: config.redirect_uri,
    scope: SCOPES.join(' '),
    state: config.state,
    allow_signup: 'true',
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function fetchGitHubConfig(): Promise<GitHubOAuthConfig> {
  const res = await fetch('/api/v1/auth/github/config', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    // Config is a feature flag, not a measurement: a failed read means the
    // button hides, it never means an error page.
    return { enabled: false, client_id: null, redirect_uri: null };
  }
  const body = (await res.json().catch(() => ({}))) as Partial<GitHubOAuthConfig>;
  if (!body.enabled || !body.client_id || !body.redirect_uri) {
    return { enabled: false, client_id: null, redirect_uri: null };
  }
  return { enabled: true, client_id: body.client_id, redirect_uri: body.redirect_uri };
}

export async function exchangeGitHubCode(code: string): Promise<GitHubSession> {
  const res = await fetch('/api/v1/auth/github/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const apiError = await readApiError(res, 'GitHub sign-in failed. Try again in a moment.');
    throw new Error(apiError.message);
  }
  const body = (await res.json().catch(() => ({}))) as Partial<GitHubSession>;
  if (!body.access_token || !body.refresh_token) {
    throw new Error('GitHub sign-in failed. Try again in a moment.');
  }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    is_new_user: body.is_new_user ?? false,
    email: body.email ?? '',
    full_name: body.full_name ?? '',
  };
}
