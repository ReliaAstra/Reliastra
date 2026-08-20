# Reliastra architecture

Reliastra is two independently deployable applications in one repository.

```
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
| `frontend/` | Next.js 16, React 19, Tailwind, Prisma (SQLite) | Marketing site, partner network UI, Next.js API routes |
| `backend/` | FastAPI, SQLAlchemy, Celery, Redis, Supabase Postgres + S3 | Product API: monitoring, incidents, evidence, billing, orgs |

They communicate over the existing HTTP API. They do not share a runtime, database, or package manager.

## Frontend → backend

The Next.js app proxies selected Partner Network calls to the deployed Reliastra API:

`https://api.reliastra.com` (paths under `/v1/*`)

Override with `RELIASTRA_API_URL` when proxying to a local or staging API.

The FastAPI surface remains `/v1/*` (JWT, API keys, public vendor/verify routes). See `backend/docs/FRONTEND_API_INTEGRATION_GUIDE.md`.

## Backend internals

- Multi-tenant organizations and RBAC
- Dependency checks from multiple regions, Celery (or in-process scheduler) + Redis
- Incident detection, deterministic attribution, cryptographic SLA evidence PDFs
- Notifications (email, Slack, PagerDuty, webhooks)
- Billing via Paystack
- Persistence via Supabase Postgres (not a local or in-container PostgreSQL)
- Object storage via Supabase Storage S3 (not a local MinIO service)

## Deployment

Frontend and backend deploy independently.

- Frontend: existing Next.js hosting (standalone output in `next.config.ts`)
- Backend: existing Docker / Nixpacks / GHCR + VPS CD under `backend/`

Do not deploy both as a single unit unless you deliberately choose to.
