'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AuthAlert,
  AuthShell,
  AuthSubmit,
  Field,
} from '@/components/site/auth/auth-shell';
import { useAppStore } from '@/stores/app-store';
import { storeSessionTokens } from '@/lib/session-storage';
import { readApiError } from '@/lib/api-error';
import { AUTH_ROUTES, PUBLIC_ROUTES, partnerUrl } from '@/lib/routes';
import { getSignupAttribution } from '@/lib/attribution';
import { getStoredReferralCode } from '@/lib/partner-referral';

interface RegisterResponse {
  user?: { id: string; email: string };
  organization?: { id: string; name: string };
  tokens?: { access_token: string; refresh_token: string };
  access_token?: string;
  refresh_token?: string;
  verification_required?: boolean;
  detail?: string;
}

export default function CustomerSignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  useEffect(() => {
    const code = getStoredReferralCode();
    if (code) setReferralCode(code);
  }, []);

  const passwordOk = password.length >= 8;
  const passwordTooShort = Boolean(password) && !passwordOk;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim() || !email.trim() || !password) {
      setError('Fill in every field to continue.');
      return;
    }
    if (!passwordOk) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      const attribution = getSignupAttribution();
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          password,
          ref_code: referralCode || undefined,
          acquisition: attribution,
        }),
      });
      if (!res.ok) {
        const apiError = await readApiError(
          res,
          'Registration failed. Try again in a moment.'
        );
        setError(
          apiError.status === 409
            ? 'An account with this email already exists. Sign in instead.'
            : apiError.message
        );
        return;
      }
      const data: RegisterResponse = await res.json().catch(() => ({}));
      const access = data.tokens?.access_token ?? data.access_token;
      const refresh = data.tokens?.refresh_token ?? data.refresh_token;
      if (access || refresh) {
        // Persist BOTH tokens so the session survives the navigate.
        storeSessionTokens(access ?? null, refresh ?? null);
      }
      if (access) {
        useAppStore.getState().setAccessToken(access);
      }
      // If verification is required the API returns no refresh token - send
      // the customer to the code-entry step rather than into a console they
      // are about to be bounced out of.
      const needsVerify = data.verification_required === true || !refresh;
      if (needsVerify) {
        const emailParam = encodeURIComponent(email.trim());
        router.push(`${AUTH_ROUTES.verifyEmail}?email=${emailParam}`);
      } else {
        // Start the guided onboarding journey immediately (state is resumable)
        try {
          localStorage.removeItem('reliastra_onboarding_v2'); // fresh start
          localStorage.removeItem('reliastra_dismiss_trial_banner');
        } catch {}
        router.push('/onboarding');
      }
    } catch {
      setError('Could not reach RELIASTRA. Check your connection and retry.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Create your organization"
      title="Start monitoring"
      intro="14-day Pro trial. No payment method required."
      image="/media/fiber-patch-panel.jpg"
      imageAlt="Macro view of a fibre patch panel: densely stacked duplex connectors and coiled jumpers."
      aside={<SignupAside />}
      footer={
        <p className="text-[13px] leading-[1.6] text-[var(--ob-text-4)]">
          Referring customers as a partner?{' '}
          <Link href={partnerUrl('signup')} className="ob-link">
            Apply to the partner program
          </Link>
        </p>
      }
    >
      {referralCode && (
        <AuthAlert tone="note">
          Referred by{' '}
          <span className="ob-mono text-[var(--ob-text-2)]">{referralCode}</span>
          . This organization will be attributed to the partner.
        </AuthAlert>
      )}
      {error && <AuthAlert tone="error">{error}</AuthAlert>}

      <form
        onSubmit={handleSubmit}
        className={
          error || referralCode ? 'mt-6 flex flex-col gap-5' : 'flex flex-col gap-5'
        }
        noValidate
      >
        <Field
          id="fullName"
          label="Full name"
          type="text"
          autoComplete="name"
          autoFocus
          required
          placeholder="Alex Rivera"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <Field
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={
            passwordTooShort
              ? undefined
              : 'At least 8 characters. Used only for your account.'
          }
          error={
            passwordTooShort
              ? 'Use at least 8 characters.'
              : undefined
          }
        />

        <AuthSubmit loading={loading} loadingLabel="Creating organization…">
          Create organization
        </AuthSubmit>

        <p className="text-[12.5px] leading-[1.6] text-[var(--ob-text-4)]">
          By continuing you agree to the{' '}
          <Link href={PUBLIC_ROUTES.terms} className="ob-link">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href={PUBLIC_ROUTES.privacy} className="ob-link">
            Privacy Policy
          </Link>
          .
        </p>
      </form>

      <p className="mt-7 text-[13.5px] text-[var(--ob-text-3)]">
        Already have an organization?{' '}
        <Link href={AUTH_ROUTES.login} className="ob-link">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

function SignupAside() {
  return (
    <div className="max-w-[46ch]">
      <p className="ob-label">The first hour</p>
      <h2 className="ob-h3 mt-4">
        Your first dependency check runs on the next interval.
      </h2>
      <ol className="mt-10 flex flex-col">
        {[
          [
            '01',
            'Add an endpoint',
            'The URL of an external service, the regions, the interval.',
          ],
          [
            '02',
            'Observation begins',
            'Checks run from independent infrastructure. Every result is kept.',
          ],
          [
            '03',
            'Evidence accumulates',
            'When the dependency fails, the record already exists.',
          ],
        ].map(([index, term, desc]) => (
          <li key={index} className="border-t border-[var(--ob-line)] py-5">
            <p className="ob-label flex items-center gap-3">
              <span className="text-[var(--ob-signal)]">{index}</span>
              <span aria-hidden className="h-px w-5 bg-[var(--ob-line-2)]" />
              {term}
            </p>
            <p className="mt-2 text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">
              {desc}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
