import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  fetchVendorPublicIncidents,
  fetchVendorTrack,
  type TrackDeveloperInfo,
  type TrackPublicIncident,
} from '@/lib/track-api';

export const revalidate = 60;

type Props = { params: Promise<{ vendor: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { vendor } = await params;
  const name = decodeURIComponent(vendor);
  let title = `${name} status — RELIASTRA Track`;
  let description = `Independent, multi-region uptime and incident history for ${name}, measured by RELIASTRA.`;

  try {
    const data = await fetchVendorTrack(name);
    if (data) {
      const display = data.vendor.display_name;
      title = `${display} status — live uptime, latency & incidents`;
      description =
        `${display} is ${describeState(data).label.toLowerCase()} right now. ` +
        `${fmtUptime(data.uptime_7d)} uptime over 7 days and ${fmtUptime(data.uptime_30d)} over 30 days, measured by RELIASTRA's independent regional probes.`;
    } else {
      title = `${name} — not tracked`;
    }
  } catch {
    // Keep generic metadata if the API is unavailable.
  }

  return {
    title,
    description,
    alternates: { canonical: `/track/${name}` },
    openGraph: { title, description, type: 'website' },
    robots: { index: true, follow: true },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtUptime(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(2)}%`;
}

function fmtLatency(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  return `${Math.round(ms)}ms`;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
    }) + ' UTC';
  } catch {
    return '—';
  }
}

function fmtDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function describeState(d: TrackDeveloperInfo): {
  label: string;
  dot: string;
  text: string;
  bg: string;
  border: string;
} {
  // Prefer the vendor's own recent_status; fall back to the latest probe.
  const s = (d.vendor.recent_status || '').toLowerCase();
  if (s === 'down') return { label: 'Down', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/20', border: 'border-red-200 dark:border-red-900/40' };
  if (s === 'degraded') return { label: 'Degraded', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-200 dark:border-amber-900/40' };
  if (s === 'operational') return { label: 'Operational', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/20', border: 'border-emerald-200 dark:border-emerald-900/40' };
  const up = d.current_status?.is_up;
  if (up === false) return { label: 'Down', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/20', border: 'border-red-200 dark:border-red-900/40' };
  if (up === true) return { label: 'Operational', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/20', border: 'border-emerald-200 dark:border-emerald-900/40' };
  return { label: 'Unknown', dot: 'bg-zinc-400 dark:bg-zinc-600', text: 'text-zinc-600 dark:text-zinc-400', bg: 'bg-zinc-100 dark:bg-white/5', border: 'border-zinc-200 dark:border-white/10' };
}

function severityLabel(s: string): string {
  switch ((s || '').toLowerCase()) {
    case 'critical': return 'Critical';
    case 'major': return 'Major';
    case 'minor': return 'Minor';
    default: return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Incident';
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function VendorTrackPage({ params }: Props) {
  const { vendor: rawName } = await params;
  const name = decodeURIComponent(rawName);

  let data: TrackDeveloperInfo | null;
  try {
    data = await fetchVendorTrack(name);
  } catch {
    return <ServiceUnavailable name={name} />;
  }

  if (!data) notFound();

  let publicIncidents: TrackPublicIncident[] = [];
  try {
    const gate = await fetchVendorPublicIncidents(name);
    publicIncidents = gate.incidents ?? [];
  } catch {
    publicIncidents = [];
  }

  const state = describeState(data);
  const m24 = Object.values(data.metrics_24h?.metrics ?? {})[0];
  const displayName = data.vendor.display_name;

  return (
    <main className="min-h-screen bg-white pb-24 dark:bg-[#0A0A0F]">
      {/* Header */}
      <section className="border-b border-zinc-200 bg-[#F8F9FA] py-10 dark:border-white/10 dark:bg-[#131318] md:py-14">
        <div className="mx-auto max-w-[880px] px-6">
          <Link
            href="/track"
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan-700 transition-colors hover:text-cyan-600 dark:text-cyan-400"
          >
            ← RELIASTRA Track
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white md:text-4xl">
              {displayName}
            </h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wide ${state.bg} ${state.border} ${state.text}`}>
              <span className={`relative size-1.5 rounded-full ${state.dot}`}>
                {state.label !== 'Unknown' && state.label !== 'Down' && (
                  <span className="absolute inset-0 animate-ping rounded-full opacity-60" />
                )}
              </span>
              {state.label}
            </span>
          </div>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            {data.vendor.category ? `${data.vendor.category} · ` : ''}
            Last probe{' '}
            {data.current_status?.timestamp
              ? fmtWhen(data.current_status.timestamp)
              : data.vendor.last_check_at
                ? fmtWhen(data.vendor.last_check_at)
                : '—'}
            {' · '}measured independently across regions
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-[880px] space-y-8 px-6 pt-8">
        {/* Current snapshot */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'Uptime 24h', value: fmtUptime(m24?.uptime_percentage), mono: true },
            { label: 'Avg latency 24h', value: fmtLatency(data.avg_latency_24h), mono: true },
            { label: 'Uptime 7d', value: fmtUptime(data.uptime_7d), mono: true },
            { label: 'Uptime 30d', value: fmtUptime(data.uptime_30d), mono: true },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-zinc-200 p-4 dark:border-white/10">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">{m.label}</p>
              <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {m.value}
              </p>
            </div>
          ))}
        </section>

        {/* Endpoints under measurement */}
        {data.vendor.endpoints?.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
              Monitored endpoints
            </h2>
            <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10">
              {data.vendor.endpoints.map((ep) => (
                <div key={ep.id} className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 last:border-b-0 dark:border-white/10">
                  <span className="min-w-0 truncate font-mono text-xs text-zinc-700 dark:text-zinc-300">
                    {ep.endpoint_url}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {ep.regions.map((r) => (
                      <span key={r} className="rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-white/15 dark:text-zinc-500">
                        {r}
                      </span>
                    ))}
                    <span
                      className={`size-1.5 rounded-full ${
                        ep.health_status === 'operational'
                          ? 'bg-emerald-500'
                          : ep.health_status === 'degraded'
                            ? 'bg-amber-500'
                            : ep.health_status === 'down'
                              ? 'bg-red-500'
                              : 'bg-zinc-400 dark:bg-zinc-600'
                      }`}
                      aria-label={ep.health_status}
                    />
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 font-mono text-[11px] text-zinc-400 dark:text-zinc-600">
              p95 latency 24h: {fmtLatency(data.p95_latency_24h)}
              {data.current_status?.status_code != null ? ` · last HTTP ${data.current_status.status_code}` : ''}
            </p>
          </section>
        )}

        {/* Public incidents */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
            Incident history
          </h2>

          {publicIncidents.length === 0 && data.recent_incidents.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 p-8 text-center dark:border-white/10">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">No incidents recorded</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-zinc-500">
                Either this service has been reliable during the observation window, or monitoring
                coverage has not yet captured an outage.
              </p>
            </div>
          ) : (
            <>
              {publicIncidents.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10">
                  {publicIncidents.map((inc) => (
                    <article key={inc.incident_id} className="border-b border-zinc-200 px-5 py-4 last:border-b-0 dark:border-white/10">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`size-2 shrink-0 rounded-full ${
                              inc.status === 'open'
                                ? 'bg-red-500'
                                : inc.severity === 'critical'
                                  ? 'bg-red-400'
                                  : inc.severity === 'major'
                                    ? 'bg-amber-500'
                                    : 'bg-zinc-400 dark:bg-zinc-600'
                            }`}
                          />
                          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {inc.title}
                          </h3>
                        </div>
                        <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-600">
                          {severityLabel(inc.severity)} · {fmtDuration(
                            inc.duration_minutes != null ? inc.duration_minutes * 60 : null
                          )}
                        </span>
                      </div>
                      <p className="mt-1.5 font-mono text-[11px] text-zinc-500">
                        {fmtWhen(inc.started_at)}
                        {inc.resolved_at ? ` → ${fmtWhen(inc.resolved_at)}` : ' → ongoing'}
                        {inc.max_latency_ms != null ? ` · peak latency ${fmtLatency(inc.max_latency_ms)}` : ''}
                      </p>
                      {inc.has_evidence_report && (
                        <a
                          href={inc.download_token ? `/portal/${inc.download_token}` : '/track'}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-cyan-700 hover:underline dark:text-cyan-400"
                        >
                          View evidence report →
                        </a>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-200 p-6 text-sm text-zinc-600 dark:border-white/10 dark:text-zinc-400">
                  Recent observations recorded {data.recent_incidents.length} event
                  {data.recent_incidents.length === 1 ? '' : 's'}; verified public incident reports
                  will appear here as they are published.
                </div>
              )}
            </>
          )}
        </section>

        {/* CTA */}
        <section className="rounded-xl border border-zinc-200 bg-[#F8F9FA] p-6 dark:border-white/10 dark:bg-[#131318] md:p-8">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-white">
            Depend on {displayName}?
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            RELIASTRA watches it for you around the clock, correlates its failures with your own
            incidents, and produces verifiable SLA evidence when it breaks your users&apos; experience.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-[10px] bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Start monitoring free
          </Link>
        </section>

        <p className="pt-2 font-mono text-[11px] text-zinc-400 dark:text-zinc-600">
          Data refreshed every minute · powered by reliastra.com
        </p>
      </div>
    </main>
  );
}

function ServiceUnavailable({ name }: { name: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 dark:bg-[#0A0A0F]">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">
          Status temporarily unavailable
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          The RELIASTRA measurement network could not be reached while loading {name}.
          Please refresh in a moment.
        </p>
        <Link
          href="/track"
          className="mt-6 inline-block rounded-[10px] border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-white/20 dark:text-zinc-200 dark:hover:bg-white/5"
        >
          Back to Track
        </Link>
      </div>
    </main>
  );
}
