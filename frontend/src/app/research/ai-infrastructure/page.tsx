import type { Metadata } from 'next';
import Link from 'next/link';

import {
  fetchTrackedVendors,
  fetchVendorDetail,
  fetchVendorMetrics,
  fetchVendorPublicIncidents,
  regionsOf,
  type TrackPublicIncident,
  type TrackVendorDetail,
  type TrackVendorListItem,
  type TrackWindowMetrics,
} from '@/lib/track-api';
import {
  availability,
  deriveState,
  NO_OBSERVATION,
  utcStamp,
} from '@/lib/observatory/format';
import { buildIsDownAnswer } from '@/lib/observatory/answer';
import { canonicalUrl, breadcrumbJsonLd } from '@/lib/seo';
import { JsonLd } from '@/components/seo/json-ld';
import {
  AUTH_ROUTES,
  PUBLIC_ROUTES,
  SHARE_ROUTES,
  researchHubArticles,
  researchHubRoute,
  researchRoute,
} from '@/lib/routes';
import { Breadcrumb } from '@/components/site/primitives';
import {
  Notice,
  ObservatoryShell,
  RecordSection,
  RecordTable,
  SpecRow,
  StateWord,
  Value,
  type RecordColumn,
} from '@/components/observatory/primitives';

/**
 * The AI infrastructure hub: RELIASTRA's public reference layer for how AI
 * providers' externally observable endpoints behave.
 *
 * Two rules define this page:
 *
 *  1. It shows live data from the measurement API, or it says the data is
 *     missing. Every figure revalidates with the records it cites.
 *  2. It never overstates what the public observatory measures. Today that is
 *     the HTTP behaviour of each provider's listed public endpoint (currently
 *     status sites), from one origin. Model-level endpoints, per-route API
 *     latency and authenticated traffic are NOT covered, and the page says so
 *     in its own sections rather than in a footnote. The hub exists so that
 *     those records can be added here without re-litigating the architecture.
 */

export const metadata: Metadata = {
  title: 'AI infrastructure status & reliability - the independent observatory',
  description:
    'Is OpenAI down? How would anyone know? RELIASTRA’s public record for AI providers: independently measured endpoint availability, latency windows, incident records, methodology and limits - not vendor status reporting.',
  alternates: { canonical: canonicalUrl(researchHubRoute('ai-infrastructure')) },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'AI infrastructure status & reliability - RELIASTRA observatory',
    description:
      'Independently measured availability and latency records for AI providers, with methodology, incident history and explicit limits.',
    url: canonicalUrl(researchHubRoute('ai-infrastructure')),
    type: 'website',
    siteName: 'RELIASTRA',
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'RELIASTRA AI infrastructure observatory hub',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI infrastructure status & reliability - RELIASTRA observatory',
    description:
      'Measured records for AI providers: availability, latency, incidents, methodology, limits.',
    images: ['/opengraph-image.png'],
  },
};

export const revalidate = 60;

const HUB_PATH = researchHubRoute('ai-infrastructure');

/**
 * Vendor categories this hub claims. An explicit list, not a fuzzy match:
 * `includes('ai')` would happily pull in unrelated taxonomies, and a hub that
 * lists the wrong provider has lost exactly the credibility it exists to
 * have. New AI categories join the observatory by being added here *and*
 * having real records; the two happen together or not at all.
 */
const AI_CATEGORIES = new Set(['ai', 'ai-api', 'model-apis', 'llm-api']);

/**
 * Candidate providers with real, publicly observable endpoints, used ONLY to
 * state coverage honestly: a name appears in "not under observation yet" while
 * the catalog has no record for it, and disappears from that list the moment a
 * measured record exists. It is never a promise about future coverage.
 */
const CANDIDATE_PROVIDERS: { vendorName: string; label: string }[] = [
  { vendorName: 'anthropic', label: 'Anthropic (Claude API)' },
  { vendorName: 'openrouter', label: 'OpenRouter' },
  { vendorName: 'google-gemini', label: 'Google Gemini API' },
  { vendorName: 'mistral', label: 'Mistral AI' },
];

