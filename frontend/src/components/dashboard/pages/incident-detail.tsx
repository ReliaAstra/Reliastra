'use client';

import { FileText, Lock } from 'lucide-react';
import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { useAppStore } from '@/stores/app-store';
import { hasEvidence } from '@/lib/dashboard/plans';
import { useIncident } from '@/lib/dashboard/queries';
import {
  confidenceFromScore,
  durationBetween,
  formatUtc,
  incidentCode,
} from '@/lib/dashboard/format';
import { mockIncidentDetail } from '@/lib/dashboard/mock';
import { StatusBadge } from '../ui/status-badge';
import { RsButton } from '../ui/button';
import { HelpTooltip } from '../ui/help-tooltip';
import { RsSkeleton } from '../ui/skeleton';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

const DOT: Record<string, string> = {
  detection: '#EF4444',
  vendor_spike: '#F59E0B',
  confirmation: '#2563EB',
  resolution: '#10B981',
};

export function IncidentDetailPage({ id }: { id: string }) {
  const { data, isLoading } = useIncident(id);
  const plan = useAppStore((s) => s.plan);
  const setGate = useAppStore((s) => s.setEvidenceGateOpen);
  const openUpgrade = useAppStore((s) => s.openUpgrade);
  const router = useRouter();
  const incident = data ?? mockIncidentDetail;
  const evidenceOk = hasEvidence(plan?.plan);
  const conf = incident.confidence ?? confidenceFromScore(incident.correlations?.[0]?.correlation_confidence ?? 0.94);
  const confColor =
    conf === 'HIGH' ? '#10B981' : conf === 'MEDIUM' ? '#F59E0B' : '#EF4444';
  const statusColor =
    incident.status === 'open'
      ? 'text-rs-down'
      : incident.status === 'resolved'
        ? 'text-rs-up'
        : 'text-rs-text-tertiary';

  const chart = useMemo(() => {
    const yours = incident.impact?.your_service ?? [];
    const vendor = incident.impact?.vendor ?? [];
    return yours.map((p, i) => ({
      t: p.t,
      yours: p.v,
      vendor: vendor[i]?.v ?? p.v,
    }));
  }, [incident]);

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <RsSkeleton className="h-8 w-64" />
        <RsSkeleton className="h-40 w-full" />
      </div>
    );
  }

  const code = incidentCode(incident.id, incident.display_id);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-rs-text">
            {incident.title || incident.description || 'Incident'}
          </h1>
          <p className="mt-1.5 text-sm text-rs-text-tertiary">
            Started {formatUtc(incident.started_at)} · Duration {durationBetween(incident.started_at, incident.resolved_at)} · Status:{' '}
            <span className={statusColor}>{incident.status.replace('_', ' ')}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {incident.evidence_report_id && evidenceOk && (
            <RsButton variant="secondary" onClick={() => router.push(`/reports/${incident.evidence_report_id}`)}>
              View report
            </RsButton>
          )}
          <RsButton
            onClick={() => {
              if (!evidenceOk) setGate(true);
              else router.push(`/reports/${incident.id}`);
            }}
          >
            Generate report
            {!evidenceOk && (
              <span className="ml-2 rounded bg-rs-brand-subtle px-1.5 py-0.5 text-[10px] text-rs-brand">
                Standard
              </span>
            )}
          </RsButton>
        </div>
      </div>

      <div
        className="mt-6 rounded-xl border border-rs-border-subtle bg-rs-elevated p-5"
        style={{ borderTopWidth: 3, borderTopColor: confColor }}
      >
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          {[
            { label: 'Incident', value: code },
            { label: 'Duration', value: durationBetween(incident.started_at, incident.resolved_at) },
            { label: 'Regions', value: '2/3' },
            { label: 'Confidence', value: conf, help: true, color: confColor },
          ].map((item) => (
            <div key={item.label}>
              <div className="mb-2 flex items-center gap-1 text-[11px] uppercase tracking-[0.05em] text-rs-text-tertiary">
                {item.label}
                {item.help && (
                  <HelpTooltip
                    title="Correlation confidence"
                    body="Confidence is computed from temporal overlap, multi-region quorum, and vendor-side degradation. HIGH means independent checks agree."
                  />
                )}
              </div>
              <div
                className="font-mono text-[28px] font-bold text-rs-text"
                style={item.color ? { color: item.color } : undefined}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {plan?.plan === 'free' && (
        <div className="mt-3 rounded-[10px] border border-[rgba(37,99,235,0.2)] bg-rs-brand-subtle px-[18px] py-3.5 text-sm text-rs-text">
          Basic correlation is active on Free. Full multi-signal correlation is available on Starter and above.{' '}
          <button type="button" className="text-rs-text-accent hover:underline" onClick={() => openUpgrade('correlation')}>
            Start Starter trial
          </button>
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-rs-text">Timeline</h2>
        <div className="relative rounded-xl border border-rs-border-subtle bg-rs-elevated p-6">
          <div className="absolute bottom-6 left-8 top-6 w-px bg-rs-border" />
          <div className="space-y-1">
            {(incident.timeline ?? []).map((ev) => (
              <div
                key={ev.id}
                className="-mx-3 flex items-start rounded-md px-3 py-2.5 hover:bg-rs-hover"
              >
                <div className="relative z-10 mr-4 mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 bg-rs-base" style={{ borderColor: DOT[ev.type] }} />
                <div className="w-[90px] shrink-0 font-mono text-xs text-rs-text-tertiary">
                  {formatUtc(ev.timestamp, 'HH:mm:ss')}
                </div>
                <p className="text-sm text-rs-text">
                  {ev.description}{' '}
                  {ev.metric && <span className="font-mono text-rs-text-secondary">{ev.metric}</span>}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-rs-text">Impact analysis</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[
            { key: 'yours', label: 'Your service', stroke: '#EF4444', fill: 'rgba(239,68,68,0.08)', metric: 'Error rate' },
            { key: 'vendor', label: 'Vendor', stroke: '#F59E0B', fill: 'rgba(245,158,11,0.08)', metric: 'Latency p95' },
          ].map((card) => (
            <div key={card.key} className="rounded-xl border border-rs-border-subtle bg-rs-elevated p-5">
              <div className="text-[11px] uppercase tracking-[0.05em] text-rs-text-tertiary">{card.label}</div>
              <div className="mt-3 text-sm text-rs-text-secondary">{card.metric}</div>
              <div className="mt-1 font-mono text-[28px] font-bold text-rs-text">
                {card.key === 'yours' ? '3.1x' : '1,240ms'}
              </div>
              <div className="mt-4 h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chart}>
                    <CartesianGrid vertical={false} stroke="#1E293B" strokeDasharray="3 3" />
                    <Tooltip
                      contentStyle={{
                        background: '#111827',
                        border: '1px solid #1E293B',
                        borderRadius: 6,
                        padding: '8px 12px',
                        boxShadow: 'none',
                      }}
                      labelStyle={{ display: 'none' }}
                    />
                    <Area
                      type="monotone"
                      dataKey={card.key}
                      stroke={card.stroke}
                      fill={card.fill}
                      strokeWidth={2}
                      isAnimationActive
                      animationDuration={800}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-base font-medium text-rs-text-secondary">Other dependencies during incident</h3>
        <div className="mt-3 overflow-hidden rounded-xl border border-rs-border-subtle bg-rs-elevated">
          {(incident.other_dependencies ?? []).map((d, i, arr) => (
            <div
              key={d.name}
              className={cn('flex h-11 items-center justify-between px-4', i !== arr.length - 1 && 'border-b border-rs-border-subtle')}
            >
              <span className="text-sm text-rs-text">{d.name}</span>
              <div className="flex items-center gap-4">
                <StatusBadge status={d.status} />
                <span className="w-16 text-right font-mono text-sm text-rs-text-secondary">{d.latency_ms}ms</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-4 flex items-center gap-1">
          <h2 className="text-lg font-semibold text-rs-text">Evidence reports</h2>
          <HelpTooltip
            title="Evidence reports"
            body="Timestamped, multi-region verification you can attach to an SLA credit claim. Available on Standard and above."
          />
        </div>
        {!evidenceOk ? (
          <div className="rounded-xl border border-dashed border-rs-border bg-rs-elevated px-6 py-10 text-center">
            <Lock size={32} className="mx-auto text-rs-text-tertiary" />
            <h3 className="mt-3 text-base font-medium text-rs-text">Evidence reports are a Standard feature</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-rs-text-secondary">
              Generate structured, timestamped evidence reports for vendor SLA claims. Upgrade to Standard to unlock.
            </p>
            <RsButton className="mt-4" onClick={() => openUpgrade('evidence')}>
              Start Standard trial
            </RsButton>
            <div>
              <a href="mailto:support@reliastra.com?subject=Evidence%20report%20question" className="mt-3 inline-block text-sm text-rs-text-accent">
                Learn more
              </a>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-rs-border-subtle bg-rs-elevated px-5 py-4">
            <div className="flex items-center">
              <FileText size={20} className="text-rs-text-accent" />
              <span className="ml-3 font-mono text-sm text-rs-text-accent">{code.replace('INC', 'RPT')}</span>
              <span className="ml-3 text-xs text-rs-text-tertiary">{formatUtc(incident.started_at, 'MMM d, yyyy')}</span>
            </div>
            <div className="text-sm text-rs-text-accent">
              <button type="button" className="hover:underline" onClick={() => router.push(`/reports/${incident.id}`)}>
                View
              </button>
              <span className="mx-2 text-rs-border"> · </span>
              <button type="button" className="hover:underline" onClick={() => router.push(`/reports/${incident.id}`)}>
                Download PDF
              </button>
              <span className="mx-2 text-rs-border"> · </span>
              <button
                type="button"
                className="hover:underline"
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/reports/${incident.id}`)}
              >
                Share link
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
