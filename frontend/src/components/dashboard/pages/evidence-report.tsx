'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  CircleAlert,
  Clock,
  FileSearch,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

interface VerifyResult {
  found: boolean;
  error?: string;
  service_degraded?: boolean;
  incident_id?: string;
  dependency_id?: string;
  org_id?: string;
  time_window?: { start: string; end: string };
  data_hash?: string;
  report_checksum?: string;
  methodology_version?: string;
  created_at?: string;
}

const STATES = {
  loading: 'loading',
  valid: 'valid',
  invalid: 'invalid',
  degraded: 'degraded',
} as const;

function formatUtc(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC';
}

/**
 * Evidence verification surface.
 *
 * A report link carries a verification id; the backend's public
 * ``/v1/verify/{id}`` endpoint is the single source of truth for whether the
 * snapshot exists and what it contains. Nothing here is inferred or
 * fabricated — an unknown token simply does not verify.
 */
export function EvidenceReportPage({ token }: { token: string }) {
  const [state, setState] = useState<(typeof STATES)[keyof typeof STATES]>(STATES.loading);
  const [result, setResult] = useState<VerifyResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/verify/${encodeURIComponent(token)}`);
        if (!res.ok && res.status !== 404 && res.status !== 503) {
          throw new Error(String(res.status));
        }
        const data = (await res.json()) as VerifyResult;
        if (cancelled) return;
        setResult(data);
        setState(
          data.found ? STATES.valid : data.service_degraded ? STATES.degraded : STATES.invalid
        );
      } catch {
        if (!cancelled) setState(STATES.degraded);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-white text-[#0F172A]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <header className="sticky top-0 z-10 border-b border-[#E2E8F0] bg-white px-6 py-3">
        <div className="mx-auto flex max-w-[760px] items-center justify-between">
          <Link href="/" className="text-sm font-semibold tracking-[-0.02em]">
            Reliastra
          </Link>
          <span className="font-mono text-xs text-[#94A3B8]">Evidence verification</span>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-6 py-16">
        {state === STATES.loading && (
          <div className="flex flex-col items-center py-20 text-center">
            <Loader2 className="size-6 animate-spin text-[#2563EB]" />
            <p className="mt-4 text-sm text-[#64748B]">Verifying evidence…</p>
          </div>
        )}

        {state === STATES.valid && result && (
          <div>
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-full bg-[#ECFDF5] text-[#059669]">
                <BadgeCheck className="size-6" />
              </span>
              <div>
                <h1 className="text-xl font-semibold tracking-[-0.02em]">Evidence verified</h1>
                <p className="mt-0.5 text-sm text-[#64748B]">
                  This reference matches a cryptographically checksummed evidence snapshot held by RELIASTRA.
                </p>
              </div>
            </div>

            <dl className="mt-8 divide-y divide-[#E2E8F0] rounded-xl border border-[#E2E8F0]">
              {[
                ['Incident ID', result.incident_id],
                ['Dependency ID', result.dependency_id],
                ['Window start', formatUtc(result.time_window?.start)],
                ['Window end', formatUtc(result.time_window?.end)],
                ['Data hash', result.data_hash],
                ['Report checksum', result.report_checksum],
                ['Methodology', result.methodology_version],
                ['Recorded at', formatUtc(result.created_at)],
              ].map(([label, value]) => (
                <div key={label as string} className="grid grid-cols-[160px_1fr] gap-3 px-5 py-3">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#94A3B8]">{label}</dt>
                  <dd className="break-all font-mono text-sm text-[#0F172A]">{value || '—'}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-[#64748B]">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#059669]" />
              Verification confirms that the referenced snapshot exists in RELIASTRA&apos;s evidence
              store and binds the stated hash and checksum. Full narrative reports are available to
              the issuing organization inside the RELIASTRA console.
            </p>
          </div>
        )}

        {(state === STATES.invalid || state === STATES.degraded) && (
          <div className="flex flex-col items-center py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-[#FEF2F2] text-[#DC2626]">
              {state === STATES.degraded ? <Clock className="size-6" /> : <CircleAlert className="size-6" />}
            </span>
            <h1 className="mt-5 text-xl font-semibold tracking-[-0.02em]">
              {state === STATES.degraded ? 'Verification unavailable' : 'Evidence not found'}
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#64748B]">
              {state === STATES.degraded
                ? 'The verification service could not be reached. Please try again in a few moments.'
                : 'No evidence snapshot matches this reference. The link may be incorrect, or the report may have been revoked.'}
            </p>
            <div className="mt-6 flex items-center gap-2">
              {state === STATES.degraded ? (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded-lg bg-[#0A0A0F] px-4 py-2 text-sm font-medium text-white hover:bg-[#1A1A2F]"
                >
                  Retry
                </button>
              ) : null}
              <Link
                href="/"
                className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm text-[#334155] hover:bg-[#F8FAFC]"
              >
                <FileSearch className="size-4" />
                About RELIASTRA evidence
              </Link>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-[#E2E8F0] px-6 py-6">
        <p className="mx-auto max-w-[760px] text-xs text-[#94A3B8]">
          RELIASTRA generates verifiable SLA evidence from deterministic multi-region checks.
        </p>
      </footer>
    </div>
  );
}
