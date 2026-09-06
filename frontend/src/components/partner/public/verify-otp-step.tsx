'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { readApiError } from '@/lib/api-error';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

export type VerifiedSession = {
  tokens: { access_token: string; refresh_token: string };
  user: { id: string; email: string; full_name: string };
  organization: { id: string; name: string; slug: string; plan: string } | null;
};

type Props = {
  /** Address the code was sent to. */
  email: string;
  /** Called with the session issued by a successful verification. */
  onVerified: (session: VerifiedSession) => void | Promise<void>;
  /** Back link - returns to the signup or login form. */
  onBack?: () => void;
  backLabel?: string;
  title?: string;
  /**
   * Send a code as soon as the step mounts. Off by default: `/register` and
   * a blocked `/login` both already send one, and a duplicate request would
   * only trip the 60s per-account cooldown.
   */
  autoSend?: boolean;
};

/**
 * The signup email-verification step.
 *
 * Email verification is a HARD GATE: the account created by `/register` holds
 * no session until the code emailed to it is submitted here. On success the
 * backend issues the tokens, so this component completes the sign-in.
 */
export function VerifyOtpStep({
  email,
  onVerified,
  onBack,
  backLabel = 'Back',
  title = 'Check your email',
  autoSend = false,
}: Props) {
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(autoSend ? 0 : RESEND_COOLDOWN_SECONDS);
  // Guards React 18 StrictMode's double-mount from sending two codes.
  const autoSentRef = useRef(false);
  // Guards the auto-submit from firing twice for one filled-in code.
  const submittedRef = useRef('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const resend = useCallback(
    async (silent = false) => {
      setResending(true);
      setError(null);
      try {
        const res = await fetch('/api/auth/resend-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        if (!res.ok) {
          const apiError = await readApiError(res, 'Could not send a new code.');
          // 429 means a code is already in flight - that is not a failure the
          // user needs to act on, they just have to wait.
          if (!silent) toast.error(apiError.message);
          setCooldown(RESEND_COOLDOWN_SECONDS);
          return;
        }
        setCooldown(RESEND_COOLDOWN_SECONDS);
        if (!silent) toast.success(`New code sent to ${email}`);
      } catch {
        if (!silent) toast.error("We couldn't reach RELIASTRA. Check your connection.");
      } finally {
        setResending(false);
      }
    },
    [email]
  );

  useEffect(() => {
    if (!autoSend || autoSentRef.current) return;
    autoSentRef.current = true;
    void resend(true);
  }, [autoSend, resend]);

  const submit = useCallback(
    async (value: string) => {
      if (value.length !== CODE_LENGTH || verifying) return;
      submittedRef.current = value;
      setVerifying(true);
      setError(null);
      try {
        const res = await fetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code: value }),
        });

        if (!res.ok) {
          const apiError = await readApiError(res, 'That code did not work.');
          setError(apiError.message);
          setCode('');
          submittedRef.current = '';
          return;
        }

        const session = (await res.json()) as VerifiedSession;
        await onVerified(session);
      } catch {
        setError("We couldn't reach RELIASTRA. Check your connection and try again.");
        submittedRef.current = '';
      } finally {
        setVerifying(false);
      }
    },
    [email, onVerified, verifying]
  );

  const handleChange = (value: string) => {
    setCode(value);
    if (error) setError(null);
    // Submit as soon as the last digit lands - no extra click needed.
    if (value.length === CODE_LENGTH && submittedRef.current !== value) {
      void submit(value);
    }
  };

  return (
    <div className="w-full">
      <p className="ob-label text-[var(--ob-signal)]">Email verification</p>
      <h1 className="ob-h2 mt-4 text-[clamp(1.75rem,4vw,2.25rem)]">{title}</h1>
      <p className="ob-body mt-4 text-[14.5px]">
        A {CODE_LENGTH}-digit code was sent to{' '}
        <span className="ob-mono text-[var(--ob-text)]">{email}</span>. Enter it
        below to activate your account.
      </p>

      {error && (
        <div role="alert" className="ob-alert ob-alert-error mt-6">
          {error}
        </div>
      )}

      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(code);
        }}
      >
        <label htmlFor="otp-code" className="ob-field-label">
          Verification code
        </label>
        <InputOTP
          id="otp-code"
          maxLength={CODE_LENGTH}
          value={code}
          onChange={handleChange}
          disabled={verifying}
          autoFocus
          containerClassName="justify-start"
          aria-describedby="otp-help"
        >
          <InputOTPGroup>
            {Array.from({ length: CODE_LENGTH }, (_, i) => (
              <InputOTPSlot key={i} index={i} />
            ))}
          </InputOTPGroup>
        </InputOTP>
        <p id="otp-help" className="ob-help">
          The code expires shortly after it is sent.
        </p>

        <button
          type="submit"
          disabled={verifying || code.length !== CODE_LENGTH}
          aria-busy={verifying}
          className="ob-btn ob-btn-signal ob-btn-block mt-7"
        >
          {verifying ? 'Verifying…' : 'Verify email'}
        </button>
      </form>

      <p className="mt-7 text-[13.5px] leading-[1.6] text-[var(--ob-text-3)]">
        Didn&apos;t receive it? Check your spam folder, or{' '}
        <button
          type="button"
          onClick={() => void resend()}
          disabled={resending || cooldown > 0}
          className="font-medium text-[var(--ob-text)] underline decoration-[var(--ob-line-3)] underline-offset-4 transition-colors hover:text-[var(--ob-signal)] disabled:cursor-not-allowed disabled:text-[var(--ob-text-4)] disabled:no-underline"
        >
          {cooldown > 0 ? `resend in ${cooldown}s` : 'resend the code'}
        </button>
        .
      </p>

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="ob-label mt-6 transition-colors hover:text-[var(--ob-signal)]"
        >
          ← {backLabel}
        </button>
      )}
    </div>
  );
}
