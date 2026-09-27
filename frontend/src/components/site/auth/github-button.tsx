'use client';

import { useState } from 'react';
import { Github } from 'lucide-react';
import { AuthAlert } from './auth-shell';
import {
  buildAuthorizeUrl,
  fetchGitHubConfig,
  newOAuthState,
  rememberOAuthState,
} from '@/lib/github-oauth';

/**
 * The social sign-in button, shared by the sign-in and sign-up pages.
 *
 * One click: read the backend feature flag, mint a CSRF state, remember it
 * (plus the optional `next` destination) in `sessionStorage`, and leave for
 * GitHub. Everything after that happens on the callback page.
 *
 * When the provider is off or unreachable the button hides itself: a dead
 * social button is worse than no social button, and the email form below
 * it keeps working either way.
 */
export function GitHubButton({ next }: { next?: string | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  async function start() {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const config = await fetchGitHubConfig();
      if (!config.enabled || !config.client_id || !config.redirect_uri) {
        setHidden(true);
        return;
      }
      const state = newOAuthState();
      rememberOAuthState(state, next ?? null);
      window.location.assign(
        buildAuthorizeUrl({
          client_id: config.client_id,
          redirect_uri: config.redirect_uri,
          state,
        })
      );
    } catch {
      setError('Could not reach RELIASTRA. Check your connection and retry.');
      setLoading(false);
    }
  }

  if (hidden) return null;

  return (
    <div className="flex flex-col gap-3">
      {error && <AuthAlert tone="error">{error}</AuthAlert>}
      <button
        type="button"
        onClick={start}
        disabled={loading}
        aria-busy={loading}
        className="ob-btn ob-btn-outline ob-btn-block"
      >
        <Github aria-hidden size={16} />
        {loading ? 'Contacting GitHub…' : 'Continue with GitHub'}
      </button>
    </div>
  );
}
