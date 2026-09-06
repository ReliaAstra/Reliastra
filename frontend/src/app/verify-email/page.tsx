'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AuthAlert,
  AuthShell,
  AuthSubmit,
  Field,
} from '@/components/site/auth/auth-shell';
import {
  VerifyOtpStep,
  type VerifiedSession,
} from '@/components/partner/public/verify-otp-step';
import { readApiError } from '@/lib/api-error';
import { useAppStore } from '@/stores/app-store';
import { storeSessionTokens } from '@/lib/session-storage';
import { AUTH_ROUTES } from '@/lib/routes';

type LinkState = 'verifying' | 'verified' | 'failed';

/**
 * Destination for the `?token=` magic link the backend emails
 * (`FRONTEND_BASE_URL/verify-email?token=...`).
 *
 * Without a token it doubles as the standalone code-entry screen, which is
 * where a user lands if they close the signup tab before verifying, or if a
 * sign-in is blocked by the verification gate.
 *
 * Both paths are preserved exactly; only their presentation changed. Note the
 * single-use token guard (`consumedRef`) — React StrictMode double-mounts in
 * development, and firing the exchange twice would report the second call as
 * "already used" and show a false failure.
 */
function VerifyEmailContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const emailParam = params.get('email') ?? '';

  const [linkState, setLinkState] = useState<LinkState>('verifying');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [email, setEmail] = useState(emailParam);
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(
    emailParam || null
  );
  const [done, setDone] = useState(false);
  const consumedRef = useRef(false);

  const verifyToken = useCallback(async (value: string) => {
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: value }),
      });
      if (!res.ok) {
        const apiError = await readApiError(
          res,
          'That verification link is not valid.'
        );
        setLinkError(apiError.message);
        setLinkState('failed');
        return;
      }
      setLinkState('verified');
    } catch {
      setLinkError(
        'Could not reach RELIASTRA. Check your connection and try again.'
      );
      setLinkState('failed');
    }
  }, []);

  useEffect(() => {
    if (!token || consumedRef.current) return;
    consumedRef.current = true;
    void verifyToken(token);
  }, [token, verifyToken]);

  // ── Magic-link flow ────────────────────────────────────────────────────
  if (token) {
    if (linkState === 'verifying') {
      return (
        <AuthShell
          eyebrow="Email verification"
          title="Verifying your address"
          intro="Exchanging the link token with the authentication service."
        >
          <p role="status" className="ob-label text-[var(--ob-text-4)]">
            Working…
          </p>
        </AuthShell>
      );
    }

    if (linkState === 'verified') {
      return (
        <AuthShell
          eyebrow="Email verification"
          title="Address confirmed"
          intro="Your email address has been verified. You can sign in now."
        >
          <AuthAlert tone="ok">
            Verification complete. This link cannot be used again.
          </AuthAlert>
          <Link
            href={AUTH_ROUTES.login}
            className="ob-btn ob-btn-signal ob-btn-block mt-7"
          >
            Go to sign in
          </Link>
        </AuthShell>
      );
    }

    return (
      <AuthShell
        eyebrow="Email verification"
        title="Verification failed"
        intro="The link could not be used. Links are single-use and expire, so this is most often because it was already opened."
      >
        <AuthAlert tone="error">{linkError}</AuthAlert>
        <p className="ob-body mt-6 text-[14px]">
          Request a fresh 6-digit code instead — it is sent to the same address
          and works from any device.
        </p>
        <button
          type="button"
          onClick={() => {
            // Drop the spent ?token= and fall through to the code form.
            router.replace(AUTH_ROUTES.verifyEmail);
          }}
          className="ob-btn ob-btn-outline ob-btn-block mt-6"
        >
          Use a code instead
        </button>
      </AuthShell>
    );
  }

  // ── Code flow ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <AuthShell
        eyebrow="Email verification"
        title="Account active"
        intro="Your address is verified and your session is live."
      >
        <AuthAlert tone="ok">
          Verification complete. Your organization is ready.
        </AuthAlert>
        <Link
          href="/dashboard"
          className="ob-btn ob-btn-signal ob-btn-block mt-7"
        >
          Continue to your workspace
        </Link>
      </AuthShell>
    );
  }

  if (confirmedEmail) {
    return (
      <AuthShell eyebrow="Email verification" title="Check your email">
        <VerifyOtpStep
          email={confirmedEmail}
          autoSend
          // The OTP exchange issues the session - persist BOTH tokens before
          // showing the "verified" screen so the console is authenticated.
          onVerified={(session: VerifiedSession) => {
            storeSessionTokens(
              session.tokens.access_token,
              session.tokens.refresh_token
            );
            useAppStore.getState().setAccessToken(session.tokens.access_token);
            setDone(true);
          }}
          onBack={() => setConfirmedEmail(null)}
          backLabel="Use a different email"
          title="Enter your verification code"
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Email verification"
      title="Verify your email"
      intro="Enter the address you signed up with and a 6-digit code will be sent to it."
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) setConfirmedEmail(email.trim());
        }}
      >
        <Field
          id="verify-email"
          label="Email address"
          type="email"
          required
          autoFocus
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthSubmit loading={false}>Send code</AuthSubmit>
      </form>

      <p className="mt-7 text-[13.5px] text-[var(--ob-text-3)]">
        Already verified?{' '}
        <Link href={AUTH_ROUTES.login} className="ob-link">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="ob flex min-h-screen items-center justify-center px-6">
          <p className="ob-label text-[var(--ob-text-4)]">Loading…</p>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
