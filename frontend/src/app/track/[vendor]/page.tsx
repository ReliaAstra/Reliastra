import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  fetchTrackedVendors,
  fetchVendorPublicIncidents,
  fetchVendorTrack,
  type TrackDeveloperInfo,
  type TrackPublicIncident,
  type TrackVendorListItem,
} from '@/lib/track-api';
import { PreferredSourceSection } from '@/components/seo/preferred-source';
import { JsonLd } from '@/components/seo/json-ld';
import { SiteShell } from '@/components/site/site-shell';
import {
  Breadcrumb,
  Container,
  Eyebrow,
  Metric,
  Section,
  StateIndicator,
  toSystemState,
  STATE_LABEL,
  type SystemState,
} from '@/components/site/primitives';
import { SITE_URL, breadcrumbJsonLd, canonicalUrl } from '@/lib/seo';
import { AUTH_ROUTES, PUBLIC_ROUTES, SHARE_ROUTES, researchRoute } from '@/lib/routes';

export const revalidate = 60;

type Props = { params: Promise<{ vendor: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { vendor } = await params;
  const name = decodeURIComponent(vendor);
  let title = `${name} - independent status and incident history`;
  let description = `Independent, multi-region availability and incident history for ${name}, measured by RELIASTRA.`;

  try {
    const data = await fetchVendorTrack(name);
    if (data) {
      const display = data.vendor.display_name;
      title = `${display} status - independent uptime, latency and incidents`;
      description =
        `${display} is ${STATE_LABEL[stateOf(data)].toLowerCase()} at the last observation. ` +
        `${fmtUptime(data.uptime_7d)} availability over 7 days and ${fmtUptime(data.uptime_30d)} over 30 days, measured by RELIASTRA's independent regional probes.`;
    } else {
      title = `${name} - not tracked`;
    }
  } catch {
    // Keep generic metadata if the API is unavailable.
  }

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl(SHARE_ROUTES.trackVendor(name)) },
    openGraph: {
      title,
      description,
      url: canonicalUrl(SHARE_ROUTES.trackVendor(name)),
      type: 'website',
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/opengraph-image'],
    },
    robots: { index: true, follow: true },
  };
}

/* ── Formatters ───────────────────────────────────────────────────────────
 * Every one of these returns an explicit "no data" marker rather than a zero
 * or an empty string. On a measurement product, a blank cell and a measured
 * 0.00% are completely different claims.
 */

function fmtUptime(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return 'no data';
  return `${v.toFixed(2)}%`;
}

function fmtLatency(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return 'no data';
  return `${Math.round(ms)} ms`;
}

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return 'no observation';
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return 'no observation';
  return (
    new Date(parsed).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    }) + ' UTC'
  );
}

function fmtDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return 'duration unknown';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/**
 * Resolve the vendor's current state.
 *
 * Precedence is unchanged from the original implementation: the vendor's own
 * rolled-up `recent_status` first, then the latest probe's `is_up`, then
 * unknown. "Unknown" is a real, rendered outcome — the page never guesses
 * "operational" from the absence of a signal.
 */
function stateOf(d: TrackDeveloperInfo): SystemState {
  const rolled = toSystemState(d.vendor.recent_status);
  if (rolled !== 'unknown') return rolled;
  const up = d.current_status?.is_up;
  if (up === false) return 'critical';
  if (up === true) return 'healthy';
  return 'unknown';
}

function severityLabel(s: string): string {
  switch ((s || '').toLowerCase()) {
    case 'critical':
      return 'Critical';
    case 'major':
      return 'Major';
    case 'minor':
      return 'Minor';
    default:
      return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Incident';
  }
}

/* ── Page ────────────────────────────────────────────────────────────────── */

