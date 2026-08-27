'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { readApiError } from '@/lib/api-error';

/**
 * Destination for the password-reset email
 * (`FRONTEND_BASE_URL/reset-password?token=...`). Like `/verify-email`, this
 * route did not exist, so every reset link 404'd.
 */
function ResetPasswordContent() {
  const token = useSearchParams().get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const shell = (children: React.ReactNode) => (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-border/60 bg-background p-6 sm:p-8">
        {children}
      </div>
    </main>
  );

  if (!token) {
    return shell(
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <XCircle className="size-8 text-red-500" />
        <h1 className="text-lg font-semibold text-foreground">
          Missing reset token
        </h1>
        <p className="text-sm text-muted-foreground">
          Open the link from your password reset email, or request a new one.
        </p>
        <Button asChild variant="outline" className="mt-2 w-full">
          <Link href="/?page=forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return shell(
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CheckCircle2 className="size-8 text-emerald-500" />
        <h1 className="text-lg font-semibold text-foreground">
          Password updated
        </h1>
        <p className="text-sm text-muted-foreground">
          All other sessions were signed out. Use your new password to sign in.
        </p>
        <Button asChild className="mt-2 w-full">
          <Link href="/?page=login">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Those passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (!res.ok) {
        const apiError = await readApiError(
          res,
          'That reset link is not valid. Request a new one.'
        );
        setError(apiError.message);
        return;
      }
      setDone(true);
    } catch {
      setError("We couldn't reach RELIASTRA. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return shell(
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          Choose a new password
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Minimum 8 characters.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400"
        >
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label
          htmlFor="new-password"
          className="font-mono text-xs uppercase tracking-wider"
        >
          New password
        </Label>
        <Input
          id="new-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="confirm-password"
          className="font-mono text-xs uppercase tracking-wider"
        >
          Confirm password
        </Label>
        <Input
          id="confirm-password"
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      <Button type="submit" disabled={saving} className="w-full">
        {saving ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Updating...
          </>
        ) : (
          'UPDATE PASSWORD'
        )}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </main>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
