'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AuthAlert,
  AuthShell,
  AuthSubmit,
  Field,
} from '@/components/site/auth/auth-shell';
import { useAppStore } from '@/stores/app-store';
import { storeSessionTokens } from '@/lib/session-storage';
import { readApiError, isEmailNotVerified } from '@/lib/api-error';
import { AUTH_ROUTES, PUBLIC_ROUTES, partnerUrl } from '@/lib/routes';

export const dynamic = 'force-dynamic';

/**
 * Error messages shown to the visitor.
 *
 * Both authentication failures — unknown address and wrong password — map to
 * the SAME sentence. That is deliberate and must stay: distinguishing them
 * turns the sign-in form into an account-enumeration oracle.
 */
const ERRORS: Record<string, string> = {
  'Invalid email or password': 'Email or password is incorrect.',
  'User account is disabled':
    'This account has been deactivated. Contact support to restore access.',
};

function CustomerLoginPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const expired = params.get('expired') === '1';
  const next = params.get('next');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    expired ? 'Your session ended. Sign in again to continue.' : null
  );
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const apiError = await readApiError(
          res,
          'Email or password is incorrect.'
        );
        // The email-verification hard gate: credentials were correct but the
        // address was never proven. The backend has already sent a fresh
        // 6-digit code, so send the customer straight to the code-entry step
        // instead of showing a misleading "wrong password" message.
        if (isEmailNotVerified(apiError)) {
          router.push(
            `${AUTH_ROUTES.verifyEmail}?email=${encodeURIComponent(email.trim())}`
          );
          return;
        }
        setError(ERRORS[apiError.message] ?? apiError.message);
        return;
      }
      const data = await res.json().catch(() => ({}));
      // Persist BOTH tokens (shared canonical store + legacy partner mirror)
      // so the customer console, partner SPA, and admin gate all see the
      // session immediately after redirect.
      if (data.access_token || data.refresh_token) {
        storeSessionTokens(
          data.access_token ?? null,
          data.refresh_token ?? null
        );
      }
      if (data.access_token) {
        useAppStore.getState().setAccessToken(data.access_token);
      }
      // The admin control plane is a separate security domain with its own
      // credentials. A customer sign-in must NEVER route into `/admin`
      // (even `/admin/login` is only meant for the operator credentials).
      // A `next` like `/admin...` or a protocol-relative URL is ignored.
      const destination =
        next &&
        next.startsWith('/') &&
        !next.startsWith('//') &&
        !next.toLowerCase().startsWith('/admin')
          ? next
          : '/dashboard';
      router.push(destination);
    } catch {
      setError('Could not reach RELIASTRA. Check your connection and retry.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError('Enter your email address first, then choose “Forgot password”.');
      return;
    }
    setError(null);
    try {
      await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      /* anti-enumeration: identical message regardless */
    }
    // Identical confirmation whether or not the address exists.
    setNotice('If that address has an account, a reset link is on its way.');
  }

  return (
    <AuthShell
      eyebrow="Customer sign in"
      title="Sign in to RELIASTRA"
      intro="External dependency intelligence, incident attribution and reliability evidence for your organization."
      footer={
        <p className="text-[13px] leading-[1.6] text-[var(--ob-text-4)]">
          Operating client accounts as an agency or MSP?{' '}
          <Link href={partnerUrl('login')} className="ob-link">
            Partner sign-in
          </Link>
        </p>
      }
    >
      {notice && <AuthAlert tone="ok">{notice}</AuthAlert>}
      {error && <AuthAlert tone="error">{error}</AuthAlert>}

      <form
        onSubmit={handleSubmit}
        className={notice || error ? 'mt-6 flex flex-col gap-5' : 'flex flex-col gap-5'}
        noValidate
      >
        <Field
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <div className="flex flex-col">
          <div className="flex items-baseline justify-between gap-4">
            <label htmlFor="password" className="ob-field-label">
              Password
            </label>
            <button
              type="button"
              onClick={handleForgot}
              className="mb-2 text-[12px] font-medium text-[var(--ob-text-4)] underline decoration-[var(--ob-line-3)] underline-offset-4 transition-colors hover:text-[var(--ob-signal)]"
            >
              Forgot password
            </button>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            className="ob-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <AuthSubmit loading={loading} loadingLabel="Signing in…">
          Sign in
        </AuthSubmit>
      </form>

      <p className="mt-7 text-[13.5px] text-[var(--ob-text-3)]">
        New to RELIASTRA?{' '}
        <Link href={AUTH_ROUTES.signup} className="ob-link">
          Create an organization
        </Link>
      </p>
      <p className="mt-3 text-[12.5px] leading-[1.6] text-[var(--ob-text-4)]">
        By signing in you agree to the{' '}
        <Link href={PUBLIC_ROUTES.terms} className="ob-link">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href={PUBLIC_ROUTES.privacy} className="ob-link">
          Privacy Policy
        </Link>
        .
      </p>
    </AuthShell>
  );
}

export default function CustomerLoginPage() {
  return (
    <Suspense fallback={<AuthBootFallback />}>
      <CustomerLoginPageContent />
    </Suspense>
  );
}

function AuthBootFallback() {
  return (
    <div className="ob flex min-h-screen items-center justify-center px-6">
      <p className="ob-label text-[var(--ob-text-4)]">Loading sign-in…</p>
    </div>
  );
}
