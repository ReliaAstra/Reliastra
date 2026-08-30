'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VerifyOtpStep, type VerifiedSession } from '@/components/partner/public/verify-otp-step';
import { readApiError } from '@/lib/api-error';
import { useAppStore } from '@/stores/app-store';
import { storeSessionTokens } from '@/lib/session-storage';

type LinkState = 'verifying' | 'verified' | 'failed';

/**
 * Destination for the `?token=` magic link the backend emails
 * (`FRONTEND_BASE_URL/verify-email?token=...`). This route did not exist, so
 * every verification link 404'd.
 *
 * Without a token it doubles as the standalone code-entry screen, which is
 * where a user lands if they close the signup tab before verifying.
 */
function VerifyEmailContent() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const emailParam = params.get('email') ?? '';

  const [linkState, setLinkState] = useState<LinkState>('verifying');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [email, setEmail] = useState(emailParam);
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(
    emailParam || null
  );
  const [done, setDone] = useState(false);
  // StrictMode double-mount guard: a verification token is single-use, so
  // firing twice would report the second call as "already used".
  const consumedRef = useRef(false);

  const verifyToken = useCallback(async (value: string) => {
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: value }),
      });
      if (!res.ok) {
        const apiError = await readApiError(
          res,
          'That verification link is not valid.'
        );
        setLinkError(apiError.message);
        setLinkState('failed');
        return;
      }
      setLinkState('verified');
    } catch {
      setLinkError("We couldn't reach RELIASTRA. Check your connection and try again.");
      setLinkState('failed');
    }
  }, []);

  useEffect(() => {
    if (!token || consumedRef.current) return;
    consumedRef.current = true;
    void verifyToken(token);
  }, [token, verifyToken]);

  const shell = (children: React.ReactNode) => (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-border/60 bg-background p-6 sm:p-8">
        {children}
      </div>
    </main>
  );

  // ── Magic-link flow ──────────────────────────────────────────────
  if (token) {
    if (linkState === 'verifying') {
      return shell(
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Verifying your email...</p>
        </div>
      );
    }
    if (linkState === 'verified') {
      return shell(
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="size-8 text-emerald-500" />
          <h1 className="text-lg font-semibold text-foreground">Email verified</h1>
          <p className="text-sm text-muted-foreground">
            Your address is confirmed. You can sign in now.
          </p>
          <Button asChild className="mt-2 w-full">
            <Link href="/?page=login">Go to sign in</Link>
          </Button>
        </div>
      );
    }
    return shell(
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <XCircle className="size-8 text-red-500" />
        <h1 className="text-lg font-semibold text-foreground">
          Verification failed
        </h1>
        <p className="text-sm text-muted-foreground">{linkError}</p>
        <p className="text-sm text-muted-foreground">
          Enter your email below and we&apos;ll send you a fresh 6-digit code.
        </p>
        <Button
          variant="outline"
          className="mt-2 w-full"
          onClick={() => {
            // Drop the spent ?token= and fall through to the code form.
            router.replace('/verify-email');
          }}
        >
          Use a code instead
        </Button>
      </div>
    );
  }

  // ── Code flow ────────────────────────────────────────────────────
  if (done) {
    return shell(
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CheckCircle2 className="size-8 text-emerald-500" />
        <h1 className="text-lg font-semibold text-foreground">Email verified</h1>
        <p className="text-sm text-muted-foreground">
          Your account is active. Continue to your workspace.
        </p>
        <Button asChild className="mt-2 w-full">
          <Link href="/dashboard">Continue</Link>
        </Button>
      </div>
    );
  }

  if (confirmedEmail) {
    return shell(
      <VerifyOtpStep
        email={confirmedEmail}
        autoSend
        // The OTP exchange issues the session — persist BOTH tokens before
        // showing the "verified" screen so the console is authenticated.
        onVerified={(session: VerifiedSession) => {
          storeSessionTokens(
            session.tokens.access_token,
            session.tokens.refresh_token
          );
          useAppStore.getState().setAccessToken(session.tokens.access_token);
          setDone(true);
        }}
        onBack={() => setConfirmedEmail(null)}
        backLabel="Use a different email"
        title="Verify your email"
      />
    );
  }

  return shell(
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) setConfirmedEmail(email.trim());
      }}
    >
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          Verify your email
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the address you signed up with and we&apos;ll send a 6-digit code.
        </p>
      </div>
      <div className="space-y-2">
        <Label
          htmlFor="verify-email"
          className="font-mono text-xs uppercase tracking-wider"
        >
          Email
        </Label>
        <Input
          id="verify-email"
          type="email"
          required
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>
      <Button type="submit" className="w-full">
        SEND CODE
      </Button>
    </form>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </main>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
