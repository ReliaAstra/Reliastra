'use client';

import { useEffect, useState } from 'react';
import { FileCheck, Search, Timer, ShieldCheck, ArrowRight } from 'lucide-react';
import { api } from '@/lib/dashboard/api';
import { RsButton } from '@/components/dashboard/ui/button';
import { useAppStore } from '@/stores/app-store';
import { hasEvidenceForOrg } from '@/lib/dashboard/plans';
import { analytics } from '@/lib/analytics';

export function EvidenceIntroStep({ onNext }: { onNext: () => void }) {
  const plan = useAppStore((s) => s.plan);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const canEvidence = hasEvidenceForOrg(plan);
  const [incidents, setIncidents] = useState<any[] | null>(null);
  const [example, setExample] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.incidents({ limit: 3 });
        if (!cancelled) setIncidents(data as any[]);
      } catch {
        if (!cancelled) setIncidents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasReal = Boolean(incidents && incidents.length > 0);

  return (
    <div className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-6 sm:p-7">
      <div className="mb-6">
        <p className="rs-eyebrow">Step 5 · Evidence</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-rs-text">How Reliastra builds evidence.</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-rs-text-secondary">
          Observation alone is not evidence. When multiple regions agree a dependency degraded, Reliastra creates an incident, correlates it, and generates a timestamped, checksummed report you can submit to a vendor or SLA review.
        </p>
      </div>

      {/* Pipeline */}
      <div className="rounded-xl border border-rs-border-subtle bg-rs-base p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          {[
            ['Observation', Search],
            ['Anomaly', Timer],
            ['Incident', ShieldCheck],
            ['Evidence', FileCheck],
            ['Report', FileCheck],
          ].map(([label, Icon], i) => (
            <span key={label as string} className="inline-flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rs-border-subtle bg-rs-elevated px-2.5 py-1">
                <Icon size={12} className="text-rs-brand" /> {label as string}
              </span>
              {i < 4 && <ArrowRight size={12} className="text-rs-text-tertiary" />}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-rs-text-tertiary">
          <span className="font-medium text-rs-text">Monitoring tells you something is wrong. Reliastra helps you establish independent evidence about what happened and whether an external dependency contributed.</span>
        </p>
      </div>

      {/* Real vs example */}
      <div className="mt-5">
        {hasReal ? (
          <div className="rounded-[10px] border border-rs-border-subtle bg-rs-base p-4">
            <div className="flex items-center justify-between">
              <span className="rs-label">Latest incident — real</span>
              <span className="rounded-full bg-rs-up-bg px-2 py-0.5 text-[11px] font-medium text-rs-up">Live</span>
            </div>
            <ul className="mt-3 space-y-2">
              {incidents!.slice(0, 2).map((inc: any) => (
                <li key={inc.id} className="rounded-lg border border-rs-border-subtle bg-rs-elevated px-3 py-2.5">
                  <div className="font-mono text-xs font-medium text-rs-text-accent">{inc.display_id ?? inc.id.slice(0, 8)}</div>
                  <div className="mt-1 text-sm font-medium text-rs-text">{inc.title ?? inc.root_cause}</div>
                  <div className="text-xs text-rs-text-tertiary">{inc.severity} · {inc.status}</div>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <RsButton variant="secondary" onClick={() => { analytics.evidenceViewed({ source: 'onboarding_real' }); window.location.href = '/evidence'; }}>
                Explore evidence
              </RsButton>
              <RsButton onClick={onNext}>Continue</RsButton>
            </div>
          </div>
        ) : (
          <div>
            <div className="rounded-[10px] border border-rs-border-subtle bg-rs-base p-4">
              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
                Example investigation — clearly labelled demonstration
              </span>
              <h3 className="mt-3 text-sm font-semibold text-rs-text">Stripe API — 9 min degradation, 2026-05-12</h3>
              <p className="mt-1 text-xs leading-relaxed text-rs-text-tertiary">
                This is demonstration data, not from your infrastructure. It shows exactly what you’ll receive when a real incident occurs.
              </p>
              <div className="mt-4 space-y-2 text-sm">
                {[
                  ['14:02 UTC', 'Multi-region latency spike (>800 ms) — eu-west, us-east'],
                  ['14:04 UTC', 'Quorum confirmed — 3 regions agree, incident opened (major)'],
                  ['14:07 UTC', 'Regional comparison — eu-west degraded, us-west unaffected'],
                  ['14:11 UTC', 'Evidence generated — SHA256 checksummed, JSON + PDF'],
                ].map(([t, d]) => (
                  <div key={t} className="flex gap-3">
                    <span className="rs-mono shrink-0 text-xs font-medium text-rs-text-tertiary">{t}</span>
                    <span className="text-xs leading-relaxed text-rs-text-secondary">{d}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => setExample((v) => !v)}
                  className="text-xs font-medium text-rs-brand hover:underline"
                >
                  {example ? 'Hide report preview' : 'Preview evidence report'}
                </button>
                <span className="text-xs text-rs-text-tertiary">· deterministic attribution, timeline, regional comparison</span>
              </div>
              {example && (
                <div className="mt-3 rounded-lg border border-rs-border-subtle bg-rs-elevated p-3 font-mono text-xs leading-relaxed">
                  <div>verification_id: ex_9f3a2…</div>
                  <div>checksum: sha256:4a7c…</div>
                  <div>regions: us-east: degraded, eu-west: degraded, ap-south: operational</div>
                  <div>uptime 24h: 99.42%</div>
                </div>
              )}
            </div>

            {!canEvidence && (
              <div className="mt-4 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/30 dark:bg-amber-950/20">
                <p className="text-sm font-medium text-rs-text">Evidence reports are a Standard feature</p>
                <p className="mt-1 text-xs leading-relaxed text-rs-text-secondary">
                  You can generate evidence during your Professional evaluation. On Free, you’ll see incidents and timelines; full reports resume on upgrade. No paywall before you’ve seen the value.
                </p>
                <button onClick={() => { analytics.upgradeViewed({ source: 'onboarding_evidence' }); openUpgrade('evidence'); }} className="mt-2 text-xs font-medium text-rs-brand hover:underline">
                  View what Standard unlocks →
                </button>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <RsButton onClick={() => { analytics.evidenceViewed({ source: 'onboarding_example' }); onNext(); }}>Continue — I understand the flow</RsButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
