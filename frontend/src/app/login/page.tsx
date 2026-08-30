'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { BrandMark } from '@/components/auth/brand-mark';
import { useAppStore } from '@/stores/app-store';
import { storeSessionTokens } from '@/lib/session-storage';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  'Invalid email or password': 'Email or password is incorrect.',
  'User account is disabled': 'This account has been deactivated. Contact support.',
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERRORS[data?.detail ?? ''] ?? 'Email or password is incorrect.');
        return;
      }
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
      setError('Could not reach Reliastra. Check your connection and retry.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError('Enter your email first, then press "Forgot password".');
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
    setNotice('If that address has an account, a reset link is on its way.');
  }

  return (
    <div className="rs-app flex min-h-screen">
      {/* Form column */}
      <div className="flex w-full flex-col px-6 py-8 lg:w-[480px] lg:shrink-0 lg:px-14">
        <Link href="/" aria-label="Reliastra home" className="inline-flex items-center gap-2.5">
          <BrandMark size={26} />
        </Link>

        <div className="flex flex-1 items-center">
          <div className="w-full max-w-sm">
            <p className="rs-eyebrow">Customer sign in</p>
            <h1 className="rs-page-title mt-2">Sign in to Reliastra</h1>
            <p className="rs-secondary-body mt-2">
              External dependency intelligence, incident attribution, and SLA
              evidence for your organization.
            </p>

            {notice && (
              <div
                role="status"
                className="mt-6 rounded-[10px] border border-rs-up/25 bg-rs-up-bg px-4 py-3 text-[13px] leading-relaxed text-rs-up"
              >
                {notice}
              </div>
            )}
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
                <label htmlFor="email" className="rs-label mb-1.5 block">
                  Work email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  className="rs-input"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label htmlFor="password" className="rs-label">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={handleForgot}
                    className="text-xs font-medium text-rs-text-tertiary transition-colors hover:text-rs-brand"
                  >
                    Forgot password
                  </button>
                </div>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  className="rs-input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="rs-button rs-button-primary rs-button-lg w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight size={16} aria-hidden />
                  </>
                )}
              </button>
            </form>

            <p className="rs-secondary-body mt-6">
              New to Reliastra?{' '}
              <Link href="/signup" className="font-medium text-rs-brand hover:underline">
                Create an organization
              </Link>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-rs-border-subtle pt-4">
          <p className="text-xs text-rs-text-tertiary">
            Operating a customer account for an agency?{' '}
            <Link href="/?page=login" className="text-rs-text-secondary hover:text-rs-text">
              Partner sign-in
            </Link>
          </p>
        </div>
      </div>

      {/* Proof column */}
      <aside className="relative hidden flex-1 border-l border-rs-border-subtle bg-rs-elevated lg:block">
        <div className="grid-pattern absolute inset-0" aria-hidden />
        <div className="relative flex h-full flex-col justify-between p-14">
          <div className="rs-mono text-xs text-rs-text-tertiary">
            reliastra.com/console
          </div>
          <div className="max-w-lg">
            <p className="rs-eyebrow">Why teams switch</p>
            <h2 className="mt-3 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-rs-text">
              When the vendor is down, the record is already on your side.
            </h2>
            <dl className="mt-10 space-y-6">
              {[
                ['Independent regions', 'Every dependency checked from multiple regions with quorum confirmation.'],
                ['Deterministic attribution', 'Incidents correlated to vendor behavior with confidence levels — not guesswork.'],
                ['Evidence you can submit', 'Timestamped, checksummed SLA reports accepted by major cloud vendors.'],
              ].map(([term, desc]) => (
                <div key={term} className="border-l-2 border-rs-border pl-4">
                  <dt className="text-sm font-semibold text-rs-text">{term}</dt>
                  <dd className="rs-secondary-body mt-1">{desc}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rs-mono text-xs text-rs-text-tertiary">
            SOC 2-aligned controls · Data retention per plan
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function CustomerLoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}>
      <CustomerLoginPageContent />
    </Suspense>
  );
}
