'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Loader2, ShieldAlert } from 'lucide-react';
import { BrandMark } from '@/components/auth/brand-mark';
import { adminApi, isAdminApiError } from '@/lib/admin-api';

export const dynamic = 'force-dynamic';

/**
 * Dedicated administrator sign-in.
 *
 * This is the ONLY entry point to the admin control plane. It is NOT the
 * customer sign-in: the form exchanges the operator credentials
 * (ADMIN_USERNAME / ADMIN_PASSWORD, kept in the backend environment, never
 * in the database and never attached to a user account) for a session that
 * lives in HttpOnly admin cookies. The customer/partner token is never
 * involved — and the admin token can never be used on customer surfaces.
 */

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'The administrator username or password is incorrect.',
  FORBIDDEN: 'The admin console is disabled on this deployment.',
  RATE_LIMIT_EXCEEDED: 'Too many attempts. Wait a few minutes and try again.',
  SERVICE_UNAVAILABLE: 'The admin console is not initialized. Contact the deployment owner.',
  BACKEND_UNAVAILABLE: 'Could not reach the RELIASTRA API. Check your connection and retry.',
};

function AdminLoginPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('Enter the administrator username and password.');
      return;
    }
    setLoading(true);
    try {
      await adminApi.login(username.trim(), password);
      // Only a same-origin admin destination is acceptable; `/admin/login`
      // must never bounce into a customer surface (or an open redirect).
      const destination = next && next.startsWith('/admin') && !next.startsWith('/admin/login')
        ? next
        : '/admin';
      router.replace(destination);
    } catch (cause) {
      if (isAdminApiError(cause)) {
        setError(ERROR_MESSAGES[cause.code ?? ''] ?? cause.message);
      } else {
        setError('Could not reach Reliastra. Check your connection and retry.');
      }
    } finally {
      setLoading(false);
    }
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
            <p className="rs-eyebrow">Restricted console</p>
            <h1 className="rs-page-title mt-2">Administrator sign in</h1>
            <p className="rs-secondary-body mt-2">
              The RELIASTRA control plane is only reachable with the dedicated
              operator credentials. Customer and partner accounts cannot
              access this console.
            </p>

            <div
              role="status"
              className="mt-6 flex items-start gap-2.5 rounded-[10px] border border-rs-border-subtle bg-rs-elevated px-4 py-3 text-[13px] leading-relaxed text-rs-text-secondary"
            >
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-rs-text-tertiary" aria-hidden />
              <span>
                Every sign-in is recorded on the admin audit trail. Failed attempts are
                rate-limited per network.
              </span>
            </div>

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
                <label htmlFor="admin-username" className="rs-label mb-1.5 block">
                  Administrator username
                </label>
                <input
                  id="admin-username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  className="rs-input"
                  placeholder="operator"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="admin-password" className="rs-label mb-1.5 block">
                  Password
                </label>
                <input
                  id="admin-password"
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
                    Verifying…
                  </>
                ) : (
                  <>
                    Open admin console
                    <ArrowRight size={16} aria-hidden />
                  </>
                )}
              </button>
            </form>

            <p className="rs-secondary-body mt-6">
              Signed in as a customer or partner?{' '}
              <Link href="/dashboard" className="font-medium text-rs-brand hover:underline">
                Continue to your console
              </Link>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-rs-border-subtle pt-4">
          <p className="text-xs text-rs-text-tertiary">
            No password reset is available for the operator credential.
          </p>
        </div>
      </div>

      {/* Proof column */}
      <aside className="relative hidden flex-1 border-l border-rs-border-subtle bg-rs-elevated lg:block">
        <div className="grid-pattern absolute inset-0" aria-hidden />
        <div className="relative flex h-full flex-col justify-between p-14">
          <div className="rs-mono text-xs text-rs-text-tertiary">
            reliastra.com/admin
          </div>
          <div className="max-w-lg">
            <p className="rs-eyebrow">Operator access</p>
            <h2 className="mt-3 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-rs-text">
              The command center is not part of any customer account.
            </h2>
            <dl className="mt-10 space-y-6">
              {[
                ['Dedicated credentials', 'Operator username and password kept in deployment secrets — never a user row.'],
                ['Isolated sessions', 'Admin tokens cannot be used on customer surfaces, and customer tokens are rejected here.'],
                ['Every action audited', 'Sign-ins, sign-outs, and privileged operations land on the admin audit trail.'],
              ].map(([term, desc]) => (
                <div key={term} className="border-l-2 border-rs-border pl-4">
                  <dt className="text-sm font-semibold text-rs-text">{term}</dt>
                  <dd className="rs-secondary-body mt-1">{desc}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rs-mono text-xs text-rs-text-tertiary">
            Restricted to authorized operators · Rate-limited
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AdminLoginPageContent />
    </Suspense>
  );
}
