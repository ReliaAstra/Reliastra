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
  // /partner/tiers and /partner/premium are NOT listed: both permanently
  // redirect to /partner/commission (see next.config), and a sitemap must
  // contain canonical URLs only - a redirect entry asks crawlers to index a
  // bounce.
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
  { path: '/glossary/independent-measurement', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/quorum-detection', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/transport-error', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/vendor-reported-status', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/partial-outage', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/availability', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/latency', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/observation-density', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/telemetry-integrity', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/dependency-blast-radius', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/failure-domain', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/control-plane', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/data-plane', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/external-trust-boundary', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/ai-api-dependency', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/model-routing', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/glossary/observability-blind-spot', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/research', changeFrequency: 'weekly' as const, priority: 0.8 },
  { path: '/research/ai-infrastructure', changeFrequency: 'hourly' as const, priority: 0.85 },
  // Research categories. A category is listed only when it has papers - an
  // empty category is a thin page, and the category route 404s rather than
  // rendering one.
  { path: '/research/measurement-integrity', changeFrequency: 'weekly' as const, priority: 0.8 },
  { path: '/research/cloud-security', changeFrequency: 'weekly' as const, priority: 0.8 },
  { path: '/about', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/contact', changeFrequency: 'monthly' as const, priority: 0.6 },
  { path: '/status', changeFrequency: 'daily' as const, priority: 0.6 },
  { path: '/privacy', changeFrequency: 'yearly' as const, priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly' as const, priority: 0.3 },
  { path: '/refund-policy', changeFrequency: 'yearly' as const, priority: 0.3 },
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
      'RELIASTRA checks each configured dependency on a fixed interval from its own infrastructure, records latency, status codes and outcomes with timestamps, applies a deterministic rule before declaring incidents, and binds evidence reports to checksums you can verify.',
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
      'Your auth provider starts returning 500s intermittently. RELIASTRA’s scheduled checks record exactly which calls failed and for how long, separating a brief blip from a sustained vendor-wide outage.',
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
      'Two payment providers both claim four nines. Independent 30-day measurement shows one at 99.98% with a 340ms p95, the other at 99.91% with three confirmed incidents. The architecture decision writes itself.',
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
  {
    slug: 'independent-measurement',
    term: 'Independent Measurement',
    short: 'A record produced by an observer with no stake in the outcome, from its own requests.',
    definition:
      'Independent measurement is observation performed by a party that neither operates the observed service nor depends on it: the observer issues its own requests, from its own infrastructure, records the raw results, and publishes the method that produced them.',
    problem:
      'Every account of an outage is written by someone. The operator’s logs, the vendor’s status page and the customer’s dashboards all describe the same window from positions with different incentives and different blind spots.',
    whyItMatters:
      'A record is only useful in a dispute if neither party authored it. Independent measurement converts “you say / we say” into one timestamped dataset both sides can check the provenance of.',
    example:
      'RELIASTRA’s public records measure the HTTP behaviour of a vendor’s listed endpoint from RELIASTRA infrastructure on a fixed schedule; the vendor’s own status text is never read, parsed or reconciled into the number.',
    howReliastra:
      'Independence is stated as scope, not claimed as authority: which endpoint, which origin, which method, which limits - published in the record itself so a reader can weigh the observation without trusting the brand. See the measurement methodology.',
    related: [
      { label: 'Measurement methodology', href: '/research/how-reliastra-measures-vendor-reliability' },
      { label: 'Public observatory', href: '/track' },
      { label: 'Vendor-reported status', href: '/glossary/vendor-reported-status' },
    ],
  },
  {
    slug: 'quorum-detection',
    term: 'Quorum Detection',
    short: 'Confirming a dependency incident only when independent observation points agree.',
    definition:
      'Quorum detection is the rule that an incident is confirmed only when a required number of independent observation points report failure within the same short correlation window - and recovery only when they agree it ended. Under a single-origin deployment the equivalent confirmation is persistence: the same point failing a fixed number of consecutive checks.',
    problem:
      'One failed probe can mean a dead vendor, a saturated network path, a DNS hiccup or a bug in the probe. Alerting on any single failure produces noise precisely when a team can least afford it.',
    whyItMatters:
      'An incident label is a claim. Corroboration is what lets a team act on it - page someone, fail over, open the credit conversation - without first spending thirty minutes deciding whether the alert is real.',
    example:
      'RELIASTRA’s shipped multi-origin rule: two or more genuinely distinct observation points must fail inside the same 60-second window to open an incident; two consecutive successes across them close it. The deployed public records run one origin, so they use the persistence rule and say so.',
    howReliastra:
      'The rule is a deterministic pure function of stored check results - no heuristics, no randomness - so any incident can be re-derived from the record. Two labels from one worker never count as two points; that asymmetry is the point.',
    related: [
      { label: 'Methodology', href: '/research/how-reliastra-measures-vendor-reliability' },
      { label: 'Dependency monitoring', href: '/glossary/dependency-monitoring' },
      { label: 'Transport error', href: '/glossary/transport-error' },
    ],
  },
  {
    slug: 'transport-error',
    term: 'Transport Error',
    short: 'A failure below HTTP: the request never produced a complete response.',
    definition:
      'A transport error is a probe failure that occurs before an HTTP status could be exchanged - DNS resolution failure, TCP refusal or reset, TLS handshake failure, or a timeout past the probe deadline. It is categorically different from receiving a 4xx or 5xx status.',
    problem:
      'Monitoring that collapses “no response” and “server returned 500” into one red dot destroys the distinction between an unreachable service and a reachable-but-failing one - two incidents with different owners, symptoms and fixes.',
    whyItMatters:
      'Transport errors localize: persistent failures from one origin but not another suggest a path or edge problem; failures from every origin suggest the target; timeouts under load can precede outright refusal and mark a degradation arc.',
    example:
      'RELIASTRA stores each observation with its outcome: status code and latency when a response arrived; an explicit error type when it did not. Availability counts “no expected response,” so the taxonomy stays visible in every aggregate.',
    howReliastra:
      'Probes run under a fixed deadline (15 seconds on public records) with bounded redirect handling, and the security policy can refuse a target before any request leaves - recorded as a policy block, a RELIASTRA-side fact, never as vendor downtime.',
    related: [
      { label: 'Quorum detection', href: '/glossary/quorum-detection' },
      { label: 'Dependency telemetry', href: '/glossary/dependency-telemetry' },
      { label: 'Availability', href: '/glossary/availability' },
    ],
  },
  {
    slug: 'vendor-reported-status',
    term: 'Vendor-Reported Status',
    short: 'What a provider says about itself - one record among several, not the ground truth.',
    definition:
      'Vendor-reported status is the state a provider publishes about its own services - the status page, the @-account, the email. It is authored by the party whose reliability is in question, scoped to incidents it chooses to declare, and updated on its own schedule.',
    problem:
      '“The status page says operational” is routinely treated as a measurement. It is a statement: often honest, occasionally delayed, structurally unable to describe what the vendor is not looking at.',
    whyItMatters:
      'During an incident, the gap between “not yet declared” and “not happening” is exactly where customer-side decisions live: fail over now or keep waiting. Decisions need evidence with a timestamp, and vendor statements are one input, not the clock.',
    example:
      'A status site can be fully operational while the API it reports on degrades; conversely a measured status-site failure during a traffic spike is real information about the vendor’s edge, whatever the API is doing. Neither record substitutes for the other.',
    howReliastra:
      'RELIASTRA never ingests, mirrors or reconciles vendor-reported status into its figures - and publishes the two records side by side conceptually, so disagreement is readable rather than averaged away. Where a vendor’s status endpoint is itself the observed target, the record says so explicitly.',
    related: [
      { label: 'Independent measurement', href: '/glossary/independent-measurement' },
      { label: 'Vendor reliability', href: '/glossary/vendor-reliability' },
      { label: 'Public observatory', href: '/track' },
    ],
  },
  {
    slug: 'partial-outage',
    term: 'Partial Outage',
    short: 'A dependency failing for some traffic, regions, routes or models - not all of them.',
    definition:
      'A partial outage is a failure window in which a service is unavailable or degraded for a subset of its surface: one region, one API route, one model tier, one auth path, one traffic class - while the rest functions normally. “Up” and “down” are both false descriptions of it.',
    problem:
      'Binary status vocabulary forces partial outages into the wrong bucket. A vendor reporting “no incidents” can be simultaneously true (no global outage) and useless (your route is timing out).',
    whyItMatters:
      'Partial outages are the most common failure mode of large platforms, they break failover logic that assumes whole-system down, and they are the hardest windows to evidence afterwards because every aggregate smooths them away.',
    example:
      'One region of a provider returning 5xx while two others serve normally; completions fast while realtime routes hang; public API degraded while the consumer app is untouched. Each is invisible to any single number - and to any observation from one vantage point.',
    howReliastra:
      'Per-observation storage with region, status and error type is what makes a partial outage visible: RELIASTRA reports exactly which origins, endpoints and windows observed failure, and prints “insufficient data” where its single-origin public record cannot speak to the rest.',
    related: [
      { label: 'Quorum detection', href: '/glossary/quorum-detection' },
      { label: 'Dependency telemetry', href: '/glossary/dependency-telemetry' },
      { label: 'AI infrastructure hub', href: '/research/ai-infrastructure' },
    ],
  },
  {
    slug: 'availability',
    term: 'Availability',
    short: 'The share of scheduled observations that received the expected response, per stated window.',
    definition:
      'Availability, as RELIASTRA measures it, is the number of observations in which the probe received the response its target expects (for public vendor records: HTTP 200 within 15 seconds), divided by all scheduled observations in a stated window, reported with the observation count and origins that produced it.',
    problem:
      '“99.99% uptime” without window, sample size and success definition is not a measurement - it is a decoration. The same month reads 100% from one origin and 99.2% from a region the observer did not run.',
    whyItMatters:
      'Four nines and three nines are 10x apart in downtime; a figure whose denominator is unstated cannot support an architecture decision, a contract clause, or a credit claim - it can only support a marketing bullet.',
    example:
      'On a RELIASTRA record, every window is printed as availability + observation count + latency quantiles, and a window with zero observations renders as “insufficient data” - never as 100%.',
    howReliastra:
      'Availability is derived at read time from stored observations only; nothing is backfilled or smoothed. The denominator is scheduled probes, so “we never ran the check” surfaces as freshness (staleness) rather than hiding inside the percentage.',
    related: [
      { label: 'Dependency telemetry', href: '/glossary/dependency-telemetry' },
      { label: 'Transport error', href: '/glossary/transport-error' },
      { label: 'Public observatory', href: '/track' },
    ],
  },
  {
    slug: 'latency',
    term: 'Latency',
    short: 'Time from probe dispatch to complete response - the leading indicator of degradation.',
    definition:
      'Probe latency is the wall-clock time between a scheduled check issuing its request and receiving the complete response (including any policy-validated redirect hops), recorded per observation and aggregated as a mean and 95th percentile per window.',
    problem:
      'Availability says whether a request completed; only latency says what clients experienced while it did. Most dependency incidents spend minutes-to-hours in “up but slow” territory before, during, and after the visible outage - and availability dashboards show green the whole time.',
    whyItMatters:
      'Timeouts are latency failures viewed from the client: a route degrading to 3 seconds turns into “outage” the moment it crosses the caller’s deadline. Watching the p95 is what separates a capacity conversation from a postmortem about a cliff nobody saw.',
    example:
      'A record showing p95 climbing while the mean holds describes long-tail failure (one shard, one region). RELIASTRA charts the mean per bucket with failed buckets breaking the line, and prints the p95 threshold beside it.',
    howReliastra:
      'Latency is measured from outside both networks, on the same schedule as availability, so a drift is timestamped in the same series that will later be cited as evidence. An aggregate mean of zero means “no successful response recorded,” and is printed as no data, never as a fast response.',
    related: [
      { label: 'Availability', href: '/glossary/availability' },
      { label: 'Dependency telemetry', href: '/glossary/dependency-telemetry' },
      { label: 'Methodology', href: '/research/how-reliastra-measures-vendor-reliability' },
    ],
  },
  {
    slug: 'observation-density',
    term: 'Observation density',
    short: 'Observations that exist, against observations the schedule implies.',
    definition:
      'Observation density is the ratio of observations actually recorded in a window to the number the probe schedule implies should exist there: total_observations divided by (window_seconds / probe_interval). It is a measure of the measurement, not of the endpoint.',
    problem:
      'Availability is blind to the absence of measurement. A scheduler that stops issuing probes produces no failed observations and therefore no availability deficit - the record stays green while the evidence stops accumulating, and an availability figure computed over a near-empty window is indistinguishable from one computed over a full one.',
    whyItMatters:
      'Density is the signal that separates an endpoint failing from a measurement pipeline failing. They have different causes, different owners and different fixes, and they produce opposite readings on the same availability chart.',
    example:
      'On 11 September 2026 the RELIASTRA public record for one dependency returned 277 observations in a 24-hour window against 288 expected (96.2% density) and 595 in a 90-day window against 25,920 expected (2.3%). Availability read 100.0% in both. The falling density, not the availability, was the finding.',
    howReliastra:
      'RELIASTRA publishes the observation count beside every availability figure and audits its own records for density. The three-check audit - window monotonicity, history depth, expected-versus-observed density - is published with its script and its captured data so anyone can run it against their own monitoring supplier.',
    related: [
      { label: 'Availability', href: '/glossary/availability' },
      { label: 'Telemetry integrity', href: '/glossary/telemetry-integrity' },
      { label: 'Availability-record audit', href: '/research/measurement-integrity/availability-record-audit' },
    ],
  },
  {
    slug: 'telemetry-integrity',
    term: 'Telemetry integrity',
    short: 'Whether a record can be trusted to be complete, correctly labelled and auditable.',
    definition:
      'Telemetry integrity is the property of an observation record that its contents are what they claim to be: observations actually taken, windows that the stored data can fill, labels that match the underlying sample, and enough disclosed provenance - count, window bounds, probe interval, origin - for a reader to check the arithmetic.',
    problem:
      'Incident attribution depends on the completeness of a record as much as on its accuracy. An incomplete record does not merely miss failures; it makes absences ambiguous, so "no failures were recorded" and "no measurements were taken" become indistinguishable.',
    whyItMatters:
      'An attacker who can suppress measurements achieves the same evidentiary effect as one who can falsify them, at lower cost and with less detectability. Publishing the denominator is what closes that ambiguity, which makes telemetry integrity a security property and not only a data-quality one.',
    example:
      'A 90-day availability figure computed over 2.1 days of observations is arithmetically correct and evidentially thin. Both properties have to be visible in the record, or a reader - or a retrieval system quoting the page - cannot tell which one they are looking at.',
    howReliastra:
      'Observations are written with their origin and timestamp, never backfilled, and pruned by scheduled jobs rather than silently truncated. Evidence reports are checksummed and bound to the organisation that produced them. Where the public record falls short of this standard, RELIASTRA publishes the audit that found it.',
    related: [
      { label: 'Observation density', href: '/glossary/observation-density' },
      { label: 'Dependency telemetry', href: '/glossary/dependency-telemetry' },
      { label: 'Availability-record audit', href: '/research/measurement-integrity/availability-record-audit' },
    ],
  },
  {
    slug: 'dependency-blast-radius',
    term: 'Dependency blast radius',
    short: 'The set of your functionality that fails when one external dependency does.',
    definition:
      'Dependency blast radius is the set of application functionality, data paths and user journeys that degrade or fail when a single external dependency degrades - including the parts that never call it directly, reached through shared workers, connection pools, queues and retry amplification.',
    problem:
      'The obvious blast radius is the feature that calls the dependency. The real one is larger: long-running calls hold connections and workers that unrelated features also need, so a partial upstream problem becomes a full application outage and produces an incident report naming the wrong component.',
    whyItMatters:
      'Blast radius is what makes a dependency a risk rather than a line item. It determines how much isolation an architecture needs, and it is usually discovered during an incident rather than designed for beforehand.',
    example:
      'A model provider degrades. Client timeouts hold sockets, retries multiply the load, queues grow, workers saturate - and the alert fires in a background job that never called the provider API, six hops from the cause.',
    howReliastra:
      'RELIASTRA keeps an independent, timestamped record of the dependency side of the timeline, so the outer edge of the blast radius can be correlated against the moment the dependency was independently observed failing rather than inferred from the alert that fired first.',
    related: [
      { label: 'Failure domain', href: '/glossary/failure-domain' },
      { label: 'Incident attribution', href: '/glossary/incident-attribution' },
      { label: 'AI API trust boundary', href: '/research/cloud-security/ai-api-trust-boundary' },
    ],
  },
  {
    slug: 'failure-domain',
    term: 'Failure domain',
    short: 'The set of components that fail together, and therefore must be reasoned about together.',
    definition:
      'A failure domain is the set of components that share a failure cause: a region, an availability zone, a connection pool, a worker fleet, a provider account, a DNS resolver. Components in the same domain do not provide redundancy for each other, however many of them there are.',
    problem:
      'Redundancy is routinely counted in instances rather than in domains. Two workers on one host, two regions behind one control plane, or two "independent" probes issued by one process are one failure domain wearing several names - and a quorum computed across them confirms a single opinion.',
    whyItMatters:
      'Failure-domain reasoning is what turns "we have redundancy" into a statement that can be checked. It also bounds blast radius: isolating a dependency into its own domain is the difference between a degraded feature and a degraded product.',
    example:
      'Two scheduling labels emitted by one worker are one observation point. Treating their agreement as a quorum reports one machine\u2019s opinion as independent confirmation, which is why RELIASTRA\u2019s detection policy distinguishes a single observation topology from a multi-point one and applies a different rule to each.',
    howReliastra:
      'Every observation carries the origin that produced it, and the incident detection rule is explicit about topology: persistence when there is one observation point, agreement across distinct points when there are genuinely several. Labels are never promoted into independence.',
    related: [
      { label: 'Quorum detection', href: '/glossary/quorum-detection' },
      { label: 'Dependency blast radius', href: '/glossary/dependency-blast-radius' },
      { label: 'Measurement methodology', href: '/research/how-reliastra-measures-vendor-reliability' },
    ],
  },
  {
    slug: 'control-plane',
    term: 'Control plane',
    short: 'The part of a system that decides what should happen.',
    definition:
      'The control plane is the set of components that decide and direct behaviour: schedulers, configuration services, orchestration APIs, routing decisions, credential issuance. It issues instructions; it does not carry the workload\u2019s data. In a measurement system the scheduler and broker are the control plane and the workers are the data plane.',
    problem:
      'Control-plane failure looks nothing like data-plane failure and is routinely misread as one. A scheduler that stops produces no errors - it produces an absence of work, which surfaces as missing observations, stale configuration or checks that silently stop running while every health endpoint still returns 200.',
    whyItMatters:
      'Availability of the data plane says nothing about the control plane. During cloud incidents the two fail on different schedules and recover independently, and an incident report that does not distinguish them will recommend the wrong fix.',
    example:
      'When RELIASTRA\u2019s scheduler, broker or worker is unavailable, checks simply do not run - and the system reports that. A missed probe is never backfilled with a synthesised result, because an observation that did not happen must never appear in a history anyone intends to rely on.',
    howReliastra:
      'Checks never run inside the API process that serves the dashboard, so a busy dashboard cannot delay a probe and a slow probe cannot block the API. Scheduler health is reported separately from check outcomes, and the absence of observations is surfaced rather than defaulted to a healthy value.',
    related: [
      { label: 'Data plane', href: '/glossary/data-plane' },
      { label: 'Observation density', href: '/glossary/observation-density' },
      { label: 'Measurement methodology', href: '/research/how-reliastra-measures-vendor-reliability' },
    ],
  },
  {
    slug: 'data-plane',
    term: 'Data plane',
    short: 'The part of a system that carries the workload.',
    definition:
      'The data plane is the path that actually carries requests and responses: the network, the load balancers, the proxies, the workers that execute work and the storage that holds it. It is where latency, throughput and errors are observable, and it can be healthy while the control plane that directs it is not.',
    problem:
      'Monitoring almost always watches the data plane, because that is where the measurable signals are. The consequence is that control-plane failures are inferred from data-plane symptoms - usually as an unexplained drop in traffic - rather than detected directly.',
    whyItMatters:
      'Separating the two planes is what makes an incident attributable. "Requests are failing" and "no requests were issued" are different events with different causes, and only the second is a control-plane failure.',
    example:
      'A probe worker fleet that is running but has received no dispatch instructions shows a healthy data plane and zero observations. The correct reading is a control-plane failure; the data-plane-only reading is that nothing happened.',
    howReliastra:
      'RELIASTRA reports both sides separately: scheduler and worker health as control-plane state, and per-observation latency, status and outcome as data-plane evidence. The two are never merged into a single "system healthy" value.',
    related: [
      { label: 'Control plane', href: '/glossary/control-plane' },
      { label: 'Dependency telemetry', href: '/glossary/dependency-telemetry' },
      { label: 'Measurement methodology', href: '/research/how-reliastra-measures-vendor-reliability' },
    ],
  },
  {
    slug: 'external-trust-boundary',
    term: 'External trust boundary',
    short: 'The line where your controls stop and a third party\u2019s begin.',
    definition:
      'An external trust boundary is the point at which data, credentials or control leave the domain governed by your organisation and enter one governed by someone else. Everything downstream of it is subject to that party\u2019s controls, and most of it is not observable from your side.',
    problem:
      'Boundaries are usually drawn around the network perimeter, which is where they stopped being meaningful. A dependency call crosses a boundary wherever payload or credential leaves the domain - through a managed gateway, a resolver, a provider edge - and those crossings are frequently absent from both the dependency inventory and the security review.',
    whyItMatters:
      'A control that cannot be enforced at a boundary has to be enforced before it, or accepted as trust. Knowing which is which is the difference between an architecture with stated assumptions and one with unstated ones.',
    example:
      'Mutual TLS and workload identity establish who is calling. They establish nothing about what the callee does with the payload, which model serves it, or where inference is executed - so the enforceable controls at a model-API boundary are architectural and contractual, not cryptographic.',
    howReliastra:
      'RELIASTRA observes dependencies from outside both stacks, which makes the boundary itself measurable: an independent, timestamped record of what the external side did, kept separate from your own incident history so the two can be compared rather than merged.',
    related: [
      { label: 'AI API dependency', href: '/glossary/ai-api-dependency' },
      { label: 'External Dependency Intelligence', href: '/glossary/external-dependency-intelligence' },
      { label: 'AI API trust boundary', href: '/research/cloud-security/ai-api-trust-boundary' },
    ],
  },
  {
    slug: 'ai-api-dependency',
    term: 'AI API dependency',
    short: 'A model reached over the network - a dependency whose payload you only partly control.',
    definition:
      'An AI API dependency is a hosted model service consumed over the network, where the request payload is composed at call time from system instructions, retrieved documents, prior conversation turns and tool output, and where routing to the underlying model, serving tier and region is decided inside the provider\u2019s trust domain.',
    problem:
      'It is treated as a larger version of a conventional SaaS API dependency, and it is not. The payload is partly authored by a retrieval step rather than by the application, retries are a cost and quota control as well as a reliability one, and the provider\u2019s status plane and serving plane fail independently.',
    whyItMatters:
      'Each of those differences changes a control. Data classification has to move upstream of the call; failure-domain isolation becomes a reliability requirement with a security benefit; and an availability figure for "the provider" is a measurement of one endpoint, not of the service.',
    example:
      'RELIASTRA\u2019s public record for OpenAI observes https://status.openai.com from one region. That record is evidence about the status site. It is not evidence about the inference API, and the public page says so rather than letting the vendor name imply otherwise.',
    howReliastra:
      'RELIASTRA monitors the externally observable endpoints of AI providers from its own infrastructure, names each endpoint and region explicitly, and keeps the status plane and the serving plane as separate records rather than one vendor-level availability figure.',
    related: [
      { label: 'Model routing', href: '/glossary/model-routing' },
      { label: 'External trust boundary', href: '/glossary/external-trust-boundary' },
      { label: 'AI infrastructure hub', href: '/research/ai-infrastructure' },
    ],
  },
  {
    slug: 'model-routing',
    term: 'Model routing',
    short: 'The provider-side decision about what actually serves your request.',
    definition:
      'Model routing is the set of provider-side decisions that map an API request to a serving path: which model version, which serving tier, which region, and whether the request is served directly, queued, cached or redirected to a different backend. It happens inside the provider\u2019s trust domain.',
    problem:
      'The consumer addresses a model name and observes a response. Everything between the two is invisible unless the provider chooses to disclose it in response metadata, so a change of underlying version, tier or region is not detectable at the API boundary in advance.',
    whyItMatters:
      'Routing is where behavioural and reliability differences originate. An application pinned to a model name can experience a change it did not request and cannot see, and an incident attributed to "the model" may in fact be a routing change.',
    example:
      'Latency and error-rate shifts that correlate with nothing the consumer changed are the signature of a routing or serving-tier change. Detecting them after the fact requires capturing response metadata, not just status codes.',
    howReliastra:
      'RELIASTRA records what it can observe - endpoint, region, status, latency, timestamp - and states explicitly what its record does not cover. Model-level endpoints and per-route API latency are not part of the public observatory today, and the hub says so in its own sections rather than in a footnote.',
    related: [
      { label: 'AI API dependency', href: '/glossary/ai-api-dependency' },
      { label: 'Partial outage', href: '/glossary/partial-outage' },
      { label: 'AI infrastructure hub', href: '/research/ai-infrastructure' },
    ],
  },
  {
    slug: 'observability-blind-spot',
    term: 'Observability blind spot',
    short: 'A failure mode your instrumentation is structurally unable to report.',
    definition:
      'An observability blind spot is a class of failure that a monitoring system cannot report, not because of a configuration gap but because of what it measures. The classic case: an availability metric cannot report the absence of measurement, because a missing probe produces no failed observation.',
    problem:
      'Blind spots are invisible by definition. A dashboard that has never shown a particular failure mode looks complete, and the gap is discovered during the incident it failed to report.',
    whyItMatters:
      'A blind spot is a property of the instrument, so it cannot be closed by adding more of the same signal. It needs a different measurement - density against expectation, control-plane health, an independent observation from outside the system being watched.',
    example:
      'A monitoring system that watches only your own services has a blind spot shaped exactly like your dependency graph. A scheduler that stops shows a healthy availability record and no observations. A cadence estimated from bucketed telemetry reports the chart resolution rather than the probe interval.',
    howReliastra:
      'RELIASTRA observes dependencies from outside both stacks, publishes the observation count beside every percentage, states what its records do not cover, and publishes audits of its own instrument when one is found - including the estimator defect documented in the probe-interval paper.',
    related: [
      { label: 'Observation density', href: '/glossary/observation-density' },
      { label: 'Telemetry integrity', href: '/glossary/telemetry-integrity' },
      { label: 'Probe interval estimation', href: '/research/measurement-integrity/probe-interval-from-bucketed-telemetry' },
    ],
  },
];
