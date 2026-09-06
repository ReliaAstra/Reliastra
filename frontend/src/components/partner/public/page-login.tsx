'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePartnerStore } from '@/stores/partner-store';
import { navigatePartner } from '@/components/partner/public/navigation';
import { partnerApi, mapPartnerProfile } from '@/lib/partner-api';
import { toast } from 'sonner';
import { isEmailNotVerified, readApiError } from '@/lib/api-error';
import { VerifyOtpStep, type VerifiedSession } from './verify-otp-step';
import {
  AuthAlert,
  AuthSubmit,
  Field,
} from '@/components/site/auth/auth-shell';
import { partnerUrl } from '@/lib/routes';

export function PageLogin() {
  const navigate = navigatePartner;
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  // Set when the backend refuses the sign-in because the address has never
  // been verified (403 EMAIL_NOT_VERIFIED). Swaps the form for the code step.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  /**
   * Everything that happens once a session exists, regardless of whether it
   * came from `/login` or from clearing the verification gate via `/verify-otp`.
   */
  const completeSignIn = async (accessToken: string, refreshToken: string) => {
    const store = usePartnerStore.getState();
    store.setTokens(accessToken, refreshToken);

    // Get current user info - UserResponse (snake_case, not wrapped)
    const meRes = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // The identity fetch is what turns a token pair into a renderable session.
    // If it fails (transient 5xx / dropped request), never mark the surface
    // authenticated without a user: `authenticated && !user` renders a blank
    // screen. Keep the stored tokens so a reload self-heals, and leave the
    // user on the sign-in form to retry.
    if (!meRes.ok) {
      toast.error('Could not load your profile - please try again.');
      return;
    }

    const user = await meRes.json();
    store.setUser({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
    });
    store.setAuthStatus('authenticated');

    // The admin control plane is a SEPARATE security domain with its own
    // operator credentials. A partner/customer sign-in must NEVER route into
    // `/admin` (or `/admin/login`): that surface only accepts the dedicated
    // admin session and it would instantly 401 a partner token anyway.

    // Check if the user is already a partner
    const partnerRes = await fetch('/api/partners/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (partnerRes.ok) {
      store.setPartner(mapPartnerProfile(await partnerRes.json()));
      toast.success('Welcome back');
      navigate('dashboard');
    } else if (partnerRes.status === 404) {
      // Not a partner yet: activation is free, idempotent server-side, and
      // requires no consent beyond the program terms - do it automatically so
      // the user lands on the dashboard instead of a dead-end "apply" step.
      try {
        const profile = await partnerApi.apply({ agree_terms: true });
        store.setPartner(mapPartnerProfile(profile));
        toast.success('Welcome to the Partner Network');
      } catch {
        toast.error('Could not activate your partner account - try again from the dashboard.');
      }
      navigate('dashboard');
    } else {
      toast.error('Could not load your partner profile - try again from the dashboard.');
      navigate('dashboard');
    }
  };

  const handleVerified = async (session: VerifiedSession) => {
    toast.success('Email verified');
    await completeSignIn(
      session.tokens.access_token,
      session.tokens.refresh_token
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);

    if (!email || !password) {
      setFieldError('Please enter your email and password.');
      return;
    }

    setLoading(true);

    try {
      // Login - returns { access_token, refresh_token, token_type, expires_in }
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!loginRes.ok) {
        const apiError = await readApiError(
          loginRes,
          "We couldn't sign you in. Check your email and password and try again."
        );

        // The email-verification hard gate: credentials were correct but the
        // address was never proven. The backend has already sent a fresh
        // code, so go straight to the code step rather than showing an error.
        if (isEmailNotVerified(apiError)) {
          setPendingEmail(email);
          toast.info('Verify your email to continue - we sent you a code');
          return;
        }

        setFieldError(apiError.message);
        toast.error('Invalid credentials - try again');
        return;
      }

      const tokens = await loginRes.json();
      await completeSignIn(tokens.access_token, tokens.refresh_token);
    } catch {
      setFieldError("We couldn't reach RELIASTRA. Check your connection and try again.");
      toast.error('Connection failed - check your network');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ob-container-narrow">
      <div className="mx-auto w-full max-w-[400px]">
        {pendingEmail ? (
          <VerifyOtpStep
            email={pendingEmail}
            onVerified={handleVerified}
            onBack={() => setPendingEmail(null)}
            backLabel="Back to sign in"
            title="Verify your email"
          />
        ) : (
          <>
            <p className="ob-label text-[var(--ob-signal)]">Partner network</p>
            <h1 className="ob-h2 mt-4 text-[clamp(1.75rem,4vw,2.25rem)]">
              Sign in to your partner account.
            </h1>
            <p className="ob-body mt-4 text-[14.5px]">
              Track referrals, commission and payouts. This is the partner
              network - if you monitor dependencies with RELIASTRA, use{' '}
              <Link href="/login" className="ob-link">
                customer sign in
              </Link>{' '}
              instead.
            </p>

            {fieldError && (
              <div className="mt-8">
                <AuthAlert tone="error">{fieldError}</AuthAlert>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-9 flex flex-col gap-6">
              <Field
                id="partner-login-email"
                label="Work email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
                required
              />

              <div className="flex flex-col">
                <Field
                  id="partner-login-password"
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <div className="mt-2.5 flex justify-end">
                  <Link
                    href={partnerUrl('forgot-password')}
                    className="ob-small underline underline-offset-4 transition-colors hover:text-[var(--ob-signal)]"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              <AuthSubmit loading={loading} loadingLabel="Signing in…">
                Sign in
              </AuthSubmit>
            </form>

            <p className="ob-small mt-8 border-t border-[var(--ob-line)] pt-6">
              No partner account yet?{' '}
              <Link href={partnerUrl('signup')} className="ob-link">
                Apply to the partner network
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}
