# RELIASTRA

Reliastra monitors third-party vendor APIs and services, correlates failures with customer-reported incidents, attributes blame with a deterministic engine, and generates cryptographically verifiable SLA evidence reports.

This is the canonical Reliastra monorepo: the Next.js frontend and the FastAPI backend live side by side as independent applications.

## Repository structure

```
Reliastra/
├── frontend/     # Next.js app (marketing, partner network, dashboard UI)
├── backend/      # FastAPI app (API, workers, evidence, billing)
├── docs/architecture/
├── .github/workflows/
├── Makefile
└── README.md
```

Source applications were consolidated from:

- Frontend: https://github.com/ReliaAstra/Frontend
- Backend: https://github.com/ReliaAstra/Reliastra-backend

Those repositories are kept as references. Application code was not rewritten for this move.

## Architecture

```
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

Details: [`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md).

The frontend proxies Partner Network calls to the production API at `https://api.reliastra.com/v1`. Override with `RELIASTRA_API_URL` for local or staging backends.

## Frontend development

Requires Node.js 20+ (the app also has a `bun.lock`; Bun works if you prefer it).

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
| `npm run start` | Serve standalone build via Bun |
| `npm run lint` | ESLint |
| `npm run db:generate` | `prisma generate` |
| `npm run db:push` | `prisma db push` |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:reset` | `prisma migrate reset` |

There is no frontend unit-test script in `package.json`.

## Backend development

Requires Python 3.11+ and Redis 7+. Persistence is **Supabase Postgres + Supabase Storage (S3)** — there is no local PostgreSQL or MinIO.

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

That starts Redis, MailHog, the API, and Celery workers. Postgres and object storage are **Supabase only** — set `DATABASE_URL` (Supabase pooler URI) and `SUPABASE_S3_*` in `backend/.env` before compose (see `backend/.env.example`).

Health check: `GET http://localhost:8000/health`

API docs: `http://localhost:8000/docs`

## Environment variables

Do not commit `.env` files.

| App | Template | Purpose |
|-----|----------|---------|
| Frontend | `frontend/.env.example` | Prisma `DATABASE_URL` (local SQLite) |
| Backend | `backend/.env.example` | Supabase Postgres, Redis, JWT `SECRET_KEY`, CORS, OAuth, Paystack, Supabase S3, SMTP, partner program |

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

# Frontend lint
cd frontend
npm install
npm run lint
```

Or from the repo root: `make test` (backend pytest) and `make lint`.

## All-in-one container

A single production image runs the entire stack — frontend (:3000), API (:8000), Redis, and Celery worker/beat under `supervisord`:

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
- **Backend:** Docker image (GHCR) and/or Nixpacks. GitHub Actions CD builds `backend/` and deploys the API container to the existing VPS. Compose file: `backend/docker-compose.production.yml`.
- **PaaS root directory** for backend-only hosts (Railway, Render, Nixpacks) must be `backend/`.

CI is path-aware: changes under `frontend/**` run frontend checks; changes under `backend/**` run backend lint/import/security/tests.

## License

Proprietary — All rights reserved.
