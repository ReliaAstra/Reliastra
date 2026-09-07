'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  AuthAlert,
  AuthSubmit,
  Field,
} from '@/components/site/auth/auth-shell';
import { partnerUrl } from '@/lib/routes';

/**
 * Partner password reset request.
 *
 * Anti-enumeration is the whole design of this screen: the request is fired,
 * network failures are swallowed, and the confirmation is worded identically
 * whether or not the address exists. Nothing in the UI - copy, timing or
 * state - may distinguish a known address from an unknown one.
 */
export function PageForgotPassword() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);

    if (!email.trim()) {
      setFieldError('Enter the email address on your partner account.');
      return;
    }

    setLoading(true);

    try {
      try {
        await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim() }),
        });
      } catch {
        // Swallowed deliberately. A visible network error here would leak
        // timing information and help nobody: the confirmation below is the
        // same in every case.
      }

      setSubmitted(true);
      toast.success('Request received');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ob-container-narrow">
      <div className="mx-auto w-full max-w-[400px]">
        <p className="ob-label text-[var(--ob-signal)]">Partner network</p>
        <h1 className="ob-h2 mt-4 text-[clamp(1.75rem,4vw,2.25rem)]">
          Reset your password.
        </h1>

        {submitted ? (
          <>
            <div className="mt-8">
              <AuthAlert tone="ok">
                If that address has an account, a reset link is on its way.
              </AuthAlert>
            </div>
            <p className="ob-body mt-6 text-[14.5px]">
              We sent it to{' '}
              <span className="ob-mono text-[var(--ob-text-2)]">{email}</span>{' '}
              if a partner account exists there. The link expires; request
              another if it does.
            </p>
            <div className="mt-8">
              <Link
                href={partnerUrl('login')}
                className="ob-btn ob-btn-signal ob-btn-block"
              >
                Return to sign in
              </Link>
            </div>
            <p className="ob-small mt-6">
              Nothing arrived? Check spam, then{' '}
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="ob-link"
              >
                try a different address
              </button>
              .
            </p>
          </>
        ) : (
          <>
            <p className="ob-body mt-4 text-[14.5px]">
              Enter the email on your partner account and we will send a reset
              link. For a monitoring account, use{' '}
              <Link href="/login" className="ob-link">
                customer sign in
              </Link>
              .
            </p>

            {fieldError && (
              <div className="mt-8">
                <AuthAlert tone="error">{fieldError}</AuthAlert>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-9 flex flex-col gap-6">
              <Field
                id="partner-forgot-email"
                label="Work email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
                required
              />
              <AuthSubmit loading={loading} loadingLabel="Sending…">
                Send reset link
              </AuthSubmit>
            </form>

            <p className="ob-small mt-8 border-t border-[var(--ob-line)] pt-6">
              Remembered it?{' '}
              <Link href={partnerUrl('login')} className="ob-link">
                Sign in
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}
