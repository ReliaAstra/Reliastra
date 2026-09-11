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

/**
 * /llms-full.txt - deeper machine-readable reference: full concept
 * definitions, docs map, and research index. Complements /llms.txt.
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
          `regions ${p.observation.regions.join(', ')} · ` +
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

  const body = `# RELIASTRA - Full reference (llms-full.txt)

> External Dependency Intelligence. Know when your dependencies fail. Prove what happened.
> Canonical origin: ${SITE_URL}/ - all URLs below are absolute canonical URLs.

## Product

RELIASTRA monitors third-party endpoints you configure ("dependencies"),
correlates their failures with your reported incidents, attributes likely
causes with a deterministic engine, and generates verifiable evidence reports.
Plans: Free (3 dependencies, 1-minute checks, 24h retention), Pro ($39/mo,
50 dependencies, 15-second checks, 90-day retention, evidence + attribution +
API + client groups + client-facing reports), Enterprise (custom scale,
white-label).
For agencies and MSPs operating client infrastructure: ${SITE_URL}/agencies.

## Differentiation from uptime monitoring

| Uptime monitoring | RELIASTRA |
|---|---|
| Watches your services | Watches your vendors' APIs |
| Alerts "checkout is down" | Answers "was it you or Stripe?" |
| Vendor status page as evidence | Independent scheduled probes as evidence |
| Single-perspective timeline | Your incidents + vendor observations on one timeline |
| Screenshots for SLA claims | Checksummed, verifiable fault reports for SLA claims |

## Documentation map

- Docs home: ${SITE_URL}/docs
- Quickstart: ${SITE_URL}/docs/quickstart
- Monitoring: ${SITE_URL}/docs/monitoring
- Evidence: ${SITE_URL}/docs/evidence
- API: ${SITE_URL}/docs/api

## Glossary (canonical definitions)

${glossary}

## Research hubs

${hubs}

${categories}

## Research index

${research}

## Vendor tracking

- Index: ${SITE_URL}/track
- Detail pattern: ${SITE_URL}/track/{vendor} (only for vendors with real telemetry; empty/fabricated vendors are never generated)
- Incident pattern: ${SITE_URL}/track/{vendor}/incidents/{incident-id} - only for incidents RELIASTRA actually holds on its public incident channel; pages exist exactly when records exist
- Each vendor page exposes: current state, 1h/6h/24h/7d/30d/90d availability windows with observation counts, latency (mean/p95), monitored endpoints with regions, incident history, methodology note, refresh cadence (60s), all timestamps UTC.
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

- support@reliastra.com, sales@reliastra.com, https://github.com/ReliaAstra
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
