'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AuthAlert,
  AuthShell,
  AuthSubmit,
  Field,
} from '@/components/site/auth/auth-shell';
import { readApiError } from '@/lib/api-error';
import { AUTH_ROUTES, partnerUrl } from '@/lib/routes';

/**
 * Destination for the password-reset email
 * (`FRONTEND_BASE_URL/reset-password?token=...`).
 *
 * Security properties preserved verbatim:
 * - The token is only ever sent in the request body, never logged or echoed
 *   back into the DOM.
 * - A failed exchange returns the backend's message unchanged; it does not
 *   reveal whether an account exists.
 * - The success copy states that other sessions were signed out, because the
 *   backend rotates refresh tokens on password change and the user should
 *   know their other devices are now logged out.
 */
function ResetPasswordContent() {
  const token = useSearchParams().get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthShell
        eyebrow="Password reset"
        title="Reset link incomplete"
        intro="This page needs the token from your password-reset email. Reset links are single-use and expire."
      >
        <AuthAlert tone="error">
          No reset token was supplied. Open the link directly from the email, or
          request a new one.
        </AuthAlert>
        <div className="mt-7 flex flex-col gap-3">
          <Link
            href={AUTH_ROUTES.login}
            className="ob-btn ob-btn-signal ob-btn-block"
          >
            Request a new link
          </Link>
          <p className="ob-help">
            Enter your email on the sign-in page and choose “Forgot password”.
          </p>
        </div>
        <p className="mt-6 text-[13px] leading-[1.6] text-[var(--ob-text-4)]">
          Resetting a partner account?{' '}
          <Link href={partnerUrl('forgot-password')} className="ob-link">
            Partner password reset
          </Link>
        </p>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        eyebrow="Password reset"
        title="Password updated"
        intro="Your new password is active."
      >
        <AuthAlert tone="ok">
          All other sessions were signed out. Any device that was still signed
          in will need the new password.
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

  const mismatch = Boolean(confirm) && password !== confirm;
  const tooShort = Boolean(password) && password.length < 8;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Those passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (!res.ok) {
        const apiError = await readApiError(
          res,
          'That reset link is not valid. Request a new one.'
        );
        setError(apiError.message);
        return;
      }
      setDone(true);
    } catch {
      setError(
        'Could not reach RELIASTRA. Check your connection and try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Password reset"
      title="Choose a new password"
      intro="Minimum 8 characters. Setting a new password signs out every other session."
    >
      {error && <AuthAlert tone="error">{error}</AuthAlert>}

      <form
        className={error ? 'mt-6 flex flex-col gap-5' : 'flex flex-col gap-5'}
        onSubmit={submit}
        noValidate
      >
        <Field
          id="new-password"
          label="New password"
          type="password"
          required
          autoFocus
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          hint={tooShort ? undefined : 'At least 8 characters.'}
          error={tooShort ? 'Use at least 8 characters.' : undefined}
        />
        <Field
          id="confirm-password"
          label="Confirm password"
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          error={mismatch ? 'Those passwords do not match.' : undefined}
        />
        <AuthSubmit loading={saving} loadingLabel="Updating…">
          Update password
        </AuthSubmit>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="ob flex min-h-screen items-center justify-center px-6">
          <p className="ob-label text-[var(--ob-text-4)]">Loading…</p>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
