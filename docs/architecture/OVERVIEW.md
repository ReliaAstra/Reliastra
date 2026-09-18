# Reliastra architecture

Reliastra is two independently deployable applications and an API client CLI in
one canonical repository.

```text
User
  ↓
Next.js frontend   (frontend/)
  ↓  HTTPS / existing API contract
Reliastra API      (backend/ FastAPI)
  ↓
Supabase Postgres · Redis · Celery · Supabase Storage (S3)
  ↓
External vendor APIs, OAuth, Paystack, SMTP
```

## Applications

| Path | Stack | Role |
|------|--------|------|
| `frontend/` | Next.js 16, React 19, Tailwind, Prisma (SQLite) | Product site, observatory, console, Next.js API routes |
| `backend/` | FastAPI, SQLAlchemy, Celery, Redis, Supabase Postgres + S3 | Product API: monitoring, incidents, evidence, billing, orgs |
| `cli/` | Node.js, no runtime dependencies | API client for dependencies, observations, incidents, evidence, and verification |

They communicate over the existing HTTP API. They do not share a runtime, database, or package manager.

## Frontend → backend

The Next.js app proxies `/api/v1/*` through its server-side route to the FastAPI
`/v1/*` API. Authentication and admin routes have separate proxy handlers.
Set `RELIASTRA_API_URL` explicitly for local or staging development.

The API uses JWT sessions and scoped API keys, with separate public vendor and
verification routes. See the [API integration guide](../../backend/docs/FRONTEND_API_INTEGRATION_GUIDE.md)
and [API changelog](../../backend/docs/API_CHANGELOG.md) for contracts.

## Backend internals

- Multi-tenant organizations and RBAC
- Dependency checks in Celery workers, dispatched exclusively by Celery Beat via Redis
- Single-origin observation topology by default; region labels do not prove independent origins
- Incident detection and deterministic, versioned attribution signals, not a validated causal model
- Evidence JSON/PDF artifacts with canonical data hashes, document checksums, and optional Ed25519 signing
- Notifications (email, Slack, PagerDuty, webhooks)
- Billing via Paystack
- Persistence via Supabase Postgres (not a local or in-container PostgreSQL)
- Object storage via Supabase Storage S3 (not a local MinIO service)

## Engineering source map

Paths below are under `backend/app/` unless noted.

| Concern | Existing implementation | Review boundary |
| --- | --- | --- |
| Configuration and API | `modules/dependencies/`, `dependencies.py`, `core/permissions.py` | Organization scoping, API-key scopes, RBAC, input validation |
| Probe execution | `modules/checks/`, `core/ssrf_protection.py`, `infrastructure/celery_app.py` | DNS pinning, redirect safety, queue routing, worker failure versus target failure |
| Observations | `modules/observations/` | Partitioned observation records; transactional customer-check outbox; separate public vendor sources |
| Public vendors | `modules/vendors/`, `modules/checks/http_probe.py` | Seeded vendor/endpoint models and shared HTTP probing; no general vendor adapter contract yet |
| Incidents and attribution | `modules/incidents/`, `modules/attribution/` | Temporal/manual correlation, five weighted signal scores, methodology version and supporting/contradicting entries |
| Evidence | `modules/evidence/`, `modules/verification/` | Snapshot/hash/signature contracts, provenance, retention and tenant-safe public verification |
| Operational metrics | `core/metrics.py`, `modules/checks/scheduler_health.py` | Existing `/metrics` and `/health/checks`; process-local versus shared-directory collection |
| CLI and UI | `cli/src/`, `frontend/src/components/console/`, `frontend/src/lib/dashboard/` (repository-root paths) | Existing API clients and inspectable incident/evidence workflows |

For deployment truth, read the [checks operating model](../checks-operating-model.md)
and [incident/evidence lifecycle](../operations/incident-evidence-lifecycle.md).
In particular, the multi-topology detector is not proof that a regional fleet is
deployed. A signature establishes payload authorship under a key, not correctness
of the underlying measurement or attribution.

The [roadmap](../ROADMAP.md) tracks extensions to this implementation. Architectural
criticism and reproducible counterexamples are part of the
[contribution process](../../.github/CONTRIBUTING.md).

## Deployment

Frontend and backend deploy independently.

- Frontend: existing Next.js hosting (standalone output in `next.config.ts`)
- Backend: existing Docker / Nixpacks / GHCR + VPS CD under `backend/`

Do not deploy both as a single unit unless you deliberately choose to.
