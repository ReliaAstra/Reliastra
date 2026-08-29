'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { BrandMark } from '@/components/auth/brand-mark';

interface RegisterResponse {
  user?: { id: string; email: string };
  organization?: { id: string; name: string };
  tokens?: { access_token: string; refresh_token: string };
  access_token?: string;
  refresh_token?: string;
  detail?: string;
}

export default function CustomerSignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordOk = password.length >= 8;

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
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          password,
        }),
      });
      const data: RegisterResponse = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = data?.detail ?? '';
        setError(
          /already/i.test(detail)
            ? 'An account with this email already exists. Sign in instead.'
            : detail || 'Registration failed. Try again in a moment.'
        );
        return;
      }
      const refresh = data.tokens?.refresh_token ?? data.refresh_token;
      if (refresh) {
        localStorage.setItem('reliastra_refresh_token', refresh);
      }
      // New enterprise onboarding: land directly in the guided setup
      // If verification is required, the API will return no tokens — send to verify-email
      const needsVerify = (data as any)?.verification_required === true || !refresh;
      if (needsVerify) {
        const emailParam = encodeURIComponent(email.trim());
        router.push(`/verify-email?email=${emailParam}`);
      } else {
        // Start the premium onboarding journey immediately (state is resumable)
        try {
          localStorage.removeItem('reliastra_onboarding_v2'); // fresh start
          localStorage.removeItem('reliastra_dismiss_trial_banner');
        } catch {}
        router.push('/onboarding');
      }
    } catch {
      setError('Could not reach Reliastra. Check your connection and retry.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rs-app flex min-h-screen">
      <div className="flex w-full flex-col px-6 py-8 lg:w-[480px] lg:shrink-0 lg:px-14">
        <Link href="/" aria-label="Reliastra home" className="inline-flex items-center gap-2.5">
          <BrandMark size={26} />
        </Link>

        <div className="flex flex-1 items-center">
          <div className="w-full max-w-sm">
            <p className="rs-eyebrow">Create your organization</p>
            <h1 className="rs-page-title mt-2">Start monitoring in minutes</h1>
            <p className="rs-secondary-body mt-2">
              14-day Professional trial. No card required — every feature,
              every region.
            </p>

            {error && (
              <div
                role="alert"
                className="mt-6 rounded-[10px] border border-rs-down/25 bg-rs-down-bg px-4 py-3 text-[13px] leading-relaxed text-rs-down"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <div>
                <label htmlFor="fullName" className="rs-label mb-1.5 block">
                  Full name
                </label>
                <input
                  id="fullName"
                  type="text"
                  autoComplete="name"
                  autoFocus
                  className="rs-input"
                  placeholder="Alex Rivera"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="email" className="rs-label mb-1.5 block">
                  Work email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="rs-input"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="password" className="rs-label mb-1.5 block">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  className="rs-input"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby="password-help"
                />
                <p
                  id="password-help"
                  className={`rs-input-helper ${password && !passwordOk ? 'text-rs-degraded' : ''}`}
                  data-error={Boolean(password) && !passwordOk}
                >
                  {password && !passwordOk
                    ? 'Too short — use at least 8 characters.'
                    : 'Used only for your account. We never share it.'}
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="rs-button rs-button-primary rs-button-lg w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Creating organization…
                  </>
                ) : (
                  <>
                    Create organization
                    <ArrowRight size={16} aria-hidden />
                  </>
                )}
              </button>

              <p className="text-xs leading-relaxed text-rs-text-tertiary">
                By continuing you agree to the{' '}
                <Link href="/terms" className="text-rs-text-secondary hover:text-rs-text">
                  Terms
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-rs-text-secondary hover:text-rs-text">
                  Privacy Policy
                </Link>
                .
              </p>
            </form>

            <p className="rs-secondary-body mt-6">
              Already have an organization?{' '}
              <Link href="/login" className="font-medium text-rs-brand hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-rs-border-subtle pt-4">
          <p className="text-xs text-rs-text-tertiary">
            Distribution or agency partner?{' '}
            <Link href="/?page=signup" className="text-rs-text-secondary hover:text-rs-text">
              Apply to the partner network
            </Link>
          </p>
        </div>
      </div>

      <aside className="relative hidden flex-1 border-l border-rs-border-subtle bg-rs-elevated lg:block">
        <div className="grid-pattern absolute inset-0" aria-hidden />
        <div className="relative flex h-full flex-col justify-between p-14">
          <div className="rs-mono text-xs text-rs-text-tertiary">
            reliastra.com/signup
          </div>
          <div className="max-w-lg">
            <p className="rs-eyebrow">What you get on day one</p>
            <h2 className="mt-3 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-rs-text">
              Your first dependency check runs before your coffee cools.
            </h2>
            <dl className="mt-10 space-y-6">
              {[
                ['Add an endpoint', 'Paste a URL, pick regions and interval. Checks start on the next tick.'],
                ['Watch the network', 'Live vendor posture from Reliastra’s public monitoring fleet.'],
                ['Prove what happened', 'When a vendor fails, attribution and evidence are generated for you.'],
              ].map(([term, desc]) => (
                <div key={term} className="border-l-2 border-rs-border pl-4">
                  <dt className="text-sm font-semibold text-rs-text">{term}</dt>
                  <dd className="rs-secondary-body mt-1">{desc}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rs-mono text-xs text-rs-text-tertiary">
            No credit card · Cancel anytime · Export your data
          </div>
        </div>
      </aside>
    </div>
  );
}
