'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePartnerStore } from '@/stores/partner-store';
import { navigatePartner } from '@/components/partner/public/navigation';
import { partnerApi, mapPartnerProfile } from '@/lib/partner-api';
import { toast } from 'sonner';
import { getStoredReferralCode } from './referral-banner';
import { getSignupAttribution } from '@/lib/attribution';
import { readApiError } from '@/lib/api-error';
import { VerifyOtpStep, type VerifiedSession } from './verify-otp-step';
import {
  AuthAlert,
  AuthSubmit,
  Field,
} from '@/components/site/auth/auth-shell';
import { partnerRouteUrl, partnerUrl } from '@/lib/routes';

export function PageSignup() {
  const navigate = navigatePartner;
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  // Email verification is a hard gate: registration returns no tokens, so the
  // form advances to the code step instead of straight into the dashboard.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  // Check for referral cookie on mount
  useEffect(() => {
    const code = getStoredReferralCode();
    if (code) setReferralCode(code);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);

    if (!name || !email || !password) {
      setFieldError('Please fill in all required fields.');
      return;
    }

    if (password.length < 8) {
      setFieldError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);

    // First-party acquisition attribution (FIRST TOUCH). Read-only here:
    // absent/failed storage simply omits the field and signup proceeds.
    const attribution = getSignupAttribution();

    try {
      // Call real register endpoint with snake_case fields
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          full_name: name,
          ref_code: referralCode || undefined,
          acquisition: attribution,
        }),
      });

      if (!res.ok) {
        const apiError = await readApiError(res, 'Signup failed. Please try again.');
        setFieldError(
          apiError.status === 409
            ? 'An account with this email already exists. Sign in instead.'
            : apiError.message
        );
        return;
      }

      // Response: { user, organization, tokens: null, verification_required }
      // No session is issued here - the emailed code is the next step.
      await res.json();
      toast.success('Account created - check your email for the code');
      setPendingEmail(email);
    } catch {
      setFieldError("We couldn't reach RELIASTRA. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  /** Called once the OTP step exchanges the code for a real session. */
  const handleVerified = async (session: VerifiedSession) => {
    const store = usePartnerStore.getState();
    store.setTokens(session.tokens.access_token, session.tokens.refresh_token);
    store.setUser({
      id: session.user.id,
      email: session.user.email,
      fullName: session.user.full_name,
    });
    store.setAuthStatus('authenticated');

    // Activation is free, idempotent, and needs no extra consent - do it
    // automatically so a new partner lands on the dashboard directly.
    try {
      const profile = await partnerApi.apply({ agree_terms: true });
      store.setPartner(mapPartnerProfile(profile));
      toast.success('Email verified - welcome to RELIASTRA');
    } catch {
      toast.success('Email verified - you can activate your partner account from the dashboard');
    }
    navigate('dashboard');
  };

  return (
    <div className="ob-container">
      <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:gap-20">
        {/* Terms of the programme, stated before the form - the only claims
            here are the ones the commission page and program terms make. */}
        <div className="order-2 lg:order-1 lg:border-r lg:border-[var(--ob-line)] lg:pr-20">
          <p className="ob-label">Partner network</p>
          <h2 className="ob-h2 mt-4 max-w-[18ch]">
            Recommend the evidence layer. Earn while it runs.
          </h2>
          <p className="ob-body mt-5 max-w-[52ch]">
            Refer a team that depends on services it does not control. When
            they subscribe, you earn a share of that subscription for as long
            as it stays active.
          </p>
          <dl className="mt-10 max-w-[52ch]">
            {[
              [
                '30% recurring',
                'Of the monthly subscription fee, every month the referred customer remains subscribed.',
              ],
              [
                'No caps, no tiers on rate',
                'The commission rate does not decrease as volume grows.',
              ],
              [
                'Monthly payouts',
                'Subject to the hold period, reversal rules and payout minimum set out in the commission terms.',
              ],
            ].map(([term, desc]) => (
              <div key={term} className="border-t border-[var(--ob-line)] py-5">
                <dt className="text-[14.5px] font-semibold tracking-[-0.01em] text-[var(--ob-text)]">
                  {term}
                </dt>
                <dd className="mt-1.5 text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">
                  {desc}
                </dd>
              </div>
            ))}
          </dl>
          <p className="ob-small mt-6">
            Full detail:{' '}
            <Link href={partnerUrl('commission')} className="ob-link">
              commission structure
            </Link>{' '}
            and{' '}
            <Link href={partnerRouteUrl('terms')} className="ob-link">
              program terms
            </Link>
            .
          </p>
        </div>

        {/* Form */}
        <div className="order-1 w-full max-w-[400px] lg:order-2">
          {pendingEmail ? (
            <VerifyOtpStep
              email={pendingEmail}
              onVerified={handleVerified}
              onBack={() => setPendingEmail(null)}
              backLabel="Use a different email"
            />
          ) : (
            <>
              <p className="ob-label text-[var(--ob-signal)]">Apply</p>
              <h1 className="ob-h2 mt-4 text-[clamp(1.75rem,4vw,2.25rem)]">
                Create a partner account.
              </h1>
              <p className="ob-body mt-4 text-[14.5px]">
                Applying to the partner network does not create a monitoring
                account. To monitor your own dependencies,{' '}
                <Link href="/signup" className="ob-link">
                  start monitoring
                </Link>{' '}
                instead.
              </p>

              {referralCode && (
                <div className="mt-6">
                  <AuthAlert tone="note">
                    Referred by{' '}
                    <span className="ob-mono text-[var(--ob-text-2)]">
                      {referralCode}
                    </span>
                    . Your application will be attributed to this partner.
                  </AuthAlert>
                </div>
              )}

              {fieldError && (
                <div className="mt-6">
                  <AuthAlert tone="error">{fieldError}</AuthAlert>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-9 flex flex-col gap-6">
                <Field
                  id="partner-signup-name"
                  label="Full name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                />
                <Field
                  id="partner-signup-email"
                  label="Work email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  required
                />
                <Field
                  id="partner-signup-password"
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  hint="At least 8 characters."
                />

                <AuthSubmit loading={loading} loadingLabel="Creating account…">
                  Create partner account
                </AuthSubmit>

                <p className="ob-help">
                  We email a verification code before the account becomes
                  active. By continuing you accept the{' '}
                  <Link href={partnerRouteUrl('terms')} className="ob-link">
                    program terms
                  </Link>{' '}
                  and{' '}
                  <Link href={partnerRouteUrl('privacy')} className="ob-link">
                    privacy notice
                  </Link>
                  .
                </p>
              </form>

              <p className="ob-small mt-8 border-t border-[var(--ob-line)] pt-6">
                Already a partner?{' '}
                <Link href={partnerUrl('login')} className="ob-link">
                  Sign in
                </Link>
                .
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
