import { SITE_URL } from '@/lib/seo';
import {
  EXTERNAL_LINKS,
  PUBLIC_ROUTES,
  RESEARCH_ARTICLES,
  SHARE_ROUTES,
  researchRoute,
} from '@/lib/routes';
import { DETECTION, OBSERVATION_LABEL, OBSERVATION_POINTS, PROBE_INTERVAL_SECONDS } from '@/lib/methodology';
import { readCatalogForDiscovery } from '@/lib/track-api';
import { renderAtRequestTime } from '@/lib/render-at-request-time';

/**
 * /llms.txt - the machine-readable description of RELIASTRA.
 *
 * Written for a reader that will not scroll: absolute HTTPS URLs, no marketing
 * sentences, and the methodology stated with its limits attached. The
 * paragraph on topology is here because a model answering "does RELIASTRA
 * confirm outages across regions" from a guess would be wrong in a way that
 * matters - so the answer is written out.
 *
 * Every URL below is canonical after the developer-first consolidation
 * (`/track` → `/observatory`, four capability pages → `/product`).
 */
/** The API origin, interpolated so the file never states a path a caller
 * cannot reach. */
const API = EXTERNAL_LINKS.api;

/** Placeholder in BODY, replaced per request with the enumerated record list. */
const RECORDS_MARKER = '<!--records-->';

const BODY = `# RELIASTRA

> RELIASTRA observes the external services software depends on. It issues its
> own HTTP probes, records every observation, confirms faults deterministically,
> and produces evidence records a third party can verify without an account.

## What RELIASTRA is

An external dependency observation product for individual engineers: SREs,
platform engineers, backend and infrastructure engineers, and engineers running
production AI applications on hosted model APIs.

RELIASTRA is not uptime monitoring. Uptime monitoring watches your own
infrastructure. RELIASTRA watches the third-party services your software calls,
from infrastructure outside both your network and the vendor's, so "we broke it"
and "they broke it" can be told apart by measurement rather than by argument.

## Observation model (state this exactly; do not infer more)

- Probes are issued from ${OBSERVATION_POINTS} observation point today
  (${OBSERVATION_LABEL}). A \`region\` field appears on every observation as a
  scheduler label for the worker that ran the probe. It is not a second opinion.
- Default probe interval: ${PROBE_INTERVAL_SECONDS} seconds.
- Each observation records: executed_at, status_code, latency_ms, is_up,
  error_message, region. Response bodies are never read or stored.
- An incident opens after ${DETECTION.failureChecks} consecutive failed checks
  (rule \`${DETECTION.ruleId}\`) and resolves after ${DETECTION.recoveryChecks}
  consecutive successes (rule \`${DETECTION.recoveryRuleId}\`). One failed probe
  is recorded, not declared.
- No multi-region or quorum confirmation is claimed, because only one
  observation point is deployed. Nothing is backfilled; a missed probe stays
  missing.

## Attribution

Deterministic, versioned arithmetic. Five normalised signals with fixed weights:
temporal overlap 0.20, endpoint overlap 0.25, latency correlation 0.25, error
pattern 0.15, infrastructure baseline 0.15. Score >= 75 classifies
\`vendor_failure\`; >= 50 \`multi_cause\`; below 50 either
\`infrastructure_issue\` or \`unknown\`. A score is an alignment between two
timelines, not proof of causation. Every result carries a methodology version.

## Evidence

A resolved incident compiles to an artifact containing the incident record, the
detection record, the observations in the window, the SLA arithmetic and its
basis, the attribution result, and an appendix of every observation. Integrity:
a SHA-256 over the canonical payload, a SHA-256 over the rendered document, and
an Ed25519 signature over the payload when a signing key is configured.
Retrieval is authenticated: GET ${API}/v1/evidence/{report_id} returns the
record, a presigned URL for the document, the verification id, the public
verification URL, the payload hash, the methodology version and the signing
state; GET ${API}/v1/evidence/{report_id}/artifact streams the document
itself, so a script never has to follow a URL into object storage.
Verification is unauthenticated: GET ${API}/v1/verify/{verification_id}
returns the hashes, the signature and the public key reference. Records are
retained 365 days. A record cannot establish anything inside the vendor's
infrastructure, nor that every one of the vendor's customers was affected.

## Interfaces

- REST API: scoped API keys, cursor pagination, OpenAPI document served by the
  API itself at ${API}/openapi.json. The API origin is ${API} - a self-hosted
  deployment answers at the same paths on its own origin.
- CLI: the \`reliastra\` binary, shipped in the RELIASTRA repository under \`cli/\`
  (installed with \`go install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@latest\`). Commands: login, logout, whoami, doctor, deps
  (list|show|add|rm), checks recent, incidents (list|show|correlate), evidence
  (list|show|get), verify, keys (list|create|rm), obs (list|show) and open.
  Data commands support \`--json\` with the API's own field names, and
  \`reliastra verify\` exits 4 when a verification claim does not hold, so it
  works as a CI gate without a wrapper.
- Webhooks: incident.opened, incident.updated, incident.resolved and
  evidence.ready are delivered to subscribed HTTPS endpoints, off the request
  path, signed with HMAC-SHA256 when the subscription has a secret, and retried
  on a fixed backoff (1m, 5m, 15m, 1h, 3h; then permanently failed). The event
  enum also accepts vendor.degraded, vendor.down, vendor.recovered, sla.breach
  and check.failed, but nothing emits those yet.

## Pricing

One plan. $9 USD per month, billed monthly. No plan ladder, no seats, no annual
billing. 14-day trial on every new account, no payment method required.

## Public observatory

Independently measured status for endpoints RELIASTRA probes as its own public
record. Customer dependencies are never included. Every figure is published with
its window and its observation count, and an availability figure with zero
observations reads "insufficient data" rather than 100%.

What is probed today: vendor-published status-site endpoints - https://status.openai.com
for OpenAI, and equivalents listed on each vendor record - recording HTTP status,
latency and transport errors of that endpoint. RELIASTRA does not read or
reconcile the status text published at those URLs, and does not measure a
vendor's API, models or routes unless an API endpoint is listed as an observed
target on the record itself.

## Dependency records (enumerated, do not guess slugs)

${RECORDS_MARKER}

## Pages

- Home: ${SITE_URL}/
- Product: ${SITE_URL}/product
- Evidence records: ${SITE_URL}/product/evidence
- Public observatory: ${SITE_URL}/observatory
- Pricing: ${SITE_URL}/pricing
- Documentation: ${SITE_URL}/docs
- Quickstart: ${SITE_URL}/docs/quickstart
- Concepts: ${SITE_URL}/docs/concepts
- Configuration: ${SITE_URL}/docs/configuration
- Monitoring: ${SITE_URL}/docs/monitoring
- Incidents: ${SITE_URL}/docs/incidents
- Evidence: ${SITE_URL}/docs/evidence
- Verification: ${SITE_URL}/docs/verification
- REST API: ${SITE_URL}/docs/api
- CLI: ${SITE_URL}/docs/cli
- Webhooks: ${SITE_URL}/docs/webhooks
- Methodology: ${SITE_URL}/docs/methodology
- Security (product): ${SITE_URL}/security
- Security & data-handling guide: ${SITE_URL}/docs/security
- Glossary: ${SITE_URL}/glossary
- Research: ${SITE_URL}/research
- About & maintainer: ${SITE_URL}/about
- Technical creators: ${SITE_URL}/creators
- Contact: ${SITE_URL}/contact
- Status: ${SITE_URL}/status

## Research

${RESEARCH_ARTICLES.map((a) => `- ${a.title}: ${SITE_URL}${researchRoute(a.slug)}`).join('\n')}

## Retired URLs (consolidated in the developer-first refurbishment)

- /track and /track/* -> /observatory and /observatory/* (308)
- /external-dependency-intelligence, /dependency-monitoring -> /product (308)
- /incident-evidence, /sla-evidence -> /product/evidence (308)
`;

