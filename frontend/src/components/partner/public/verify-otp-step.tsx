'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
  /** Back link — returns to the signup or login form. */
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
          // 429 means a code is already in flight — that is not a failure the
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
    // Submit as soon as the last digit lands — no extra click needed.
    if (value.length === CODE_LENGTH && submittedRef.current !== value) {
      void submit(value);
    }
  };

  return (
    <div className="w-full">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-6 flex size-10 items-center justify-center rounded-full border border-border/60 bg-muted/40">
          <MailCheck className="size-5 text-foreground" aria-hidden />
        </div>

        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We sent a {CODE_LENGTH}-digit code to{' '}
          <span className="font-medium text-foreground">{email}</span>. Enter it
          below to activate your account.
        </p>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            role="alert"
            className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400"
          >
            {error}
          </motion.div>
        )}

        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(code);
          }}
        >
          <label
            htmlFor="otp-code"
            className="mb-2 block font-mono text-xs uppercase tracking-wider text-muted-foreground"
          >
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
          >
            <InputOTPGroup>
              {Array.from({ length: CODE_LENGTH }, (_, i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>

          <Button
            type="submit"
            disabled={verifying || code.length !== CODE_LENGTH}
            className="mt-6 w-full"
          >
            {verifying ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Verifying...
              </>
            ) : (
              'VERIFY EMAIL'
            )}
          </Button>
        </form>

        <div className="mt-6 text-sm text-muted-foreground">
          Didn&apos;t get it? Check your spam folder, or{' '}
          <button
            type="button"
            onClick={() => void resend()}
            disabled={resending || cooldown > 0}
            className="font-medium text-foreground underline-offset-4 transition-colors hover:underline disabled:cursor-not-allowed disabled:font-normal disabled:text-muted-foreground disabled:no-underline"
          >
            {cooldown > 0 ? `resend in ${cooldown}s` : 'resend the code'}
          </button>
          .
        </div>

        {onBack && (
          <div className="mt-4">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3" />
              {backLabel}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
