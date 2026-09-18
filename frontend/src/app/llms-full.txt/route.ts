import { GLOSSARY_TERMS, SITE_URL } from '@/lib/seo';
import {
  RESEARCH_ARTICLES,
  RESEARCH_CATEGORIES,
  RESEARCH_HUBS,
  researchCategoryRoute,
  researchHubRoute,
  researchRoute,
} from '@/lib/routes';
import { researchPaper } from '@/lib/research/corpus';
import { DOCS_NAV } from '@/components/site/nav-config';
import {
  DETECTION,
  OBSERVATION_LABEL,
  OBSERVATION_POINTS,
  PROBE_INTERVAL_SECONDS,
  SCOPE_NOTE,
} from '@/lib/methodology';

/**
 * /llms-full.txt - deeper machine-readable reference: full concept
 * definitions, docs map, and research index. Complements /llms.txt.
 *
 * The topology paragraph is repeated here rather than linked, because a model
 * that retrieves only this file would otherwise assume the usual multi-region
 * confirmation story that every other monitoring product tells.
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
- Incident pattern: ${SITE_URL}/observatory/{vendor}/incidents/{incident-id} - only for incidents RELIASTRA actually holds on its public incident channel; pages exist exactly when records exist
- Each vendor page exposes: current state, availability windows with the observation count behind every figure, latency (mean/p95), monitored endpoints with the observation point that probed them, incident history, methodology note, refresh cadence (60s), all timestamps UTC.
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