interface HubRow {
  item: TrackVendorListItem;
  detail: TrackVendorDetail;
  /** 24h window metrics when the API answered; null is printed, not guessed. */
  m24: TrackWindowMetrics | null;
  /** Published public incidents in the API's rolling window; null = unread. */
  incidents: TrackPublicIncident[] | null;
}

export default async function AiInfrastructureHubPage() {
  let catalog: TrackVendorListItem[] = [];
  let networkFailed = false;
  try {
    catalog = (await fetchTrackedVendors(60)).items;
  } catch {
    networkFailed = true;
  }

  const aiItems = catalog.filter((v) => AI_CATEGORIES.has(v.category));
  const details = await Promise.all(
    aiItems.slice(0, 12).map(async (item): Promise<HubRow | null> => {
      try {
        const detail = await fetchVendorDetail(item.vendor_name);
        if (!detail) return null;
        let m24: TrackWindowMetrics | null = null;
        try {
          const metrics = await fetchVendorMetrics(item.vendor_name);
          m24 = metrics?.metrics?.['24h'] ?? null;
        } catch {
          m24 = null;
        }
        let incidents: TrackPublicIncident[] | null = null;
        try {
          incidents = await fetchVendorPublicIncidents(item.vendor_name);
        } catch {
          incidents = null;
        }
        return { item, detail, m24, incidents };
      } catch {
        return null;
      }
    })
  );

  const rows = details.filter((r): r is HubRow => r !== null);
  const observedNames = new Set(catalog.map((v) => v.vendor_name));
  const notObserved = CANDIDATE_PROVIDERS.filter((c) => !observedNames.has(c.vendorName));

  const freshest = catalog
    .filter((v) => AI_CATEGORIES.has(v.category))
    .map((v) => v.last_check_at)
    .filter((t): t is string => !!t)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];

  const hubArticles = researchHubArticles('ai-infrastructure');

  // Incident facts are counted from the API's published list, never asserted.
  // `null` (endpoint unread) is kept distinct from `[]` (read: none exist).
  const incidentsReadable = rows.some((r) => r.incidents !== null);
  const incidentRows = rows.flatMap((r) =>
    (r.incidents ?? []).map((p) => ({ vendor: r.detail, incident: p }))
  );

  const columns: RecordColumn<HubRow>[] = [
    {
      key: 'name',
      head: 'Provider',
      width: 'minmax(0,1fr)',
      mobile: 'lead',
      cell: (r) => (
        <span className="text-[14.5px] font-medium tracking-[-0.01em] text-[var(--ob-text)]">
          {r.detail.display_name}
        </span>
      ),
    },
    {
      key: 'endpoint',
      head: 'Observed endpoint',
      width: 'minmax(0,240px)',
      cell: (r) => {
        const url = r.detail.endpoints?.[0]?.endpoint_url;
        const host = (() => {
          try {
            return url ? new URL(url).host : null;
          } catch {
            return null;
          }
        })();
        return host ? (
          <span className="ob-mono text-[12.5px] text-[var(--ob-text-3)]">{host}</span>
        ) : (
          <span className="obs-void text-[13px]">not recorded</span>
        );
      },
    },
    {
      key: 'state',
      head: 'Observed state',
      width: 'minmax(0,190px)',
      cell: (r) => {
        const v = deriveState(r.detail.recent_status, null);
        return <StateWord size="sm" state={v.state} word={v.word} />;
      },
    },
    {
      key: 'avail',
      head: '24h availability',
      width: 'minmax(0,170px)',
      align: 'right',
      cell: (r) => (
        <span className="flex flex-col items-end">
          <Value>
            {availability(r.m24?.uptime_percentage, r.m24?.total_observations)}
          </Value>
          {r.m24 ? (
            <span className="ob-small text-[var(--ob-text-4)]">
              {r.m24.total_observations.toLocaleString('en-US')} observations
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'observed',
      head: 'Last observation',
      width: 'minmax(0,210px)',
      align: 'right',
      cell: (r) => (
        <Value>{r.item.last_check_at ? (utcStamp(r.item.last_check_at) ?? NO_OBSERVATION) : NO_OBSERVATION}</Value>
      ),
    },
  ];

  return (
    <ObservatoryShell>
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Research', path: PUBLIC_ROUTES.research },
            { name: 'AI Infrastructure', path: HUB_PATH },
          ]),
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            '@id': canonicalUrl(HUB_PATH),
            url: canonicalUrl(HUB_PATH),
            name: 'AI infrastructure status & reliability',
            description:
              'RELIASTRA’s public observatory hub for AI infrastructure: independently measured endpoint availability and latency for AI providers, incident records, methodology, limitations and technical research.',
            isPartOf: { '@id': canonicalUrl('/#website') },
            inLanguage: 'en',
            about: {
              '@type': 'Thing',
              name: 'AI infrastructure reliability',
              description:
                'The observable behaviour of the public endpoints AI providers are reached through: availability, latency, incident history, measured independently.',
            },
            hasPart: [
              ...rows.map((r) => ({
                '@type': 'WebPage',
                name: `${r.detail.display_name} reliability record`,
                url: canonicalUrl(SHARE_ROUTES.trackVendor(r.detail.vendor_name)),
              })),
              ...hubArticles.map((a) => ({
                '@type': 'TechArticle',
                headline: a.title,
                description: a.summary,
                datePublished: a.publishedAt,
                url: canonicalUrl(researchRoute(a.slug)),
              })),
            ],
          },
        ]}
      />

      <div className="border-b border-[var(--ob-line)] bg-[var(--ob-void)]">
        <div className="ob-container py-3">
          <Breadcrumb
            items={[
              { name: 'Home', href: '/' },
              { name: 'Research', href: PUBLIC_ROUTES.research },
              { name: 'AI Infrastructure', href: HUB_PATH },
            ]}
          />
        </div>
      </div>

      <header className="bg-[var(--ob-void)]">
        <div className="ob-container pb-12 pt-10 md:pb-16 md:pt-14">
          <p className="ob-label flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[var(--ob-signal)]">Research hub · live record</span>
            <span aria-hidden className="h-px w-6 bg-[var(--ob-line-2)]" />
            <span>Independently measured · updated continuously</span>
          </p>
          <h1 className="obs-name mt-6 max-w-[22ch] text-[clamp(2.4rem,6vw,4.6rem)]">
            AI infrastructure status &amp; reliability
          </h1>
          <p className="obs-descriptor mt-6 max-w-[68ch]">
            “Is OpenAI down?” - “why did the API get slow?” - “was it the model provider or my
            retry logic?” These questions get answered here the way RELIASTRA answers all of them:
            with stored observations issued from RELIASTRA infrastructure, timestamped in UTC,
            scoped to named endpoints, and published with their limits. Nothing here is copied or
            inferred from vendor status reporting; where a vendor’s status site is itself the
            endpoint under observation, each record names it.
          </p>

          <dl className="mt-12 grid gap-x-8 gap-y-6 border-t border-[var(--ob-line-2)] pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <HubFact term="AI providers under observation">
              {rows.length ? `${rows.length}` : networkFailed ? 'not read' : '0'}
            </HubFact>
            <HubFact term="Most recent observation">
              {freshest ? utcStamp(freshest) : NO_OBSERVATION}
            </HubFact>
            <HubFact term="Public incident records">
              {!rows.length
                ? 'no records to check'
                : !incidentsReadable
                  ? 'not read'
                  : incidentRows.length
                    ? `${incidentRows.length} published`
                    : 'none in the published 90-day window'}
            </HubFact>
            <HubFact term="Freshness of this hub">
              composed from the live measurement API on each render; the records
              it cites revalidate every 60 seconds
            </HubFact>
          </dl>
        </div>
      </header>

      <RecordSection
        index="01"
        id="providers"
        tone="base"
        title="AI providers currently under observation"
        note="One row per provider RELIASTRA actually measures. A provider without a measured record has no row - and no page. Coverage grows when observation targets exist, never when search volume does."
      >
        {networkFailed ? (
          <Notice kind="error" title="Measurement network unreachable">
            The catalog could not be read, so no state is shown. An unavailable readout is never
            rendered as an operational one.
          </Notice>
        ) : rows.length ? (
          <RecordTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.item.id}
            rowHref={(r) => SHARE_ROUTES.trackVendor(r.item.vendor_name)}
            caption="Availability is measured endpoint availability (expected HTTP 200 within 15 seconds), not service health. Open a provider for its full record: per-region observations, telemetry windows, incidents and evidence."
          />
        ) : (
          <Notice title="No AI provider records are readable right now">
            Either the catalog returned no AI-category entries, or their details could not be
            read. This hub shows nothing rather than placeholder status.
          </Notice>
        )}

        {notObserved.length > 0 && (
          <p className="ob-small mt-6 max-w-[88ch]">
            <strong className="text-[var(--ob-text-2)]">Not yet under observation:</strong>{' '}
            {notObserved.map((c) => c.label).join(', ')}. RELIASTRA does not publish status pages
            for providers it does not measure. When an observation target for these providers
            enters the public catalog, their record will appear in the table above and be linked
            from here.
          </p>
        )}
      </RecordSection>

      {rows.length > 0 && (
        <RecordSection
          index="02"
          id="answers"
          title="The direct answers"
          note="The question engineers arrive with, answered from the latest stored observation. Each answer is composed by the same function the vendor record uses, so the two cannot disagree."
        >
          <div className="flex flex-col">
            {rows.map((r) => {
              const regions = regionsOf(r.detail);
              const verdict = deriveState(r.detail.recent_status, null);
              const answer = buildIsDownAnswer({
                name: r.detail.display_name,
                endpointHost: (() => {
                  try {
                    return new URL(r.detail.endpoints?.[0]?.endpoint_url ?? '').host;
                  } catch {
                    return null;
                  }
                })(),
                regions,
                verdict,
                current:
                  r.item.status_code != null || r.item.latency_ms != null
                    ? {
                        timestamp: r.item.last_check_at,
                        latency_ms: r.item.latency_ms ?? null,
                        status_code: r.item.status_code ?? null,
                        is_up: r.item.recent_status === 'operational',
                      }
                    : null,
                window24h: null,
                cadenceSeconds: null,
              });
              return (
                <article
                  key={r.item.id}
                  className="flex flex-col gap-3 border-t border-[var(--ob-line)] py-7 first:border-t-0 first:pt-0"
                >
                  <h3 className="ob-h4">
                    <Link
                      href={SHARE_ROUTES.trackVendor(r.detail.vendor_name)}
                      className="ob-link"
                    >
                      {answer.question}
                    </Link>
                  </h3>
                  <p className="max-w-[84ch] text-[14.5px] leading-[1.65] text-[var(--ob-text-2)]">
                    {answer.lead}
                  </p>
                  <p className="ob-small max-w-[88ch] text-[var(--ob-text-4)]">
                    {answer.caveats[0]}
                  </p>
                </article>
              );
            })}
          </div>
        </RecordSection>
      )}

      <RecordSection
        index="03"
        id="incidents"
        tone="base"
        title="Incident record"
        note="Permanent public incident pages exist for incidents RELIASTRA has measured and whose evidence a monitoring organisation has published. The catalog is generated from that channel only."
      >
        {!incidentsReadable && rows.length ? (
          <Notice kind="error" title="Incident channel unavailable">
            The published-incident endpoint did not answer, so this hub cannot say whether
            incident records exist. “Not read” and “none” are different facts; only the first is
            currently known.
          </Notice>
        ) : incidentRows.length ? (
          <ul className="flex flex-col">
            {incidentRows.map(({ vendor, incident }) => (
              <li key={incident.incident_id}>
                <Link
                  href={SHARE_ROUTES.trackIncident(vendor.vendor_name, incident.incident_id)}
                  className="group flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 border-t border-[var(--ob-line)] py-4 first:border-t-0"
                >
                  <span className="text-[14.5px] text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
                    {vendor.display_name} - {incident.title}
                  </span>
                  <span className="ob-small">
                    opened {utcStamp(incident.started_at) ?? 'not recorded'} ·{' '}
                    {incident.resolved_at
                      ? `resolved ${utcStamp(incident.resolved_at)}`
                      : 'still open'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Notice title="No public incident records for AI providers in the current window">
            As of {freshest ? utcStamp(freshest) : 'the latest read'}, RELIASTRA holds no published
            public incident record for the AI providers above. Read precisely, that means: no
            organisation has released an evidence report for an incident touching these endpoints
            in the rolling 90-day window. It does not mean no outage occurred - endpoint
            observations are stored whether or not any incident channel records them. When a public
            incident record is created it gets a permanent page linked from the vendor record and
            listed here.
          </Notice>
        )}
      </RecordSection>

      <RecordSection
        index="04"
        id="what-is-measured"
        title="What RELIASTRA measures - and what it does not"
        note="The single most important section on this page. A reliability number whose scope you cannot state is a marketing number."
      >
        <dl className="flex flex-col">
          <SpecRow term="Measured" wide>
            HTTP availability and response latency of each provider’s listed public endpoint,
            probed on a fixed schedule from RELIASTRA infrastructure, stored per observation with
            latency, status code or error type, region and UTC timestamp, and aggregated into 1h
            to 90d windows at read time.
          </SpecRow>
          <SpecRow term="Endpoint ≠ service" wide>
            The public catalog currently observes vendor status-site endpoints (for OpenAI,{' '}
            <code className="ob-mono text-[0.92em]">https://status.openai.com</code>). “Responding”
            means that endpoint answered as expected. It is not a measurement of the Chat Completions
            API, the realtime API, or the ChatGPT product, and RELIASTRA never presents it as one.
          </SpecRow>
          <SpecRow term="Not (yet) measured" wide>
            Model-level endpoints ({'{'}provider{'}'}/models/{'{'}model{'}'}), per-route latency,
            token throughput, error-rate by API version, and authenticated traffic. Pages for
            those would be thin and misleading without the telemetry, so they do not exist; the
            record architecture accepts them the moment the observations do.
          </SpecRow>
          <SpecRow term="Single origin" wide>
            Public records run from one observation region per vendor today (us-east). One origin
            can show that an endpoint answered or did not; corroboration that distinguishes a
            vendor-wide outage from one network path needs independent origins, which is why
            public records do not open incidents and this hub says “no record” instead of “no
            outage”.
          </SpecRow>
          <SpecRow term="Vendor status reporting" wide>
            Not ingested, mirrored or reconciled. A vendor’s declared state and RELIASTRA’s
            measured state are two records that may disagree; both being readable is the point.
          </SpecRow>
        </dl>
      </RecordSection>

      <RecordSection
        index="05"
        id="research"
        tone="base"
        title="Technical research"
        note="Original investigations built on this infrastructure: what the question means, how the record is produced, and what an engineer can reproduce."
      >
        <div className="flex flex-col">
          {hubArticles.map((a) => (
            <Link
              key={a.slug}
              href={researchRoute(a.slug)}
              className="group flex flex-col gap-2 border-t border-[var(--ob-line)] py-6 first:border-t-0 first:pt-0"
            >
              <span className="ob-label">
                {a.category} · {a.publishedAt}
              </span>
              <span className="text-[19px] font-semibold tracking-[-0.015em] text-[var(--ob-text)] transition-colors group-hover:text-[var(--ob-signal)]">
                {a.title}
              </span>
              <span className="ob-body max-w-[76ch]">{a.summary}</span>
            </Link>
          ))}
        </div>
        <p className="ob-small mt-8">
          Foundations cited by every article here:{' '}
          <Link
            href={researchRoute('how-reliastra-measures-vendor-reliability')}
            className="ob-link"
          >
            measurement methodology
          </Link>
          {' · '}
          <Link href={researchRoute('reliastra-research-agenda')} className="ob-link">
            research agenda and standing rules
          </Link>{' '}
          · <Link href={PUBLIC_ROUTES.research} className="ob-link">all research</Link>
        </p>
      </RecordSection>

      <RecordSection
        index="06"
        id="concepts"
        title="Concepts referenced above"
        note="Defined once, precisely, in the glossary."
      >
        <ul className="flex flex-col gap-0">
          {[
            { href: '/glossary/quorum-detection', label: 'Quorum detection' },
            { href: '/glossary/transport-error', label: 'Transport error' },
            { href: '/glossary/vendor-reported-status', label: 'Vendor-reported status' },
            { href: '/glossary/partial-outage', label: 'Partial outage' },
            { href: '/glossary/independent-measurement', label: 'Independent measurement' },
            { href: '/glossary/incident-attribution', label: 'Incident attribution' },
          ].map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                className="flex items-baseline justify-between gap-6 border-t border-[var(--ob-line)] py-3 transition-colors hover:border-[var(--ob-line-3)] first:border-t-0"
              >
                <span className="text-[14px] text-[var(--ob-text)] transition-colors hover:text-[var(--ob-signal)]">
                  {c.label}
                </span>
                <span className="ob-label">Glossary</span>
              </Link>
            </li>
          ))}
        </ul>
      </RecordSection>

      <RecordSection
        index="07"
        id="reading-the-record"
        tone="base"
        title="How to use this hub"
      >
        <dl className="flex flex-col">
          <SpecRow term="During an incident" wide>
            Open the provider record for the state, the last observation timestamp, and the
            per-minute series. Compare - do not merge - with the vendor’s own status reporting.
          </SpecRow>
          <SpecRow term="After an incident" wide>
            The record gives you a measured window: which observations failed, from where, and
            when they recovered. Correlation with your own incident window is evidence of overlap,
            never proof of causation;{' '}
            <Link href={PUBLIC_ROUTES.incidentEvidence} className="ob-link">
              incident attribution
            </Link>{' '}
            states what RELIASTRA does and does not claim.
          </SpecRow>
          <SpecRow term="Before an incident" wide>
            Architecture decisions - retries, fallbacks, multi-provider routing - need stated
            windows and sample sizes. Every figure on a vendor record carries both; anything
            missing is printed as “insufficient data”.
          </SpecRow>
        </dl>
      </RecordSection>

      <section className="obs-section bg-[var(--ob-void)]" aria-labelledby="hub-cta">
        <div className="ob-container py-16 md:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-end lg:gap-16">
            <div className="flex flex-col gap-5">
              <p className="ob-label obs-label-signal">Your own record</p>
              <h2 id="hub-cta" className="ob-h2 max-w-[24ch]">
                Your product’s AI dependency list is longer than one vendor.
              </h2>
              <p className="ob-body max-w-[58ch]">
                Observe every API your product calls - public posture from RELIASTRA, private
                records for your own endpoints. Attribute failures with timestamped evidence that
                exists before the argument starts.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link href={AUTH_ROUTES.signup} className="ob-btn ob-btn-signal">
                  Monitor your dependencies
                </Link>
                <Link href={PUBLIC_ROUTES.dependencyMonitoring} className="ob-btn ob-btn-outline">
                  How it works
                </Link>
              </div>
              <p className="ob-small">
                Or read the{' '}
                <Link
                  href={researchRoute('how-reliastra-measures-vendor-reliability')}
                  className="ob-link"
                >
                  methodology
                </Link>{' '}
                first.
              </p>
            </div>
          </div>
        </div>
      </section>
    </ObservatoryShell>
  );
}

function HubFact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <dt className="ob-label">{term}</dt>
      <dd className="obs-num obs-num-sm text-[var(--ob-text-2)]">{children}</dd>
    </div>
  );
}

