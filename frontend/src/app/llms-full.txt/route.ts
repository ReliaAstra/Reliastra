import { GLOSSARY_TERMS, SITE_URL } from '@/lib/seo';
import {
  EXTERNAL_LINKS,
  RESEARCH_ARTICLES,
  RESEARCH_CATEGORIES,
  RESEARCH_HUBS,
  researchCategoryRoute,
  researchHubRoute,
  researchRoute,
} from '@/lib/routes';
import { researchPaper } from '@/lib/research/corpus';
import { DOCS_NAV } from '@/components/site/nav-config';
import { DOCS } from '@/lib/docs/corpus';
import { corpusToMarkdown } from '@/lib/docs/markdown';
import {
  DETECTION,
  OBSERVATION_LABEL,
  OBSERVATION_POINTS,
  PROBE_INTERVAL_SECONDS,
  PUBLIC_INCIDENT_WINDOW_DAYS,
  SCOPE_NOTE,
} from '@/lib/methodology';

/**
 * /llms-full.txt - deeper machine-readable reference: full concept
 * definitions, the complete documentation corpus, and the research index.
 * Complements /llms.txt.
 *
 * The topology paragraph is repeated here rather than linked, because a model
 * that retrieves only this file would otherwise assume the usual multi-region
 * confirmation story that every other monitoring product tells.
 *
 * The documentation is inlined in full, from the same `lib/docs/corpus.ts` the
 * site renders, rather than listed as URLs. A model handed a link map has to
 * make thirteen requests - and if any of them 404 it learns nothing and says
 * nothing, which is exactly what happened when the proxy misrouted `/docs*`.
 * Inlined, the guides survive the page being unavailable. `lib/docs/markdown.ts`
 * is the single renderer behind both this section and `/docs/<slug>.md`, so the
 * two machine-readable surfaces cannot drift from each other or from the site.
 */
