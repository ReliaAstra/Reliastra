# RELIASTRA

**Independent verification for external API dependencies.**

Your API failed. Was the dependency actually down?

Your monitoring proves *your* application failed. It cannot tell you whether the fault was
internal or a third party's. Reliastra is the independent observation record between those two
sources: it observes the same dependency separately, confirms the failure deterministically,
and produces evidence you can hand to someone who asks *how do you know?*

```
  RELIASTRA  ·  external dependency verification
  ──────────────────────────────────────────────────────────────────────────────

  Observation       ✖ DOWN
                    The last probe reached the target and it failed.

Dependency          Stripe Payments API
Endpoint            https://api.stripe.com/v1/health
HTTP status         503
Latency             4.18 s
Observed            2026-10-01 17:42:18 UTC
Observation point   ● us-east  1 point, not a consensus
Methodology         v1.0

  ───────────────────────────────────────
Incident            CONFIRMED 4c1f9e2a
Attribution         vendor_failure (0.82)
Evidence            https://reliastra.com/observatory/stripe

  • Reliastra does not claim that provider causality is proven. Confirmation is
  • deterministic; attribution is a weighted score, not proof of cause.
```

<sub>Reliastra runs **one** observation point. A region label is not corroboration, and no
surface in this project will present it as one.</sub>

## In your terminal

```bash
npm install -g reliastra        # or: pipx install reliastra

reliastra login
reliastra deps add "Payments API" https://api.stripe.com/v1/health --interval 60
reliastra checks recent --limit 20
reliastra incidents list --status open
```

Exit codes are explicit and stable, so this drops into a script without a wrapper:
`0` ok · `1` usage · `2` api · `3` auth · `4` unverified · `5` denied · `6` network.

