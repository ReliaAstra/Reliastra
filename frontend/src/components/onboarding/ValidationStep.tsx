'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, XCircle } from 'lucide-react';
import { api } from '@/lib/dashboard/api';
import { RsButton } from '@/components/dashboard/ui/button';
import { cn } from '@/lib/utils';

type Status = 'checking' | 'reachable' | 'unreachable' | 'auth' | 'invalid' | 'monitoring' | 'awaiting';

export function ValidationStep({
  dependencyId,
  onValidated,
  onRetry,
}: {
  dependencyId: string;
  onValidated: () => void;
  onRetry: () => void;
}) {
  const [status, setStatus] = useState<Status>('checking');
  const [detail, setDetail] = useState<string>('Checking endpoint…');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        setStatus('checking');
        setDetail('Checking endpoint — validating URL and region reachability…');
        // Small delay so the UI step is perceivable and not flashing
        await new Promise((r) => setTimeout(r, 900));
        if (cancelled) return;

        const results = await api.dependencyResults(dependencyId);
        const latest = (results as any[])?.[0];
        if (cancelled) return;

        if (!latest) {
          setStatus('awaiting');
          setDetail('Monitoring configured — awaiting first observation (next tick)…');
          // retry in a few seconds
          timer = setTimeout(() => setAttempt((a) => a + 1), 3000);
          return;
        }

        if (latest.is_up) {
          setStatus('monitoring');
          setDetail(`Connection successful — ${latest.status_code ?? 200} from ${latest.region}. Monitoring is active.`);
          return;
        }

        const msg: string = latest.error_message || '';
        if (/blocked/i.test(msg)) {
          setStatus('invalid');
          setDetail(msg);
        } else if (/auth/i.test(msg) || latest.status_code === 401 || latest.status_code === 403) {
          setStatus('auth');
          setDetail('Authentication required — endpoint returned 401/403. Check headers or allow anonymous health endpoint.');
        } else if (latest.status_code && latest.status_code >= 400) {
          setStatus('unreachable');
          setDetail(`Endpoint returned ${latest.status_code}. Expected 200. Check the URL or expected status codes.`);
        } else {
          setStatus('unreachable');
          setDetail(msg || 'Endpoint unreachable — check the URL, DNS, and that it is public.');
        }
      } catch (e: any) {
        if (!cancelled) {
          setStatus('unreachable');
          setDetail(e?.message || 'Validation failed — retry or edit the dependency.');
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dependencyId, attempt]);

  const isOk = status === 'monitoring' || status === 'reachable';
  const isAwaiting = status === 'awaiting' || status === 'checking';

  return (
    <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-6 sm:p-7">
      <div className="mb-6">
        <p className="rs-eyebrow">Step 3 · Validation</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-rs-text">Validating your endpoint…</h2>
        <p className="mt-2 text-sm leading-relaxed text-rs-text-secondary">
          We check reachability from multiple regions and confirm the expected status. No synthetic “healthy” state is shown without verification.
        </p>
      </div>

      <div className="space-y-3">
        {[
          ['Checking endpoint', status === 'checking'],
          ['Connection successful', status === 'reachable' || status === 'monitoring'],
          ['Monitoring configured', status === 'monitoring' || status === 'awaiting'],
          ['First observation received', status === 'monitoring'],
        ].map(([label, done]) => (
          <div key={label as string} className="flex items-center gap-3 rounded-[10px] border border-rs-border-subtle bg-rs-base px-4 py-3">
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full border',
                done ? 'border-rs-up bg-rs-up-bg text-rs-up' : 'border-rs-border-subtle bg-rs-elevated text-rs-text-tertiary'
              )}
            >
              {done ? <CheckCircle2 size={14} /> : <Loader2 size={14} className={isAwaiting && label === 'Checking endpoint' ? 'animate-spin' : 'opacity-50'} />}
            </span>
            <span className={cn('text-sm', done ? 'font-medium text-rs-text' : 'text-rs-text-secondary')}>{label as string}</span>
          </div>
        ))}
      </div>

      <div
        className={cn(
          'mt-5 rounded-[10px] border px-4 py-3 text-sm leading-relaxed',
          isOk
            ? 'border-rs-up/25 bg-rs-up-bg text-rs-up'
            : status === 'awaiting' || status === 'checking'
              ? 'border-rs-border-subtle bg-rs-base text-rs-text-secondary'
              : 'border-rs-down/25 bg-rs-down-bg text-rs-down'
        )}
      >
        <div className="flex gap-2">
          {isOk ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : isAwaiting ? <Loader2 size={16} className="mt-0.5 animate-spin" /> : <XCircle size={16} className="mt-0.5" />}
          <span>{detail}</span>
        </div>
        {!isOk && status !== 'checking' && (
          <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
            <li>Private/internal hosts (10/8, 172.16/12, 192.168/16, localhost) are blocked.</li>
            <li>If your health endpoint requires auth, expose an unauthenticated `/health` or add headers via advanced settings.</li>
          </ul>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-rs-border-subtle pt-5">
        <RsButton variant="secondary" onClick={onRetry}>
          Edit dependency
        </RsButton>
        <RsButton onClick={onValidated} disabled={!isOk && status !== 'awaiting'}>
          {status === 'awaiting' ? 'Continue — monitoring active' : isOk ? 'Continue' : 'Continue anyway'}
        </RsButton>
      </div>
    </div>
  );
}
