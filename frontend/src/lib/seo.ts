import type { Metadata } from 'next';

/**
 * Single source of truth for RELIASTRA's public search architecture.
 *
 * Search-intent map (keyword → intent → target page):
 *
 * - "external dependency monitoring" (know) ......... /external-dependency-intelligence
 * - "third-party dependency monitoring" (compare) .... /dependency-monitoring
 * - "API dependency monitoring" (solve) ............. /dependency-monitoring
 * - "vendor outage detection" (solve) ............... /track (+ /track/[vendor])
 * - "incident attribution / outage attribution" ..... /incident-evidence
 * - "outage evidence / SLA evidence / SLA claims" ... /sla-evidence
 * - "SLA monitoring / SLA credits" (commercial) ..... /sla-evidence
 * - "third-party outage proof" (urgent solve) ....... /incident-evidence
 * - "reliability verification / vendor reliability" . /external-dependency-intelligence
 * - "product overview / pricing / security" ......... /product, /pricing, /security
 * - "how it works / docs" (learn/build) ............ /docs/*
 * - "concept definitions" (learn) .................. /glossary/*
 * - "original incident analysis" (trust) ........... /research/*
 * - "live vendor status" (monitor) ................. /track, /track/[vendor]
 *
 * Topic clusters:
 *   Category  → /external-dependency-intelligence (pillar)
 *   Problems  → /incident-evidence, /sla-evidence, /dependency-monitoring
 *   Capability→ /product, /docs/*
 *   Proof     → /track/[vendor], /research/*, /status
 *   Company   → /about, /contact, /security, /pricing
 *   Concepts  → /glossary/*
 *
 * Every indexable page answers: WHO / WHAT problem / WHY it matters /
 * HOW RELIASTRA solves it / WHAT evidence supports it / WHAT next.
 */

export const SITE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://reliastra.com').replace(/\/$/, '');

export const SITE_NAME = 'RELIASTRA';
export const SITE_TAGLINE = 'External Dependency Intelligence';
export const SITE_DESCRIPTION =
  'RELIASTRA monitors the third-party APIs and services your product depends on, attributes failures to the responsible dependency, and produces independent, timestamped SLA evidence.';

export const SITE_ORG = {
  name: 'Reliastra, Inc.',
  brand: 'RELIASTRA',
  url: SITE_URL,
  logo: `${SITE_URL}/logo.svg`,
  email: 'support@reliastra.com',
  salesEmail: 'sales@reliastra.com',
  github: 'https://github.com/ReliaAstra',
} as const;

export type SeoPageInput = {
  title: string;
  description: string;
  path: string;
  /** Override for `<title>` when the template should not apply. Defaults to `${title} | RELIASTRA` handling. */
  absoluteTitle?: boolean;
  image?: string;
  type?: 'website' | 'article';
  publishedTime?: string;
  modifiedTime?: string;
  noindex?: boolean;
};

/** Canonical absolute URL for a site path. */
export function canonicalUrl(path: string): string {
  if (!path.startsWith('/')) return `${SITE_URL}/${path}`;
  if (path === '/') return `${SITE_URL}/`;
  return `${SITE_URL}${path}`;
}

/**
 * Framework-native metadata builder. Every indexable page uses this so
 * title / description / canonical / OG / Twitter stay consistent and unique.
 */
export function buildMetadata(input: SeoPageInput): Metadata {
  const url = canonicalUrl(input.path);
  const image = input.image ?? `${SITE_URL}/opengraph-image.png`;
  const robots = input.noindex
    ? { index: false, follow: false, noarchive: true }
    : { index: true, follow: true };

  return {
    title: input.absoluteTitle ? input.title : input.title,
    description: input.description,
    alternates: { canonical: url },
    robots,
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      siteName: SITE_NAME,
      type: input.type ?? 'website',
      ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
      ...(input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
      images: [{ url: image, width: 1200, height: 630, alt: input.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      images: [image],
    },
  };
}

// ── JSON-LD builders (all match visible page content; no fabricated claims) ──

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_ORG.name,
    alternateName: SITE_ORG.brand,
    url: `${SITE_URL}/`,
    logo: { '@type': 'ImageObject', url: SITE_ORG.logo },
    email: SITE_ORG.email,
    sameAs: [SITE_ORG.github],
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: `${SITE_URL}/`,
    name: `${SITE_NAME} - ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    publisher: { '@id': `${SITE_URL}/#organization` },
    inLanguage: 'en',
  };
}

