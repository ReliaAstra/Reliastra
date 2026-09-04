# CI/CD — Source → Artifact → Release

## Artifact lifecycle
```
commit SHA → CI (validate/test/security) → docker build → GHCR ghcr.io/reliastra/reliastra@sha256:<digest> → Tailscale → VPS → state/current.json
```
Production never rebuilds, never `git pull`, never `build:`.

## CI `.github/workflows/ci.yml`
- **validate** (5m): `ruff check`, `ruff format --check`, `eslint`, `tsc`, `alembic check` (fails on main if drift)
- **test** (15m, needs validate): `pytest -v` with `pgserver` + `fakeredis` (no external DB)
- **security** (10m): `pip-audit`, `npm audit --audit-level=high`, `gitleaks`, `trivy fs` → SARIF
- **build** (25m, needs test+security): `docker buildx` `linux/amd64` → `ghcr.io/reliastra/reliastra:sha-<sha>` + `:latest` on main, `cache gha`, `provenance max`, `sbom true`, `trivy image` → `attest-build-provenance` + `sbom spdx` artifact. Digest is output.

All jobs `timeout-minutes`, `concurrency: cancel-in-progress`, pinned actions `v4/v5/v6`.

## CD `.github/workflows/deploy-production.yml`
- Trigger: `workflow_run: CI success on main` or `workflow_dispatch` with `commit_sha`/`image_digest` (for rollback/promote).
- `concurrency: production-deploy` (no cancel, queue).
- `environment: production` — GitHub Environment protection (required reviewers, branch protection). Secrets scoped to this env.
- **resolve**: determine `commit_sha` + `image_ref` (`:sha-<sha>`), create GH deployment (audit).
- **deploy**: `tailscale/github-action` (oauth `tag:ci`) → `tailscale ping` → `ssh reliastra-deploy@100.x` (least-privilege key, `known_hosts` pinned) → `preflight.sh` → `deploy.sh --commit --image --timeout 600` → `smoke-test.sh`.
- Artifacts: `deploy.log` uploaded, deployment status `success/failure` via `chrnorm/deployment-status`.

## Promotion
Build once, promote same digest:
```
CI → ghcr.io/...:sha-abc (digest sha256:...)
→ staging (IMAGE_DIGEST=sha256:... + staging .env)
→ production (same digest + prod .env)
```
No rebuild.

## Secrets
GH `TS_OAUTH_CLIENT_ID/SECRET`, `PROD_TAILSCALE_*`, `PROD_DEPLOY_SSH_PRIVATE_KEY`, `PROD_SSH_KNOWN_HOSTS` are `environment: production` secrets, narrow, rotatable. No secrets in image, no CLI echo. `set +x` in deploy.

## Audit
Every deploy writes `/opt/reliastra/state/*.json` + GH deployment + workflow run → chain `commit → workflow → digest → production`.
