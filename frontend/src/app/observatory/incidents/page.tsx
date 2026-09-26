import type { Metadata } from 'next';
import Link from 'next/link';

import {
  ObservatoryShell,
  RecordSection,
  StateWord,
} from '@/components/observatory/primitives';
import type { ObservedState } from '@/lib/observatory/format';
import { JsonLd } from '@/components/seo/json-ld';
import { robotsDirective } from '@/lib/indexability';
import { breadcrumbJsonLd, canonicalUrl, DISCOVERY_ALTERNATES } from '@/lib/seo';
import { utcStamp } from '@/lib/observatory/format';
import { PUBLIC_ROUTES, SHARE_ROUTES, incidentSearchQuery } from '@/lib/routes';
import {
  readCatalog,
  readPublicIncidents,
  type TrackObservedIncident,
} from '@/lib/track-api';
import { failureKindLabel, resolveIncidentSearch } from '@/lib/observatory/incident-search';
import { RecordUnreadableError } from '@/lib/track-api';

export const revalidate = 60;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The cross-vendor observed incident search - the public product of
 * RELIASTRA's public incident detection.
 *
 * A static segment deliberately beats the `[vendor]` dynamic route: the
 * incidents index resolves here, never to a vendor record for a dependency
 * that cannot exist.
 *
 * ┌─ Indexability is decided here, not discovered ──────────────────────────┐
 * │ The bare page and single-axis filters (one of vendor / category /       │
 * │ region / status) are indexable and canonical to themselves: each is a   │
 * │ deliberate intent ("Twilio incidents", "open incidents"). Every other   │
 * │ parametrization - time bounds, failure kind, multi-axis combinations,   │
 * │ pagination cursors, unknown parameters - is `noindex, follow` and       │
 * │ canonical to the base URL. An unbounded parameter space with indexed   │
 * │ URLs is a crawl trap; a bounded one with curated URLs is a directory.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Every record on this page is a genuine detection run: consecutive failed
 * probes from RELIASTRA's measurement region against one endpoint, published
 * only after the rule confirmed the window. Nothing here reads a status
 * page, a social post or a support queue.
 */

function stateOf(incident: TrackObservedIncident): { state: ObservedState; word: string } {
  return incident.resolved_at
    ? { state: 'healthy', word: 'Resolved' }
    : { state: 'degraded', word: 'Open' };
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  const { filters, indexable, canonicalPath } = resolveIncidentSearch(sp);

  const axis =
    filters.vendor ?? filters.category ?? filters.region ??
    (filters.status ? `${filters.status} incidents` : null);

  const title = axis
    ? `${axis.replace(/[-_]/g, ' ')} - observed incident records (RELIASTRA)`
    : 'Observed incident search - public incident intelligence (RELIASTRA)';
  const description =
    'Search every incident RELIASTRA independently detected across the public dependency catalog: ' +
    'consecutive failed observations, measured from named regions, endpoint scoped, with the exact ' +
    'window each detection rule fired and cleared. Derived from probes, not reported from status pages.';

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl(canonicalPath),
      types: {
        ...DISCOVERY_ALTERNATES.types,
        'application/rss+xml': canonicalUrl(`${SHARE_ROUTES.observatoryIncidents}/feed.xml`),
      },
    },
    robots: robotsDirective({ index: indexable, follow: true }),
  };
}