One Go CLI, four channels: npm and PyPI install the same compiled binary the Go route builds.
From source: `go install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@latest`. See
[cli/README.md](cli/README.md#install) for channel status, platform support, upgrading,
troubleshooting, binary verification, `doctor`, auth and `verify`.

## In your CI

```yaml
- uses: ReliaAstra/reliastra-action@v1
  with:
    dependency: <your-dependency-uuid>
    token: ${{ secrets.RELIASTRA_TOKEN }}
    fail-on: degraded
```

The same exit codes, the same verdicts, rendered into your job summary with the evidence link.
Full reference in [`ReliaAstra/reliastra-action`](https://github.com/ReliaAstra/reliastra-action).

## Start here

**[Try Reliastra](https://reliastra.com)** · **[Quickstart](https://reliastra.com/docs/quickstart)** ·
**[API](https://reliastra.com/docs/api)** · **[CLI](https://reliastra.com/docs/cli)** ·
**[Methodology](https://reliastra.com/docs/methodology)** · **[Observatory](https://reliastra.com/observatory)** ·
**[Pricing](https://reliastra.com/pricing)**

One plan, **$9/month**, monthly billing. 14-day trial of full capabilities, no payment method
required.

---
---

## Engineering & Contributing

This is the canonical Reliastra monorepo: the Next.js frontend and the FastAPI backend live
side by side as independent applications. Everything below this line is for contributors.

Technical review and focused implementation contributions are welcome. Challenge the
attribution assumptions, try the [CLI](cli/README.md) or development setup below, and report
concrete failures with sanitized, reproducible evidence.

- [Issues](https://github.com/ReliaAstra/Reliastra/issues) — reproducible problems and scoped implementation work.
- [Contributor guide](.github/CONTRIBUTING.md), [architecture](docs/architecture/OVERVIEW.md), and [engineering roadmap](docs/ROADMAP.md).

The direction underneath the product is larger: a dependency intelligence network built from
independent observations across real software systems. It is being earned through real usage,
not claimed in advance — the public observatory states exactly what it measures and how many
vantage points exist.

## Repository structure

```text
Reliastra/
├── frontend/     # Next.js app (marketing site, observatory, console UI)
├── backend/      # FastAPI app (API, workers, evidence, billing)
├── cli/          # Go CLI for dependencies, incidents, evidence, verification
├── docs/         # architecture, operations, research notes
├── research/     # reproducible research artifacts and datasets
├── .github/      # contributor guidance, issue forms, workflows
├── Makefile
└── README.md
```

Source applications were consolidated from:

- [Frontend](https://github.com/ReliaAstra/Frontend)
- [Backend](https://github.com/ReliaAstra/Reliastra-backend)

Those repositories are kept as references. Application code was not rewritten for this move.

## Architecture

```text
User
  ↓
Next.js frontend          frontend/
  ↓  existing HTTP API contract
Reliastra API             backend/  (FastAPI, /v1/*)
  ↓
Supabase Postgres · Redis · Celery · Supabase Storage (S3)
  ↓
Vendor APIs, Google/GitHub OAuth, Paystack, SMTP
```

> **Check execution requires Postgres, Redis, a Celery worker and Celery Beat.**
> Checks never run inside the API process, and there is no in-process scheduler
> or fallback. See [`docs/checks-operating-model.md`](docs/checks-operating-model.md)
> for the runtime contract, the health endpoint and how to verify a deployment.

Details: [`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md).

API contract changes - including the billing/checkout endpoints and their status-code
semantics - are recorded in
[`backend/docs/API_CHANGELOG.md`](backend/docs/API_CHANGELOG.md).

The frontend uses server-side `/api/v1/*` routes to proxy the backend `/v1/*`
API. Set `RELIASTRA_API_URL` for a local or staging backend; do not point a
development session at production by accident.

## Frontend development

Requires Node.js 20+ (npm only — `bun.lock` was removed).

```bash
cd frontend
cp .env.example .env
npm install
npx prisma generate
npm run dev
```

This starts Next.js on port 3000 (`next dev -p 3000`).

Other scripts from `frontend/package.json`:

| Script | Command |
|--------|---------|
| `npm run dev` | Next.js dev server on :3000 |
| `npm run build` | Production build (standalone) |
| `npm run start` | Serve standalone build via Node.js |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm test` | Vitest unit tests |
| `npm run db:generate` | `prisma generate` (one-shot support-ticket backfill only; the Prisma layer is otherwise retired) |

Frontend browser tests live in `frontend/e2e/`; their runtime setup depends on
the workflow being exercised.

## Backend development

Requires Python 3.11+ and Redis 7+. Persistence is **Supabase Postgres + Supabase Storage (S3)** - there is no local PostgreSQL or MinIO.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Set DATABASE_URL (Supabase Postgres), REDIS_URL, SECRET_KEY, and SUPABASE_S3_*
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Docker Compose (from `backend/`):

```bash
cd backend
docker-compose up -d --build
```

That starts Redis, MailHog, the API, and Celery workers. Postgres and object storage are **Supabase only** - set `DATABASE_URL` (Supabase pooler URI) and `SUPABASE_S3_*` in `backend/.env` before compose (see `backend/.env.example`).

Health check: `GET http://localhost:8000/health`

API docs: `http://localhost:8000/docs`

## Environment variables

Do not commit `.env` files.

| App | Template | Purpose |
|-----|----------|---------|
| Frontend | `frontend/.env.example` | Prisma `DATABASE_URL` (local SQLite) |
| Backend | `backend/.env.example` | Supabase Postgres, Redis, JWT `SECRET_KEY`, CORS, OAuth, Paystack, Supabase S3, SMTP |

Backend required for a real run: `DATABASE_URL` (Supabase Postgres), `REDIS_URL`, `SECRET_KEY`. Production also needs `ENVIRONMENT=production`, `CORS_ORIGINS`, and the `SUPABASE_S3_*` keys for evidence storage.

## Testing

```bash
# Backend (from backend/; uses embedded PostgreSQL + FakeRedis)
cd backend
pip install -r requirements.txt
pip install pytest pytest-asyncio pytest-mock fakeredis pgserver moto
pytest -v
pytest tests/unit -v
pytest tests/integration -v
pytest tests/e2e -v
```

```bash
# Frontend (from the repository root)
(cd frontend && npm install && npx prisma generate)
(cd frontend && npm run lint && npm run typecheck && npm test)

# CLI (tests + release packaging checks)
(cd cli && go test ./...)
bash cli/test/wrappers_smoke_test.sh
```

Or from the repo root: `make test` (backend pytest) and `make lint`.

## All-in-one container

A single production image runs the entire stack - frontend (:3000), API (:8000), Redis, and Celery worker/beat under `supervisord`:

```bash
docker build -t reliastra-allinone .

docker run -d --name reliastra \
  -p 3000:3000 -p 8000:8000 \
  -e DATABASE_URL="postgresql+asyncpg://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres" \
  -e SECRET_KEY="$(openssl rand -hex 32)" \
  -e ENVIRONMENT=production \
  -e SUPABASE_S3_ENDPOINT="https://<ref>.supabase.co/storage/v1/s3" \
  -e SUPABASE_S3_REGION="eu-west-3" \
  -e SUPABASE_S3_ACCESS_KEY_ID="..." \
  -e SUPABASE_S3_SECRET_ACCESS_KEY="..." \
  -e SUPABASE_S3_BUCKET="reliastra-evidence" \
  reliastra-allinone
```

The entrypoint validates configuration, runs `alembic upgrade head`, then supervisord starts everything. The frontend proxies `/api/*` to this container's API by default (`RELIASTRA_API_URL=http://127.0.0.1:8000`); override for split deployments.

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | required | Supabase Postgres (asyncpg URI) |
| `SECRET_KEY` | dev default | JWT/encryption secret (required in production) |
| `ENVIRONMENT` | `development` | Set to `production` to enable strict validation |
| `REDIS_URL` | in-container redis | External broker/cache override |
| `RELIASTRA_API_URL` | `http://127.0.0.1:8000` | Where the frontend proxies API calls |
| `ENABLE_CELERY` | `true` | Set `false` when a dedicated worker deployment owns scheduling |
| `API_WORKERS` | `2` | Uvicorn worker processes |

## Production architecture

Frontend and backend deploy independently. This monorepo does not force a combined release.

- **Frontend:** Next.js `output: "standalone"` (`frontend/next.config.ts`). Host with your existing frontend platform.
- **Backend:** Docker image (GHCR) and/or Nixpacks. GitHub Actions CD builds the all-in-one image and deploys it to the existing VPS over Tailscale. Compose file: `deploy/production/compose.yml`.
- **PaaS root directory** for backend-only hosts (Railway, Render, Nixpacks) must be `backend/`.

See [CI](.github/workflows/ci.yml) for the current validation, test, security,
and build jobs. Frontend unit tests and CLI checks have explicit commands above;
do not assume they are already included in the workflow.

## License

Proprietary - All rights reserved.