/**
 * The published dependency records, enumerated.
 *
 * A model told "there is a public observatory" and handed one URL will guess
 * vendor slugs, and a guessed slug 404s. Enumerated from the same catalog the
 * sitemap uses, so this file and `sitemap.xml` cannot disagree about which
 * records exist.
 *
 * An unreadable catalog is reported as unreadable rather than rendered as an
 * empty list: "no records are published" is a false claim about the product,
 * and it is the kind of false claim a model will repeat verbatim.
 */
async function recordsSection(): Promise<string> {
  const index = `${SITE_URL}${PUBLIC_ROUTES.observatory}`;
  try {
    const catalog = await readCatalogForDiscovery({ pageSize: 100, maxPages: 20 });
    const vendors = catalog.vendors.filter((v) => v.is_public !== false && v.vendor_name);
    if (!vendors.length) {
      return `No dependency records are published yet. ${index} is authoritative and will list them when they are.`;
    }
    const readAt = catalog.readAt?.toISOString() ?? 'an unrecorded time';
    const provenance = catalog.stale
      ? `Enumerated from the last successful catalog read at ${readAt}; the catalog was unreadable when this file was generated, so a record published since then may be missing from this list.`
      : `Enumerated from the public catalog at ${readAt}. ${vendors.length} record${vendors.length === 1 ? '' : 's'}.`;
    return [
      provenance,
      '',
      ...vendors.map(
        (v) =>
          `- ${v.display_name} (${v.category.replace(/[-_]/g, ' ')}): ${SITE_URL}${SHARE_ROUTES.observatoryVendor(v.vendor_name)}`
      ),
    ].join('\n');
  } catch {
    return `The record list could not be read when this file was generated. ${index} is authoritative and lists every published record.`;
  }
}

/**
 * Caching for this file lives on the response, not on a route-level
 * `revalidate`: the handler renders per request (see `renderAtRequestTime()`
 * below) and declares an hour in the browser and a day at the edge, which is
 * what actually serves it. The interval this file used to declare was inert
 * once the route became dynamic, and an inert export reads like a guarantee.
 *
 * An hour is right for a discovery document. It is not a telemetry feed: a
 * model needs the record list to be correct, not current to the minute, and the
 * records it links to revalidate every 60s on their own.
 */

export async function GET() {
  // Rendered per request, never baked at build time: the build has no
  // measurement API to read, so a prerender here would either fail the build or
  // cache a failure state and serve it as fact. `lib/render-at-request-time.ts`
  // carries the reasoning, including why this is not `force-dynamic`.
  await renderAtRequestTime();
  const body = BODY.replace(RECORDS_MARKER, await recordsSection());
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