/**
 * A single vendor's public intelligence record.
 *
 * This is the most data-dense public surface on the site and the one most
 * likely to be cited, so its presentation rules are strict:
 *
 * - Every number is measured. There are no illustrative figures, no sample
 *   sparklines and no placeholder rows anywhere in this file.
 * - Missing data is labelled "no data" or "no observation" and never rendered
 *   as a dash that could be mistaken for zero.
 * - Status is dot + word, never colour alone.
 * - The observation window and probe count sit next to the figures they
 *   qualify, because an availability percentage without a window is not a
 *   fact.
 */
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

  // Related vendors for the internal link graph: same category first, never
  // self, never fabricated - only vendors the Track API actually returns. A
  // failed catalog fetch renders nothing rather than a broken section.
  let relatedVendors: TrackVendorListItem[] = [];
  try {
    const catalog = await fetchTrackedVendors(100);
    const others = (catalog.items ?? []).filter(
      (v) => v.vendor_name.toLowerCase() !== data.vendor.vendor_name.toLowerCase()
    );
    const sameCategory = others.filter((v) => v.category === data.vendor.category);
    const rest = others.filter((v) => v.category !== data.vendor.category);
    relatedVendors = [...sameCategory, ...rest].slice(0, 6);
  } catch {
    relatedVendors = [];
  }

  const state = stateOf(data);
  const m24 = Object.values(data.metrics_24h?.metrics ?? {})[0];
  const displayName = data.vendor.display_name;
  const vendorPath = SHARE_ROUTES.trackVendor(
    encodeURIComponent(data.vendor.vendor_name)
  );
  const lastProbe =
    data.current_status?.timestamp ?? data.vendor.last_check_at ?? null;

  const crumbs = [
    { name: 'Home', href: '/' },
    { name: 'Public dependency index', href: PUBLIC_ROUTES.track },
    { name: displayName, href: vendorPath },
  ];

  return (
    <SiteShell>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Public dependency index', path: PUBLIC_ROUTES.track },
            { name: displayName, path: vendorPath },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': canonicalUrl(vendorPath),
            url: canonicalUrl(vendorPath),
            name: `${displayName} status - independent uptime, latency and incidents`,
            description: `Independent, multi-region availability and incident history for ${displayName}, measured by RELIASTRA.`,
            isPartOf: { '@id': `${SITE_URL}/#website` },
            inLanguage: 'en',
          },
        ]}
      />

      {/* Record header */}
      <header className="border-b border-[var(--ob-line)] bg-[var(--ob-base)]">
        <Container className="py-12 md:py-16">
          <Breadcrumb items={crumbs} className="mb-8" />
          <Eyebrow>Independent vendor record</Eyebrow>

          <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-3">
            <h1 className="ob-h1">{displayName}</h1>
            <StateIndicator state={state} live={state === 'healthy'} />
          </div>

          <dl className="mt-9 grid gap-x-10 gap-y-5 border-t border-[var(--ob-line)] pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="ob-label mb-2">Category</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">
                {data.vendor.category || 'uncategorised'}
              </dd>
            </div>
            <div>
              <dt className="ob-label mb-2">Last probe</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">
                {fmtWhen(lastProbe)}
              </dd>
            </div>
            <div>
              <dt className="ob-label mb-2">Measured by</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">
                RELIASTRA probes
              </dd>
            </div>
            <div>
              <dt className="ob-label mb-2">Refresh</dt>
              <dd className="ob-mono text-[var(--ob-text-2)]">60s</dd>
            </div>
          </dl>

          <p className="ob-body mt-8 max-w-[68ch]">
            Every figure on this page originates from RELIASTRA&apos;s own
            requests against {displayName}&apos;s public endpoints from multiple
            regions. Nothing is read from the vendor&apos;s status page.
          </p>
        </Container>
      </header>

      {/* Measurements */}
      <Section tone="void" divider={false} aria-labelledby="measurements-heading">
        <Container>
          <h2 id="measurements-heading" className="ob-label mb-9">
            Measured availability
          </h2>
          <div className="grid gap-y-10 border-t border-[var(--ob-line)] pt-9 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-10">
            <Metric
              label="Availability 24h"
              value={fmtUptime(m24?.uptime_percentage)}
              note="Successful checks / total checks, 24h window"
            />
            <Metric
              label="Mean latency 24h"
              value={fmtLatency(data.avg_latency_24h)}
              note={`p95 ${fmtLatency(data.p95_latency_24h)}`}
            />
            <Metric
              label="Availability 7d"
              value={fmtUptime(data.uptime_7d)}
              note="Rolling 7-day window"
            />
            <Metric
              label="Availability 30d"
              value={fmtUptime(data.uptime_30d)}
              note="Rolling 30-day window"
            />
          </div>

          {data.current_status?.status_code != null && (
            <p className="ob-small mt-9 border-t border-[var(--ob-line)] pt-4">
              Most recent response: HTTP {data.current_status.status_code} at{' '}
              {fmtWhen(data.current_status.timestamp)}.
            </p>
          )}
        </Container>
      </Section>

      {/* Endpoints under measurement */}
      {data.vendor.endpoints?.length > 0 && (
        <Section tone="base" aria-labelledby="endpoints-heading">
          <Container>
            <h2 id="endpoints-heading" className="ob-label mb-2">
              Endpoints under measurement
            </h2>
            <p className="ob-body mb-8 max-w-[62ch]">
              The exact public endpoints probed, and the regions they are probed
              from. Publishing this is what makes the availability figures
              above checkable.
            </p>
            <ul>
              {data.vendor.endpoints.map((ep) => {
                const epState = toSystemState(ep.health_status);
                return (
                  <li
                    key={ep.id}
                    className="grid gap-x-6 gap-y-2 border-t border-[var(--ob-line)] py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,220px)_minmax(0,140px)] lg:items-baseline"
                  >
                    <span className="ob-mono truncate text-[var(--ob-text-2)]">
                      {ep.endpoint_url}
                    </span>
                    <span className="ob-label">
                      {ep.regions.length > 0
                        ? ep.regions.join(' · ')
                        : 'region unspecified'}
                    </span>
                    <span className="lg:text-right">
                      <StateIndicator state={epState} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </Container>
        </Section>
      )}

      {/* Incident history */}
      <Section tone="void" aria-labelledby="incidents-heading">
        <Container>
          <h2 id="incidents-heading" className="ob-label mb-2">
            Incident history
          </h2>

          {publicIncidents.length === 0 && data.recent_incidents.length === 0 ? (
            <div className="ob-alert ob-alert-note mt-6">
              <p className="ob-label mb-2">No incidents recorded</p>
              <p className="text-[14px] leading-[1.6] text-[var(--ob-text-2)]">
                Either {displayName} has been available throughout the
                observation window, or monitoring coverage has not yet captured
                an outage. This is a statement about the record, not a
                guarantee about the service.
              </p>
            </div>
          ) : publicIncidents.length > 0 ? (
            <>
              <p className="ob-body mb-8 max-w-[62ch]">
                Independently observed incidents. Each entry is derived from
                consecutive failed probes, not from a vendor announcement.
              </p>
              <ol>
                {publicIncidents.map((inc) => {
                  const incState =
                    inc.status === 'open'
                      ? 'critical'
                      : toSystemState(inc.severity);
                  return (
                    <li key={inc.incident_id}>
                      <article className="grid gap-x-8 gap-y-3 border-t border-[var(--ob-line)] py-6 lg:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
                        <div className="flex flex-col gap-2">
                          <StateIndicator
                            state={incState}
                            label={severityLabel(inc.severity)}
                          />
                          <span className="ob-label text-[var(--ob-text-4)]">
                            {inc.status === 'open' ? 'Ongoing' : 'Resolved'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-2">
                          <h3 className="text-[16px] font-medium tracking-[-0.01em] text-[var(--ob-text)]">
                            {inc.title}
                          </h3>
                          <p className="ob-mono text-[var(--ob-text-4)]">
                            {fmtWhen(inc.started_at)}
                            {inc.resolved_at
                              ? ` → ${fmtWhen(inc.resolved_at)}`
                              : ' → ongoing'}
                            {' · '}
                            {fmtDuration(
                              inc.duration_minutes != null
                                ? inc.duration_minutes * 60
                                : null
                            )}
                            {inc.max_latency_ms != null
                              ? ` · peak ${fmtLatency(inc.max_latency_ms)}`
                              : ''}
                          </p>
                          {inc.has_evidence_report && inc.download_token && (
                            <a
                              href={`/portal/${inc.download_token}`}
                              className="ob-label mt-1 w-fit text-[var(--ob-signal)] transition-opacity hover:opacity-80"
                            >
                              View evidence report →
                            </a>
                          )}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <div className="ob-alert ob-alert-note mt-6">
              <p className="ob-label mb-2">
                {data.recent_incidents.length} observation
                {data.recent_incidents.length === 1 ? '' : 's'} pending
                publication
              </p>
              <p className="text-[14px] leading-[1.6] text-[var(--ob-text-2)]">
                Recent probes recorded anomalies against this vendor. They
                appear here as public incident records once the observation
                window closes and the record is verified.
              </p>
            </div>
          )}
        </Container>
      </Section>

      {/* How to read this record */}
      <Section tone="base" tight aria-labelledby="method-heading">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-20">
            <div className="flex flex-col gap-5">
              <Eyebrow>Method</Eyebrow>
              <h2 id="method-heading" className="ob-h3 max-w-[16ch]">
                How this record is produced.
              </h2>
              <Link
                href={researchRoute('how-reliastra-measures-vendor-reliability')}
                className="ob-label w-fit text-[var(--ob-signal)] transition-opacity hover:opacity-80"
              >
                Full methodology →
              </Link>
            </div>
            <dl className="flex flex-col">
              {[
                [
                  'Observation',
                  `RELIASTRA issues requests to ${displayName}'s public endpoints from multiple regions on a fixed interval. A check is a completed request with a recorded status code and latency.`,
                ],
                [
                  'Availability',
                  'The share of completed checks that succeeded within the stated window. A regional failure that other regions did not see is recorded as such rather than averaged away.',
                ],
                [
                  'Incidents',
                  'Derived from consecutive failed checks, not from vendor announcements. An incident opens when the failure threshold is met and closes when checks recover.',
                ],
                [
                  'Limits',
                  'These figures describe the endpoints listed above, observed from RELIASTRA regions. They are not a statement about every service the vendor operates, nor about your specific integration.',
                ],
              ].map(([term, body]) => (
                <div
                  key={term}
                  className="grid gap-2 border-t border-[var(--ob-line)] py-5 sm:grid-cols-[minmax(120px,170px)_1fr] sm:gap-8"
                >
                  <dt className="ob-label pt-1">{term}</dt>
                  <dd className="max-w-[62ch] text-[14.5px] leading-[1.68] text-[var(--ob-text-2)]">
                    {body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </Section>

      <Section tone="void" tight>
        <Container>
          <PreferredSourceSection variant="vendor" />
        </Container>
      </Section>

      {/* Topical graph */}
      <Section tone="base" tight aria-labelledby="related-heading">
        <Container>
          <h2 id="related-heading" className="ob-label mb-6">
            Related records
          </h2>
          <div className="grid gap-x-16 gap-y-10 lg:grid-cols-2">
            {relatedVendors.length > 0 && (
              <nav aria-label="Related vendors">
                <p className="ob-label mb-3 text-[var(--ob-text-4)]">Vendors</p>
                <ul className="flex flex-col">
                  {relatedVendors.map((v) => (
                    <li key={v.id}>
                      <Link
                        href={SHARE_ROUTES.trackVendor(
                          encodeURIComponent(v.vendor_name)
                        )}
                        className="block border-t border-[var(--ob-line)] py-3 text-[14.5px] text-[var(--ob-text-3)] transition-colors hover:text-[var(--ob-signal)]"
                      >
                        {v.display_name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <nav aria-label="Related concepts">
              <p className="ob-label mb-3 text-[var(--ob-text-4)]">Concepts</p>
              <ul className="flex flex-col">
                {[
                  {
                    href: researchRoute(
                      'how-reliastra-measures-vendor-reliability'
                    ),
                    label: 'Measurement methodology',
                  },
                  { href: PUBLIC_ROUTES.slaEvidence, label: 'SLA evidence' },
                  {
                    href: PUBLIC_ROUTES.incidentEvidence,
                    label: 'Incident attribution',
                  },
                  {
                    href: PUBLIC_ROUTES.docsMonitoring,
                    label: 'Monitoring documentation',
                  },
                  {
                    href: PUBLIC_ROUTES.track,
                    label: 'All tracked vendors',
                  },
                ].map((r) => (
                  <li key={r.href}>
                    <Link
                      href={r.href}
                      className="block border-t border-[var(--ob-line)] py-3 text-[14.5px] text-[var(--ob-text-3)] transition-colors hover:text-[var(--ob-signal)]"
                    >
                      {r.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </Container>
      </Section>

      <Section tone="void" tight aria-labelledby="vendor-cta">
        <Container>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-4">
              <h2 id="vendor-cta" className="ob-h2 max-w-[20ch]">
                Depend on {displayName}?
              </h2>
              <p className="ob-body max-w-[58ch]">
                RELIASTRA observes it continuously, correlates its failures with
                your own incidents, and produces the evidence record you need
                when it breaks your users&apos; experience.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
                Start monitoring free
              </Link>
              <Link
                href={PUBLIC_ROUTES.pricing}
                className="ob-btn ob-btn-outline"
              >
                View pricing
              </Link>
            </div>
          </div>
        </Container>
      </Section>
    </SiteShell>
  );
}

/**
 * The measurement API is unreachable.
 *
 * Rendered instead of the record — never alongside a partially populated one.
 * Showing stale or blank metrics under a live-looking header would be the
 * worst possible failure mode for a page whose entire value is that its
 * numbers are trustworthy.
 */
function ServiceUnavailable({ name }: { name: string }) {
  return (
    <SiteShell>
      <Container className="flex min-h-[55vh] flex-col justify-center py-20">
        <div className="max-w-[62ch]">
          <Eyebrow>Measurement network unreachable</Eyebrow>
          <h1 className="ob-h1 mt-5">Record unavailable.</h1>
          <p className="ob-lede mt-6">
            The measurement API could not be reached while loading the record
            for {name}. No figures are shown rather than stale or approximated
            ones.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href={PUBLIC_ROUTES.track} className="ob-btn ob-btn-outline">
              Back to the index
            </Link>
            <Link href="/" className="ob-btn ob-btn-outline">
              Return to RELIASTRA
            </Link>
          </div>
        </div>
      </Container>
    </SiteShell>
  );
}
