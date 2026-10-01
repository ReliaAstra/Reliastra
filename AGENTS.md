# AGENTS.md — Reliastra

Polyglot monorepo. Read this before touching anything.

| Component | Stack | Root | Entry point |
|---|---|---|---|
| Backend API | Python 3.11+, FastAPI, SQLAlchemy, Alembic, Celery | `backend/` | `app/main.py` |
| Frontend | Next.js (App Router), React, TypeScript, Tailwind | `frontend/` | `next.config.ts` |
| CLI | Go 1.23 + Python/Node wrappers | `cli/` | `cmd/reliastra` |
| Deploy | Docker, supervisord, Caddy | `deploy/` | `deploy/entrypoint.sh` |

## Use the knowledge graph first

A Graphify graph is built and current. **Query it before grepping or reading files.**

```bash
graphify query "how does <feature> work"     # scoped subgraph, use this first
graphify path "SymbolA" "SymbolB"             # how two things connect
graphify explain "path/to/file.py::Symbol"    # what it is + its neighbors
graphify update .                             # after you edit files
```

Ambiguous symbols need a path qualifier: `graphify explain "backend/app/modules/users/models.py::User"`.
If a graph node has no file (frontend `cn()` / React helpers), the report's God Nodes section is faster.

**When to skip the graph:** exact-string questions (a literal string, a flag name, a log line),
and verifying that a specific line actually says what a node claims. Those are grep/read tasks.

**Graph limits — know these so you don't trust a false negative:**
- **28 infra files are not indexed** (no supported extension): `Dockerfile`, `Caddyfile`,
  `.nixpacks.toml`, `.dockerignore`, `.env.example`. Deploy topology is invisible to the graph.
  Read those files directly.
- **Import cycles reported in `GRAPH_REPORT.md` are mostly the Python `__init__.py` re-export
  pattern** (`__init__ -> router -> service -> __init__`). Treat them as "inspect this", not
  as confirmed bugs. Concentrated in `app/modules/evidence/` and `app/modules/outreach/`.
- **`graphify update .` re-widens scope** and will pull the 78 markdown docs back in on a graph
  that was built code-only. Harmless (local, no LLM) but expect the node count to jump.
- Communities are labelled `Community N` — no LLM was used, by policy.

## Backend (`backend/`)

`app/` is layered: `api/` (routers) → `modules/` (domain) → `core/`, `db/`, `platform/`,
`infrastructure/`. **`app/modules/` is where the domain lives** — 40 feature modules
(`auth`, `users`, `organizations`, `billing`, `evidence`, `outreach`, `partners`,
`notifications`, `webhooks`, `vendors`, …). Each module owns its own models, repository,
service and router. Put new domain code in a module, not in a shared dumping ground.

- Migrations: `app/db/migrations` (Alembic). Schema changes need a migration, not just a model edit.
- Async work goes through Celery (`celery_worker.dockerfile`, `supervisord.conf`).
- `app/config.py` is the settings entry point.

## Frontend (`frontend/`)

Next.js App Router. `components/dashboard/ui/` holds the primitive component set
(`cn()`, `StatusBadge`, …) — reuse before adding a new primitive. Playwright specs in
`e2e/`, Vitest for unit tests. `db/` is a **retired** Prisma layer; do not add to it.

## CLI (`cli/`)

Go module `github.com/ReliaAstra/Reliastra/cli`. Built with GoReleaser
(`.goreleaser.yaml`); release artifacts are produced by CI, not committed. Python and
Node wrappers live in `cli/python/` and `cli/npm/`.

## Commands (verified against the Makefile)

```bash
make install          # npm install (frontend) + pip install -r requirements.txt (backend)
make backend          # uvicorn app.main:app --reload  :8000
make frontend         # next dev -p 3000
make test             # backend: pytest -v
make lint             # frontend: eslint .  |  backend: ruff check app/ tests/
make cli              # go build ./...
make cli-test         # gofmt check + go vet + go test -race ./...
```

Frontend-only: `npm run typecheck` (tsc --noEmit), `npm run test` (vitest), `npm run e2e`-style
Playwright specs under `e2e/`.

## Before you commit

- Backend: `make test` and `make lint` (ruff) must pass.
- Frontend: `npm run typecheck` and `npm run lint`.
- CLI: `make cli-test` (includes `gofmt -l` and `go vet`).
- Never commit `.env` (both `backend/.env` and `frontend/.env` exist locally and are gitignored).
- `graphify-out/` is **not** in `.gitignore`. Decide deliberately: commit `graph.json` for the
  team with `git add -f graphify-out/graph.json`, or ignore the directory. Do not let it drift
  untracked by accident.
