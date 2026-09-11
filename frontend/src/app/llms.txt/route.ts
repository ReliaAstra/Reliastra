import { SITE_URL } from '@/lib/seo';

/**
 * /llms.txt - concise machine-readable description of RELIASTRA.
 * Absolute HTTPS URLs. No marketing hype, no fabricated stats.
 */
const BODY = `# RELIASTRA

> Know when your dependencies fail. Prove what happened.
> External Dependency Intelligence: independent monitoring of third-party APIs,
> incident attribution, and timestamped SLA evidence.

## What RELIASTRA is

RELIASTRA is an infrastructure trust platform. It monitors the third-party
APIs and services your product depends on from RELIASTRA infrastructure, correlates
their failures with your own incidents, attributes the likely origin with a
deterministic engine, and generates cryptographically verifiable SLA evidence
reports (checksummed, bound to your organization).

RELIASTRA is NOT generic uptime monitoring. Uptime monitoring watches YOUR
infrastructure. RELIASTRA watches YOUR VENDORS - from outside both your stack
and the vendor's - so you can tell "we broke it" apart from "they broke it".

## Who it serves

- SaaS teams that depend on payment, auth, messaging, AI, or cloud APIs
- Agencies operating customer infrastructure and needing client-facing SLA proof
- Reliability / platform engineers who own incident response and postmortems
- Anyone who has ever argued with a vendor about whose system failed

## Key capabilities

- Third-party dependency monitoring (any HTTP endpoint, fixed-interval checks)
- Deterministically confirmed incidents (no single-failed-request alerts)
- Incident attribution with confidence levels (correlation, not claimed causation)
- SLA evidence reports (timestamped, checksummed, verifiable without disclosing secrets)
- Public vendor tracking for vendors made public (${SITE_URL}/track)
- Client isolation and white-label reporting (Enterprise)

## Core terminology

- External Dependency Intelligence: independently observed knowledge about third-party services.
- Dependency monitoring: continuous probing of external endpoints.
- Incident attribution: assigning a failure to your stack or a specific vendor via correlated timelines.
- SLA evidence: timestamped records for service-credit conversations.
- Dependency telemetry: retained per-probe observations (timestamp, region, latency, status, outcome).
- External Dependency Fault Report: compiled artifact for one failure window.

## Important public pages

- Home: ${SITE_URL}/
- Product: ${SITE_URL}/product
- For agencies and MSPs: ${SITE_URL}/agencies
- External Dependency Intelligence: ${SITE_URL}/external-dependency-intelligence
- Dependency monitoring: ${SITE_URL}/dependency-monitoring
- SLA evidence: ${SITE_URL}/sla-evidence
- Incident evidence: ${SITE_URL}/incident-evidence
- Live vendor status: ${SITE_URL}/track
- AI infrastructure hub (live status + research): ${SITE_URL}/research/ai-infrastructure
- Pricing: ${SITE_URL}/pricing
- Security: ${SITE_URL}/security
- Documentation: ${SITE_URL}/docs
- Quickstart: ${SITE_URL}/docs/quickstart
- Monitoring docs: ${SITE_URL}/docs/monitoring
- Evidence docs: ${SITE_URL}/docs/evidence
- API docs: ${SITE_URL}/docs/api
- Glossary: ${SITE_URL}/glossary
- Research: ${SITE_URL}/research
- Measurement methodology: ${SITE_URL}/research/how-reliastra-measures-vendor-reliability
- “Is OpenAI down?” (what an honest answer looks like): ${SITE_URL}/research/ai-infrastructure/is-openai-down
- AI API outage evidence playbook: ${SITE_URL}/research/ai-infrastructure/ai-api-outage-evidence
- The Dependency Gap: ${SITE_URL}/research/the-dependency-gap
- Research agenda: ${SITE_URL}/research/reliastra-research-agenda
- About: ${SITE_URL}/about
- Contact: ${SITE_URL}/contact
- Status: ${SITE_URL}/status
- Partner Network: ${SITE_URL}/partner
- How partner referrals work: ${SITE_URL}/partner/how-it-works
- Partner commissions: ${SITE_URL}/partner/commission
- Privacy: ${SITE_URL}/privacy
- Terms: ${SITE_URL}/terms

## Methodology (summary)

One scheduler dispatches one check task per dependency per region through a
message broker to workers. Every result carries its region. A single failed
request is never an incident - a fixed number of consecutive failed checks is
required, and recovery needs consecutive successes. Targets are resolved and
validated against an SSRF policy (private/loopback/link-local/metadata
addresses rejected and recorded as policy blocks, never as vendor outages).
Missed probes are never backfilled. Retention follows the plan (24h Free,
90 days Pro).

## What the public observatory actually probes (scope, stated plainly)

- Today's public catalog probes vendor-published status-site endpoints
  (e.g. https://status.openai.com for OpenAI): HTTP availability and latency of
  that endpoint, measured from a single RELIASTRA origin per vendor.
- It does NOT read the status text published on those pages, does NOT measure
  vendor APIs (unless and until an API endpoint is listed as an observed
  target), and makes no statement about specific models or routes.
- Public incident pages exist only for incidents on RELIASTRA's published
  incident channel; an empty incident list is not evidence that no outage
  occurred.

## Data limitations (stated plainly)

- Fixed small set of origins: cannot separate vendor-wide from unobserved geographies.
- Server-to-server responses only; not end-user experience.
- Authenticated checks use customer-supplied credentials; a rotation can present as a target failure.
- Public Track pages show aggregated posture only for vendors made public - never customer endpoints.

## Contact

- Support: support@reliastra.com
- Sales (Enterprise): sales@reliastra.com
- GitHub: https://github.com/ReliaAstra
`;

export function GET() {
  return new Response(BODY, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