export default async function ObservedIncidentsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const resolved = resolveIncidentSearch(sp);

  const incidentsRead = await readPublicIncidents({
    ...resolved.filters,
    cursor: resolved.cursor,
    limit: 20,
  });

  if (incidentsRead.kind === 'unreadable') {
    throw new RecordUnreadableError(incidentsRead.reason, '/public/incidents');
  }
  const items = incidentsRead.kind === 'ok' ? incidentsRead.value.items : [];
  const nextCursor =
    incidentsRead.kind === 'ok' ? incidentsRead.value.next_cursor : null;
  const hasMore = incidentsRead.kind === 'ok' ? incidentsRead.value.has_more : false;

  // Filter plumbing is soft: an unavailable catalog removes the shortcuts,
  // not the search.
  const catalogRead = await readCatalog(100);
  const vendorOptions = (catalogRead.kind === 'ok' ? catalogRead.value.items : [])
    .map((v) => ({ slug: v.vendor_name, name: v.display_name }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const regionOptions = ['us-east', 'eu-west', 'ap-south', 'sa-east'];

  const { filters } = resolved;
  const activeSummary = [
    filters.vendor && `vendor ${filters.vendor}`,
    filters.category && `category ${filters.category}`,
    filters.region && `region ${filters.region}`,
    filters.status && `state ${filters.status}`,
    filters.failureKind && `failure ${filters.failureKind}`,
    resolved.cursor && 'continued from an earlier page',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <ObservatoryShell>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Observatory', path: PUBLIC_ROUTES.observatory },
            { name: 'Incidents', path: SHARE_ROUTES.observatoryIncidents },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            '@id': canonicalUrl(SHARE_ROUTES.observatoryIncidents),
            url: canonicalUrl(SHARE_ROUTES.observatoryIncidents),
            name: 'Observed incident records - RELIASTRA',
            description:
              'Incidents independently detected by RELIASTRA probes across the public dependency catalog.',
            isPartOf: { '@id': canonicalUrl(PUBLIC_ROUTES.observatory) },
            inLanguage: 'en',
          },
        ]}
      />

      <div className="border-b border-[var(--ob-line)] bg-[var(--ob-void)]">
        <div className="ob-container flex items-center justify-between gap-4 py-3">
          <span className="ob-label">
            <Link href={PUBLIC_ROUTES.observatory} className="hover:text-[var(--ob-text)]">
              RELIASTRA OBSERVATORY
            </Link>
          </span>
          <span className="ob-label">{utcStamp(new Date().toISOString())} UTC</span>
        </div>
      </div>

      <header className="bg-[var(--ob-void)]">
        <div className="ob-container pb-10 pt-10 md:pb-12 md:pt-14">
          <p className="ob-label flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[var(--ob-signal)]">Public incident intelligence</span>
            <span aria-hidden className="h-px w-6 bg-[var(--ob-line-2)]" />
            <span>Detected from RELIASTRA probes</span>
          </p>
          <h1 className="ob-h1 mt-6 max-w-[24ch]">Observed incident records</h1>
          <p className="obs-descriptor mt-5 max-w-[68ch]">
            Every incident below was detected by RELIASTRA's own measurement: consecutive failed
            probes against one endpoint from a named region, confirmed by the published detection
            rule before the record exists. A record states what was observed, from where, and when -
            it does not infer a vendor-wide outage, and it is never written from a status page.
          </p>
        </div>
      </header>

      <RecordSection
        index="01"
        id="search"
        tone="base"
        title="Search"
        note={
          filters.vendor || filters.category || filters.region || filters.status
            ? `Active: ${activeSummary}. Clear all filters to return to the full record.`
            : 'One axis at a time is enough for most questions. Cross-vendor and time-bounded views are deliberately kept off the index - anything narrower is working search, not a published page.'
        }
      >
        <form method="get" action={SHARE_ROUTES.observatoryIncidents} className="mt-1 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-2">
            <span className="ob-label">Dependency</span>
            <input
              type="text"
              name="vendor"
              list="incident-vendor-options"
              defaultValue={filters.vendor ?? ''}
              placeholder="e.g. twilio"
              className="h-10 w-52 border border-[var(--ob-line-2)] bg-[var(--ob-surface)] px-3 text-[13.5px] text-[var(--ob-text)] placeholder:text-[var(--ob-text-4)] focus:outline-none focus:border-[var(--ob-text-3)]"
            />
            <datalist id="incident-vendor-options">
              {vendorOptions.map((v) => (
                <option key={v.slug} value={v.slug}>
                  {v.name}
                </option>
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-2">
            <span className="ob-label">State</span>
            <select
              name="status"
              defaultValue={filters.status ?? ''}
              className="h-10 border border-[var(--ob-line-2)] bg-[var(--ob-surface)] px-3 text-[13.5px] text-[var(--ob-text)] focus:outline-none focus:border-[var(--ob-text-3)]"
            >
              <option value="">Open and resolved</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="ob-label">Observed from</span>
            <select
              name="region"
              defaultValue={filters.region ?? ''}
              className="h-10 border border-[var(--ob-line-2)] bg-[var(--ob-surface)] px-3 text-[13.5px] text-[var(--ob-text)] focus:outline-none focus:border-[var(--ob-text-3)]"
            >
              <option value="">Any measurement region</option>
              {regionOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="inline-flex h-10 items-center border border-[var(--ob-text)] bg-[var(--ob-text)] px-5 text-[12.5px] font-medium uppercase tracking-[0.08em] text-[var(--ob-void)] hover:opacity-90"
          >
            Search
          </button>
          {(filters.vendor || filters.category || filters.region || filters.status || filters.failureKind || resolved.cursor) && (
            <Link
              href={SHARE_ROUTES.observatoryIncidents}
              className="ob-label inline-flex h-10 items-center underline underline-offset-4 hover:text-[var(--ob-text)]"
            >
              Clear all
            </Link>
          )}
        </form>

        {!filters.vendor && !filters.category && !filters.region && !filters.status && !resolved.cursor && (
          <div className="mt-8">
            <p className="ob-label mb-3">Browse a single axis</p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={incidentSearchQuery({ status: 'open' })}
                className="inline-flex h-8 items-center border border-[var(--ob-line-2)] px-3 text-[12px] text-[var(--ob-text-2)] hover:border-[var(--ob-text-3)] hover:text-[var(--ob-text)]"
              >
                Open now
              </Link>
              {vendorOptions.slice(0, 8).map((v) => (
                <Link
                  key={v.slug}
                  href={incidentSearchQuery({ vendor: v.slug })}
                  className="inline-flex h-8 items-center border border-[var(--ob-line-2)] px-3 text-[12px] text-[var(--ob-text-2)] hover:border-[var(--ob-text-3)] hover:text-[var(--ob-text)]"
                >
                  {v.slug}
                </Link>
              ))}
            </div>
          </div>
        )}
      </RecordSection>

      <RecordSection
        index="02"
        id="records"
        tone="base"
        title={`Incident records${items.length ? ` - ${items.length}${hasMore ? ' shown of more' : ''}` : ''}`}
        note="Newest first by detection start, printed in UTC. 'Failures' is the count of consecutive failed observations the rule counted; the record itself holds the window and the evidence references."
      >
        {items.length ? (
          <div className="flex flex-col">
            {items.map((incident) => {
              const { state, word } = stateOf(incident);
              return (
                <div
                  key={incident.incident_id}
                  className="flex flex-col gap-2 border-b border-[var(--ob-line)] py-4 last:border-b-0 md:flex-row md:items-baseline md:justify-between md:gap-6"
                >
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <Link
                      href={SHARE_ROUTES.observatoryIncident(incident.vendor_name, incident.incident_id)}
                      className="text-[14px] font-medium text-[var(--ob-text)] underline underline-offset-4 hover:opacity-80"
                    >
                      {utcStamp(incident.started_at)}
                    </Link>
                    <Link
                      href={SHARE_ROUTES.observatoryVendor(incident.vendor_name)}
                      className="ob-link text-[13px]"
                    >
                      {incident.vendor_display_name}
                    </Link>
                    <span className="text-[13px] text-[var(--ob-text-3)]">
                      {incident.target_name ?? 'observed endpoint'}
                    </span>
                    <span className="ob-label">{incident.region}</span>
                    <StateWord state={state} word={word} size="sm" />
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 md:justify-end">
                    <span className="text-[13px] text-[var(--ob-text-3)] tabular-nums">
                      {failureKindLabel(incident.failure_kind)}
                    </span>
                    <span className="text-[13px] text-[var(--ob-text-3)] tabular-nums">
                      {incident.failure_count} failures
                    </span>
                    <span className="text-[13px] text-[var(--ob-text-3)] tabular-nums">
                      {incident.duration_seconds != null
                        ? `${Math.round(incident.duration_seconds / 60)} min`
                        : 'open at last read'}
                    </span>
                    <Link
                      href={SHARE_ROUTES.observatoryIncident(incident.vendor_name, incident.incident_id)}
                      className="ob-label underline underline-offset-4 hover:text-[var(--ob-text)]"
                    >
                      Record
                    </Link>
                  </div>
                </div>
              );
            })}
            {hasMore && nextCursor && (
              <div className="pt-6">
                <Link
                  href={incidentSearchQuery({
                    vendor: filters.vendor,
                    category: filters.category,
                    region: filters.region,
                    status: filters.status,
                    cursor: nextCursor,
                  })}
                  className="inline-flex h-10 items-center border border-[var(--ob-line-2)] px-5 text-[12.5px] text-[var(--ob-text-2)] hover:border-[var(--ob-text-3)] hover:text-[var(--ob-text)]"
                >
                  Earlier records
                </Link>
              </div>
            )}
          </div>
        ) : (
          <p className="obs-void max-w-[62ch] text-[13.5px] leading-relaxed">
            No incident records match this view.
            {activeSummary
              ? ' Widening the search is the honest move: that is a statement about these filters, not a claim of reliability.'
              : ' RELIASTRA has not confirmed a failure window in the retained record. That is a statement about this catalog and window, not a promise that every dependency is healthy.'}
          </p>
        )}
      </RecordSection>

      <RecordSection
        index="03"
        id="reading"
        tone="base"
        title="How to read a record"
      >
        <div className="grid gap-x-10 gap-y-6 text-[13.5px] leading-relaxed text-[var(--ob-text-2)] md:grid-cols-2">
          <p>
            An incident here means one thing: RELIASTRA probes in the named region recorded
            consecutive failures against one endpoint for this dependency, across the stated
            window. The two-failure confirmation threshold and two-success recovery rule are the
            whole gate - no timing heuristics, no scoring, no inference.
          </p>
          <p>
            A record never claims the vendor itself was down. One endpoint failing can be a
            regional probe path, a rate limit, or a genuine service failure - the record states
            what was measured and stops. Where evidence-grade detail was published for the same
            window, the record page holds the full provenance.
          </p>
        </div>
      </RecordSection>
    </ObservatoryShell>
  );
}
