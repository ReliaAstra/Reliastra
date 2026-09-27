'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AuthAlert,
  AuthShell,
} from '@/components/site/auth/auth-shell';
import { useAppStore } from '@/stores/app-store';
import { storeSessionTokens } from '@/lib/session-storage';
import { consumeOAuthState, exchangeGitHubCode } from '@/lib/github-oauth';
import { AUTH_ROUTES, CONSOLE_ROUTES } from '@/lib/routes';

export const dynamic = 'force-dynamic';

/**
 * The GitHub OAuth landing page: `GET /auth/github/callback?code=&state=`.
 *
 * Verifies the CSRF state minted by the sign-in button, swaps the one-time
 * code for a session via the backend (the secret lives there), persists
 * the pair exactly like the email flow, and routes on. First-timers land
 * on onboarding; everyone else returns to where they were headed.
 *
 * Every failure renders here as words, never as a token or a code: the
 * code is single-use and the query string is already in browser history.
 */
function GitHubCallbackContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const providerError = params.get('error');
      if (providerError) {
        setError(
          providerError === 'access_denied'
            ? 'GitHub sign-in was cancelled. Try again or use your email instead.'
            : 'GitHub refused the sign-in attempt. Try again or use your email instead.'
        );
        setWorking(false);
        return;
      }
      const code = params.get('code');
      if (!code) {
        setError('GitHub returned no sign-in code. Try again from the sign-in page.');
        setWorking(false);
        return;
      }
      const returnedState = params.get('state');
      const { state: expectedState, next } = consumeOAuthState();
      if (!expectedState || !returnedState || expectedState !== returnedState) {
        setError('That GitHub sign-in attempt has expired. Start again from the sign-in page.');
        setWorking(false);
        return;
      }
      try {
        const session = await exchangeGitHubCode(code);
        if (cancelled) return;
        storeSessionTokens(session.access_token, session.refresh_token);
        useAppStore.getState().setAccessToken(session.access_token);
        const destination =
          !session.is_new_user && next && next.startsWith('/') && !next.startsWith('//') && !next.toLowerCase().startsWith('/admin')
            ? next
            : session.is_new_user
              ? CONSOLE_ROUTES.onboarding
              : '/dashboard';
        router.push(destination);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'GitHub sign-in failed. Try again in a moment.');
        setWorking(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthShell
      eyebrow="GitHub sign in"
      title={working ? 'Finishing sign in…' : 'GitHub sign in'}
      intro={working ? 'Exchanging the GitHub code for your session.' : 'That attempt did not complete.'}
      footer={
        <p className="text-[13px] leading-[1.6] text-[var(--ob-text-4)]">
          One account. The console, the API and the CLI all use it.
        </p>
      }
    >
      {working && !error && (
        <p className="ob-label" role="status">
          Working…
        </p>
      )}
      {error && <AuthAlert tone="error">{error}</AuthAlert>}
      {error && (
        <div className="mt-7 flex flex-col gap-3">
          <Link href={AUTH_ROUTES.login} className="ob-btn ob-btn-signal ob-btn-block">
            Back to sign in
          </Link>
          <p className="text-[13px] leading-[1.6] text-[var(--ob-text-4)]">
            The sign-in page also accepts your email and password.
          </p>
        </div>
      )}
    </AuthShell>
  );
}

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={<AuthBootFallback />}>
      <GitHubCallbackContent />
    </Suspense>
  );
}

function AuthBootFallback() {
  return (
    <div className="ob flex min-h-screen items-center justify-center px-6">
      <p className="ob-label text-[var(--ob-text-4)]">Finishing sign-in…</p>
    </div>
  );
}