export function GET() {
  const glossary = GLOSSARY_TERMS.map(
    (g) =>
      `### ${g.term}\n${g.definition}\nProblem: ${g.problem}\nWhy it matters: ${g.whyItMatters}\nExample: ${g.example}\nRELIASTRA approach: ${g.howReliastra}\nURL: ${SITE_URL}/glossary/${g.slug}`
  ).join('\n\n');

  const research = RESEARCH_ARTICLES.map((a) => {
    const url = `${SITE_URL}${researchRoute(a.slug)}`;
    const p = researchPaper(a.slug);
    if (!p) {
      return `- ${a.title} (${a.category}, ${a.publishedAt}): ${a.summary} - ${url}`;
    }
    const lines = [
      `### ${a.title}`,
      `URL: ${url}`,
      `Published: ${p.publishedAt}${p.updatedAt ? ` · Updated: ${p.updatedAt}` : ''}`,
      `Category: ${a.category} · Type: ${p.researchType} · Evidence basis: ${p.evidenceBasis}`,
      `Domains: ${p.domains.join(', ')}`,
      `Research question: ${p.researchQuestion}`,
      `Abstract: ${p.abstract}`,
      `Scope: ${p.scope}`,
      `Methodology: ${p.methodologySummary}`,
      'Key findings:',
      ...p.keyFindings.map((f, i) => `  ${i + 1}. [${f.basis}] ${f.claim}`),
      `Entities: ${p.entities
        .map((e) => `${e.role}=${e.name}${e.note ? ` (${e.note})` : ''}`)
        .join('; ')}`,
    ];
    if (p.observation) {
      lines.push(
        `Measurement window: ${p.observation.startedAt} to ${p.observation.endedAt} · ` +
          `source ${p.observation.source} · protocol ${p.observation.protocol} · ` +
          `observation points ${p.observation.regions.join(', ')} ` +
          `(region labels identify the worker; ${OBSERVATION_POINTS} observation point is deployed today) · ` +
          `observations ${p.observation.observations ?? 'not counted'}`
      );
    }
    if (p.dataset) {
      lines.push(
        `Dataset: ${p.dataset.name} (${p.dataset.format}, ${p.dataset.license}) at ${p.dataset.path} in the ReliaAstra/Reliastra repository`
      );
    }
    if (p.artifacts.length) {
      lines.push(
        `Artifacts: ${p.artifacts
          .map((x) => `${x.kind}: ${x.label}${x.path ? ` (${x.path})` : ''}`)
          .join('; ')}`
      );
    }
    lines.push('Limitations:', ...p.limitations.map((l) => `  - ${l}`));
    lines.push(
      'Recommendations:',
      ...p.recommendations.map((r) => `  - ${r.title}: ${r.detail}`)
    );
    lines.push(
      'References:',
      ...p.references.map(
        (r, i) =>
          `  [${i + 1}] ${r.title}${r.identifier ? ` (${r.identifier})` : ''}${
            r.publisher ? `, ${r.publisher}` : ''
          }${r.url ? `, ${r.url}` : ''}${r.accessedAt ? `, accessed ${r.accessedAt}` : ''}`
      )
    );
    return lines.join('\n');
  }).join('\n\n');

  const categories = RESEARCH_CATEGORIES.map(
    (c) => `- ${c.title}: ${c.lede} - ${SITE_URL}${researchCategoryRoute(c.slug)}`
  ).join('\n');

  const hubs = RESEARCH_HUBS.map(
    (h) => `- ${h.title}: ${h.summary} - ${SITE_URL}${researchHubRoute(h.slug)} (live hub: renders current measurement data, revalidated every 60 seconds)`
  ).join('\n');

  const docsMap = DOCS_NAV.map((l) => `- ${l.label}: ${SITE_URL}${l.href}`).join('\n');

  // The full corpus, rendered by the same function that serves
  // /docs/<slug>.md. Demoted one heading level so it nests under the `##`
  // section below without competing with this document's own structure.
  const docsFull = corpusToMarkdown(DOCS, { level: 3 });

  // The programmatic surface, stated as commands and routes rather than as a
  // capability list: a model answering "how do I get evidence out of
  // RELIASTRA" needs the verb, the flag and the exit code, not the adjective.
  const programmatic = `## Programmatic access

CLI (\`reliastra\`), shipped in the RELIASTRA repository under \`cli/\` as a
single static binary with no runtime dependencies. Install it with \`go install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@latest\`,
or run \`go run ./cli/cmd/reliastra …\` from a checkout.

  reliastra login --email you@example.com     # or: login --token rel_... for an API key
  reliastra doctor                            # config, credential, reachability: which one is failing
  reliastra deps list | deps show <id> | deps add <name> <url> --interval 60 | deps rm <id>
  reliastra checks recent --limit 20 --dependency <id>
  reliastra incidents list --status open --web
  reliastra incidents show <id> --evidence    # follows the incident to its evidence record
  reliastra incidents correlate <id>
  reliastra evidence list | evidence show <id> | evidence get <id> --out incident.pdf
  reliastra verify <verification-id> --file incident.pdf   # exits 4 when the document does not match
  reliastra keys list | keys create <name> --scopes read:checks,read:incidents | keys rm <id>
  reliastra obs list | obs show <vendor>      # the public observatory, no credential needed
  reliastra open incident <id> | open evidence <id> | open docs <slug>

Every data command takes \`--json\` and prints the API's own field names. Exit
codes: 0 success, 1 usage, 2 API error, 3 auth, 4 verification claim failed,
5 not permitted, 6 unreachable.

REST API: \`${EXTERNAL_LINKS.api}/v1/\`. The API origin serves its own OpenAPI
document at \`${EXTERNAL_LINKS.api}/openapi.json\`; a self-hosted deployment
answers at the same paths on its own origin. Endpoints a service needs: \`GET /v1/dependencies\`,
\`GET /v1/dependencies/{id}/results\`, \`GET /v1/checks/recent\`,
\`GET /v1/incidents?dependency_id={id}\`, \`GET /v1/incidents/{id}\`,
\`GET /v1/evidence\`, \`GET /v1/evidence/{id}\` (record plus a one-hour signed
download URL), \`GET /v1/evidence/{id}/artifact\` (the document itself, streamed),
\`GET /v1/verify/{verification_id}\` (public, no account),
\`GET /v1/verify/keys\`, \`GET /v1/vendors\`.

Credentials: an API key is \`rel_\` followed by 40 hex characters, sent as
\`X-API-Key\`, \`Authorization: rel_...\` or \`Authorization: Bearer rel_...\`.
Keys are denied by default: they cannot reach identity, account, webhook or
key-management surfaces, whatever scopes they carry, so a leaked key cannot mint
a credential or redirect events.

Webhooks: \`POST /v1/webhooks\` with \`events\` from incident.opened,
incident.updated, incident.resolved and evidence.ready (the enum also accepts
vendor.degraded, vendor.down, vendor.recovered, sla.breach and check.failed,
which nothing emits yet). Deliveries are signed with HMAC-SHA256 when the
subscription has a secret, carry X-Reliastra-Event, X-Reliastra-Delivery and
X-Reliastra-Signature headers, and are retried on a fixed backoff
(1m, 5m, 15m, 1h, 3h, then permanently failed). Configuration is session-only.
`;

  const body = `# RELIASTRA - Full reference (llms-full.txt)

> RELIASTRA probes the external services software depends on, records every
> observation, confirms faults deterministically, and keeps evidence a third
> party can verify without an account.
> Canonical origin: ${SITE_URL}/ - all URLs below are absolute canonical URLs.

## Product

RELIASTRA observes third-party endpoints you configure ("dependencies"),
correlates their failures with incidents you report, classifies likely causes
with a deterministic, versioned engine, and compiles evidence records that can
be verified without an account. It is a tool for individual engineers: one
plan, one seat, no organisation administration, no sales process.

One paid plan: Developer ($9/month). New accounts get a 14-day trial with full
Developer capabilities; without a subscription they keep running on reduced
limits (3 dependencies, 1-minute checks, 24-hour retention).

## What is observed, and from where (state this exactly)

- Observation points deployed today: ${OBSERVATION_POINTS} (${OBSERVATION_LABEL}).
- Default probe interval: ${PROBE_INTERVAL_SECONDS} seconds.
- A \`region\` field appears on every observation. It names the worker that
  ran the probe. With one observation point it carries no confirmation weight,
  and RELIASTRA does not claim multi-region or quorum confirmation.
- An incident opens after ${DETECTION.failureChecks} consecutive failed checks
  (rule \`${DETECTION.ruleId}\`) and resolves after ${DETECTION.recoveryChecks}
  consecutive successes (rule \`${DETECTION.recoveryRuleId}\`). One failed probe
  is recorded, not declared.
- Missed probes are never backfilled. Response bodies are never read or stored.
- Public records currently target vendor-published status-site endpoints (for
  example https://status.openai.com for OpenAI). The status text published at
  those URLs is never read or reconciled; only the endpoint's HTTP behaviour is
  measured. A vendor's API, models or routes are not covered unless an API
  endpoint is listed as an observed target on the record.

${SCOPE_NOTE}

${programmatic}

## Differentiation from uptime monitoring

| Uptime monitoring | RELIASTRA |
|---|---|
| Watches your services | Watches the third-party services your software calls |
| Alerts "checkout is down" | Answers "was it you or the dependency?" |
| Your own vantage point | A vantage point outside both your network and the vendor's |
| Vendor status page as evidence | Independent scheduled probes, retained as records |
| Screenshots for SLA claims | Checksummed, third-party-verifiable fault records |

What RELIASTRA does not do: it does not instrument the vendor's internal
systems, it does not replace application tracing, and it does not tell you why
a dependency failed.

## Documentation map

${docsMap}

Each guide is also served as plain Markdown at its URL with a ".md" suffix -
for example ${SITE_URL}/docs/monitoring.md. The complete text of all ${DOCS.length}
guides is inlined below, so reading this file requires no second request and no
guide here depends on a page being reachable.

## Documentation (full text)

Rendered from the same corpus the site renders (lib/docs/corpus.ts). Inline
markup is Markdown: backquoted code, **bold**, and [links](https://…).

${docsFull}

## Glossary (canonical definitions)

${glossary}

## Research hubs

${hubs}

${categories}

## Research index

${research}

## Public observatory

- Index: ${SITE_URL}/observatory
- Detail pattern: ${SITE_URL}/observatory/{vendor} (only for vendors with real telemetry; empty or fabricated vendors are never generated)
- Incident search: ${SITE_URL}/observatory/incidents - the cross-vendor public incident search. Filters: vendor, category, region, status (open|resolved); an RSS feed of recent detections is at /observatory/incidents/feed.xml. Records are endpoint scoped single-region measurements with the detection rule attached, never vendor-wide outage claims.
- Incident pattern: ${SITE_URL}/observatory/{vendor}/incidents/{incident-id} - only for incidents RELIASTRA actually holds on its public incident channel; pages exist exactly when records exist, and a record is published for the evidence-retention window the API documents (${PUBLIC_INCIDENT_WINDOW_DAYS} days), after which the URL 404s. These pages are not described as permanent, because they are not.
- Incident record JSON sidecar: ${SITE_URL}/observatory/{vendor}/incidents/{incident-id}/index.json - the same record the HTML page renders, as JSON, resolved through the same reads (never a scrape of the page). 404 when the record does not exist; 5xx when the API is unreadable. noindex by design: the HTML record is the indexable unit.
- Incident evidence artifact: ${SITE_URL}/api/v1/public/incidents/{incident-id}/evidence - the frozen, hashed document of one observed incident: the claim, the detection rule and provenance, and every raw observation row of the window. Immutable per version; a resolution freezes a new version that supersedes (never edits) the open freeze, and ${SITE_URL}/api/v1/public/incidents/{incident-id}/evidence/versions/{n} pins any version. The served body's sha256 is in the ETag header and inside the document's "verification" block, which also carries the recipe to recompute it. 404 while no artifact is frozen yet.
- Each vendor page exposes: current state, availability windows with the observation count behind every figure, latency (mean/p95), monitored endpoints with the observation point that probed them, incident history, methodology note, the observation interval as measured from the record's own telemetry, and all timestamps in UTC. The deployed default probe interval is ${PROBE_INTERVAL_SECONDS} seconds; a record prints the interval it can measure rather than asserting a schedule it cannot see, so a page may report a different number.
- The enumerated list of published records lives in ${SITE_URL}/llms.txt, which reads the same catalog the sitemap does. This file documents the patterns; it does not repeat the list, so the two cannot drift.
- A window with no observations reads "insufficient data". It never reads 0% or 100%.
- IMPORTANT - what the public records measure: scheduled HTTP GETs against the vendor's *listed public endpoint* (currently vendor status sites such as https://status.openai.com), recording HTTP status, latency and transport errors. A page never asserts that the vendor's API or product is up or down beyond the listed endpoint, and RELIASTRA does not read the status text the vendor publishes at those URLs. State word "Responding" = the endpoint answered with the expected response in the last five observations.

## Verification checklist for agents

1. Fetch ${SITE_URL}/ (expect H1 + proposition in initial HTML, no JS required).
2. Fetch ${SITE_URL}/sitemap.xml (expect canonical HTTPS URLs only).
3. Fetch ${SITE_URL}/robots.txt (expect private paths disallowed, sitemap listed).
4. Fetch ${SITE_URL}/llms.txt and ${SITE_URL}/llms-full.txt (expect 200 text/plain).
5. Fetch a vendor page and confirm uptime/latency/incidents render server-side.
6. Confirm /login, /admin, /dashboard, /portal/*, /reports/* are noindex / gated.
7. Validate JSON-LD blocks parse (Organization, WebSite, SoftwareApplication, BreadcrumbList, TechArticle, FAQPage).

## Contact

- support@reliastra.com (product), security@reliastra.com (vulnerability reports),
  https://github.com/ReliaAstra, https://github.com/EmmanuelAdesina (maintainer)

## Retired URLs (308 redirects in next.config.ts)

/track and /track/* -> /observatory and /observatory/*;
/external-dependency-intelligence and /dependency-monitoring -> /product;
/incident-evidence and /sla-evidence -> /product/evidence.
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