export function softwareAppJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    url: `${SITE_URL}/`,
    description: SITE_DESCRIPTION,
    publisher: { '@id': `${SITE_URL}/#organization` },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: canonicalUrl(item.path),
    })),
  };
}

export function faqJsonLd(faqs: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export function articleJsonLd(input: {
  title: string;
  description: string;
  path: string;
  publishedAt: string;
  updatedAt?: string;
  tags?: string[];
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: input.title,
    description: input.description,
    datePublished: input.publishedAt,
    dateModified: input.updatedAt ?? input.publishedAt,
    author: { '@type': 'Organization', name: SITE_ORG.name, url: `${SITE_URL}/` },
    publisher: {
      '@type': 'Organization',
      name: SITE_ORG.name,
      logo: { '@type': 'ImageObject', url: SITE_ORG.logo },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl(input.path) },
    ...(input.tags?.length ? { keywords: input.tags.join(', ') } : {}),
    inLanguage: 'en',
  };
}

// ── Canonical public information architecture ────────────────────────────────
// Only canonical, indexable, server-rendered pages. Authenticated, token-scoped
// and console routes are deliberately absent (see robots.ts + per-page noindex).

export const PUBLIC_PAGES = [
  { path: '/', changeFrequency: 'daily' as const, priority: 1.0 },
  { path: '/product', changeFrequency: 'weekly' as const, priority: 0.9 },
  { path: '/agencies', changeFrequency: 'weekly' as const, priority: 0.85 },
  { path: '/external-dependency-intelligence', changeFrequency: 'weekly' as const, priority: 0.9 },
  { path: '/dependency-monitoring', changeFrequency: 'weekly' as const, priority: 0.9 },
  { path: '/sla-evidence', changeFrequency: 'weekly' as const, priority: 0.9 },
  { path: '/incident-evidence', changeFrequency: 'weekly' as const, priority: 0.9 },
  { path: '/track', changeFrequency: 'hourly' as const, priority: 0.9 },
  { path: '/pricing', changeFrequency: 'weekly' as const, priority: 0.8 },
  { path: '/partner', changeFrequency: 'weekly' as const, priority: 0.7 },
  { path: '/partner/earn', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/partner/how-it-works', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/partner/commission', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/partner/faq', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/partner/tiers', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/partner/premium', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/partner/resources', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/security', changeFrequency: 'monthly' as const, priority: 0.7 },
  { path: '/docs', changeFrequency: 'weekly' as const, priority: 0.8 },
  { path: '/docs/quickstart', changeFrequency: 'monthly' as const, priority: 0.7 },
  { path: '/docs/monitoring', changeFrequency: 'monthly' as const, priority: 0.7 },
  { path: '/docs/evidence', changeFrequency: 'monthly' as const, priority: 0.7 },
  { path: '/docs/api', changeFrequency: 'monthly' as const, priority: 0.7 },
  { path: '/glossary', changeFrequency: 'monthly' as const, priority: 0.7 },
  { path: '/glossary/external-dependency-intelligence', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/dependency-monitoring', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/incident-attribution', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/sla-evidence', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/vendor-reliability', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/dependency-telemetry', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/infrastructure-evidence', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/external-dependency-fault-report', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/research', changeFrequency: 'weekly' as const, priority: 0.8 },
  { path: '/about', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/contact', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/status', changeFrequency: 'daily' as const, priority: 0.6 },
  { path: '/privacy', changeFrequency: 'yearly' as const, priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly' as const, priority: 0.3 },
] as const;

// ── Glossary (concept layer: definition → problem → why → example → approach) ─

export type GlossaryTerm = {
  slug: string;
  term: string;
  short: string;
  definition: string;
  problem: string;
  whyItMatters: string;
  example: string;
  howReliastra: string;
  related: { label: string; href: string }[];
};

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    slug: 'external-dependency-intelligence',
    term: 'External Dependency Intelligence',
    short: 'Independent knowledge about the third-party services your product depends on.',
    definition:
      'External Dependency Intelligence is the practice of continuously observing the third-party APIs and services your infrastructure depends on - from outside both your stack and the vendor’s - and turning those observations into attributable, timestamped records of behavior.',
    problem:
      'Your own monitoring tells you that your checkout is failing. It cannot tell you whether the cause is your code or the payment provider three hops away whose status page still reads “operational”.',
    whyItMatters:
      'Without an independent record, every vendor incident becomes an argument about whose system failed. With one, it becomes a comparison of two measured timelines.',
    example:
      'At 14:02 your error rate spikes. RELIASTRA’s regional probes show your payment provider’s API timing out from two regions over the same window, while your database latency is flat. The investigation starts at the vendor, not in your codebase.',
    howReliastra:
      'RELIASTRA checks each configured dependency on a fixed interval from independent regions, records latency, status codes and outcomes with timestamps, applies quorum rules before declaring incidents, and binds evidence reports to checksums you can verify.',
    related: [
      { label: 'External Dependency Intelligence', href: '/external-dependency-intelligence' },
      { label: 'Incident attribution', href: '/glossary/incident-attribution' },
      { label: 'Dependency telemetry', href: '/glossary/dependency-telemetry' },
    ],
  },
  {
    slug: 'dependency-monitoring',
    term: 'Dependency Monitoring',
    short: 'Continuous third-party API observation with quorum-confirmed incidents.',
    definition:
      'Dependency monitoring is the continuous probing of external endpoints your product relies on - APIs, auth providers, payment gateways, cloud services - to detect degradation before your users report it.',
    problem:
      'Vendor status pages are written by humans, after the fact, and scoped to incidents the vendor chose to declare. Timing is approximate and the record belongs to the counterparty.',
    whyItMatters:
      'A dependency that fails silently breaks your product while every internal dashboard stays green. Direct measurement closes that blind spot.',
    example:
      'Your auth provider starts returning 500s to one region. RELIASTRA’s multi-region checks disagree - one origin fails, two succeed - distinguishing a regional path problem from a vendor-wide outage.',
    howReliastra:
      'One scheduler dispatches one task per dependency per region through a message broker to workers. Every result carries its region. Recovery requires consecutive successes, so flapping does not page your team twice.',
    related: [
      { label: 'Dependency monitoring', href: '/dependency-monitoring' },
      { label: 'Vendor reliability', href: '/glossary/vendor-reliability' },
      { label: 'Track vendors', href: '/track' },
    ],
  },
  {
    slug: 'incident-attribution',
    term: 'Incident Attribution',
    short: 'Determining whether an incident originated inside your stack or with a vendor.',
    definition:
      'Incident attribution is the process of assigning an observed failure to its most likely origin - your infrastructure or a specific external dependency - using correlated timelines rather than inference.',
    problem:
      'An outage you caused and an outage your vendor caused look identical from inside your own monitoring. Both present as your service failing.',
    whyItMatters:
      'Correct attribution decides where engineers look first, what gets rolled back, what gets escalated to a vendor, and what evidence supports an SLA claim.',
    example:
      'Your incident window (14:02–14:19) overlaps a period in which the dependency was independently observed failing across two regions. That overlap is a fact about two measured timelines.',
    howReliastra:
      'RELIASTRA keeps your incident history and the dependency’s observation history on the same timeline, applies a deterministic correlation engine with confidence levels, and refuses to claim causation - only correlated, timestamped evidence.',
    related: [
      { label: 'Incident evidence', href: '/incident-evidence' },
      { label: 'SLA evidence', href: '/glossary/sla-evidence' },
      { label: 'Methodology', href: '/research/how-reliastra-measures-vendor-reliability' },
    ],
  },
  {
    slug: 'sla-evidence',
    term: 'SLA Evidence',
    short: 'Timestamped, checksummed records of vendor behavior for credit conversations.',
    definition:
      'SLA evidence is an independent, timestamped record of a vendor’s observed behavior during a failure window - suitable for bringing into a service-credit conversation governed by your contract with that vendor.',
    problem:
      'Screenshots and Slack messages do not settle credit disputes. The vendor’s own status page is written by the counterparty to the claim.',
    whyItMatters:
      'An SLA claim needs an independent record of the window. A vendor status page is written by the counterparty to the claim.',
    example:
      'A 17-minute degradation with per-minute observations from two regions and the correlated incident window, compiled into one report with a verifiable checksum.',
    howReliastra:
      'When a vendor incident is confirmed, RELIASTRA compiles the independent observations, the window and the attribution result. Reports are checksummed, bound to your organization, and verifiable without disclosing endpoints or credentials.',
    related: [
      { label: 'SLA evidence', href: '/sla-evidence' },
      { label: 'Infrastructure evidence', href: '/glossary/infrastructure-evidence' },
      { label: 'Evidence docs', href: '/docs/evidence' },
    ],
  },
  {
    slug: 'vendor-reliability',
    term: 'Vendor Reliability',
    short: 'How consistently a third-party service meets its expected behavior over time.',
    definition:
      'Vendor reliability is the measured consistency of a third-party service - uptime, latency distribution and incident frequency - observed independently over stated windows and origin sets.',
    problem:
      'Self-reported “99.99% uptime” figures rarely state the window, the origin set, or how outcomes were classified. A number without those is marketing.',
    whyItMatters:
      'Reliability determines architecture (retries, fallbacks, multi-vendor), contract terms (SLA clauses, credits), and incident readiness (who gets paged).',
    example:
      'Two payment providers both claim four nines. Independent 30-day measurement shows one at 99.98% with a 340ms p95, the other at 99.91% with three multi-region incidents. The architecture decision writes itself.',
    howReliastra:
      'RELIASTRA publishes aggregated posture only for vendors made public, always with window and methodology stated. Public Track pages show uptime, latency and incident history measured - not self-reported.',
    related: [
      { label: 'Track vendors', href: '/track' },
      { label: 'Dependency telemetry', href: '/glossary/dependency-telemetry' },
      { label: 'Research agenda', href: '/research/reliastra-research-agenda' },
    ],
  },
  {
    slug: 'dependency-telemetry',
    term: 'Dependency Telemetry',
    short: 'The raw observations behind every reliability claim: checks, regions, outcomes.',
    definition:
      'Dependency telemetry is the retained record of every probe against a dependency - timestamp, region of origin, latency, status code and outcome - from which uptime, latency and incident figures are derived.',
    problem:
      'An uptime percentage without its underlying observations cannot be audited. You cannot distinguish “vendor down” from “we never ran the probe”.',
    whyItMatters:
      'Telemetry is what makes a reliability claim inspectable. It separates target failures (the vendor failed) from infrastructure failures (the probe could not run) and transitional states (never checked, queued, executing).',
    example:
      'A gap in the chart is labeled explicitly: policy-blocked target, dispatch failure, or dead scheduler - three different causes with three different owners, never collapsed into “no data”.',
    howReliastra:
      'Each stored result records region, outcome, status code, latency and execution time. Missed probes are never backfilled. Retention follows the plan (24 hours on Free up to 90 days on Pro).',
    related: [
      { label: 'Monitoring docs', href: '/docs/monitoring' },
      { label: 'Measurement methodology', href: '/research/how-reliastra-measures-vendor-reliability' },
    ],
  },
  {
    slug: 'infrastructure-evidence',
    term: 'Infrastructure Evidence',
    short: 'Verifiable records of how infrastructure behaved during a window.',
    definition:
      'Infrastructure evidence is any verifiable record of how systems behaved during a time window - probe results, incident timelines, correlation outputs - preserved with enough context (timestamps, origins, checksums) to be relied upon later.',
    problem:
      'Logs rotate, dashboards are mutable, and memories of an incident decay within days. By the time a credit conversation or postmortem happens, the record is gone or disputed.',
    whyItMatters:
      'Evidence converts a transient outage into a durable, checkable artifact: postmortems cite it, vendors respond to it, contracts reference it.',
    example:
      'A fault report covering a 22-minute window: per-region observations, quorum verdict, correlated customer impact, and a SHA-256 checksum binding the report to the organization that generated it.',
    howReliastra:
      'Generated reports are checksummed and bound to the producing organization. A public verification reference confirms a report exists and matches its checksum - without disclosing endpoints, headers or account details.',
    related: [
      { label: 'Incident evidence', href: '/incident-evidence' },
      { label: 'Fault reports', href: '/glossary/external-dependency-fault-report' },
    ],
  },
  {
    slug: 'external-dependency-fault-report',
    term: 'External Dependency Fault Report',
    short: 'The artifact that attributes a failure window to a specific dependency.',
    definition:
      'An External Dependency Fault Report is the compiled artifact for one failure window: which dependency failed, over what interval, observed from where, with what severity, what customer impact correlated, and what the record’s checksum is.',
    problem:
      'Incident threads contain fragments - graphs, pasted curl output, status-page screenshots. Nobody can later reconstruct exactly what was observed and when.',
    whyItMatters:
      'A single compiled report replaces a scattered thread. It is what gets attached to vendor tickets, postmortems and SLA claims.',
    example:
      'Report contents: dependency, window (UTC), per-region timeline, quorum verdict, severity, correlated incidents, methodology reference, checksum, verification link.',
    howReliastra:
      'Reports are generated from retained telemetry on detection or on demand, carry the organization binding and checksum, and expose a public verification endpoint that confirms existence and integrity - never private configuration.',
    related: [
      { label: 'SLA evidence', href: '/sla-evidence' },
      { label: 'Evidence docs', href: '/docs/evidence' },
    ],
  },
];
