# Deployment

## Source → Artifact → Release
```
commit SHA (git) → CI (validate/test/security) → docker build → GHCR ghcr.io/reliastra/reliastra@sha256:<digest> → Tailscale → VPS → /opt/reliastra
```
Production identity = commit SHA + image digest (never `latest`). `IMAGE_REF=ghcr.io/reliastra/reliastra:sha-<sha>` and `IMAGE_DIGEST=sha256:...` stored in `/opt/reliastra/state`.

## CI (is production-ready?)
`.github/workflows/ci.yml`: `validate` (ruff, eslint, tsc, alembic check) → `test` (pytest with pgserver/fakeredis) → `security` (pip-audit, npm audit, gitleaks, trivy fs) → `build` (buildx, push GHCR, attest provenance, SBOM via Syft, trivy image). Fail closed.

## CD (can this artifact be promoted?)
`.github/workflows/deploy-production.yml` (env: `production` with protection/approval):
- `workflow_run` on `main` after CI success, or `workflow_dispatch` with `commit_sha`/`image_digest`.
- Tailscale GH Action → SSH as `reliastra-deploy` (least privilege) → `sudo /opt/reliastra/scripts/deploy.sh --commit <sha> --image <ref>`

### State machine (`deploy.sh`)
```
PRECHECK (lock flock 10m stale, disk>2GB, mem>1GB, env, DB via alembic, registry reachable, no concurrent)
→ FETCH (docker pull --timeout 180, verify digest)
→ SNAPSHOT (copy current.json → previous.json)
→ MIGRATION CHECK (alembic current, detect destructive, warn)
→ BACKUP (pg_dump no-owner custom → /opt/reliastra/backups/pre-<sha>-*.sql.gz, retain 7d/10)
→ MIGRATE (alembic upgrade head, timeout 180)
→ START (docker compose -f /opt/reliastra/compose.yml up -d --remove-orphans, timeout 180)
→ HEALTH (healthcheck.sh --timeout 120: /health/live 200 + /health/ready 200 + proxy 200)
→ SMOKE (smoke-test.sh --timeout 60: openapi.json valid, /v1/public/vendors, frontend 200, auth 401 shape)
→ SUCCESS (write current.json success, prune releases 10, cleanup.sh retention-aware)
```
Any failure → `FAILED`; health/smoke fail → auto `rollback.sh` → `ROLLED_BACK` or `ROLLBACK_FAILED` (escalate).

## Configuration
Artifact ≠ config. Image has no secrets. Runtime env from `/opt/reliastra/.env.production` (0600) injected via `compose.yml` `env_file`. No `.env.production` in repo. Secrets scoped per function (DB, Redis, JWT, S3, Paystack) never via CLI.

## Network
`compose.yml` networks: `public` (proxy 80/443 only) + `internal: true` (api:3000, redis:6379 private). No `host` networking, no `privileged`, no `docker.sock` mount, `read_only: true`, `tmpfs: /tmp`, `cap_drop: ALL`, `user: 10001`.

## Commands
```bash
# Manual (over Tailscale)
ssh reliastra-admin@100.x
sudo /opt/reliastra/scripts/preflight.sh --commit <sha> --image ghcr.io/reliastra/reliastra:sha-<sha>
sudo /opt/reliastra/scripts/deploy.sh --commit <sha> --image ghcr.io/reliastra/reliastra:sha-<sha>
sudo /opt/reliastra/scripts/healthcheck.sh --timeout 120
sudo /opt/reliastra/scripts/smoke-test.sh
sudo /opt/reliastra/scripts/rollback.sh --reason manual
sudo /opt/reliastra/scripts/cleanup.sh
cat /opt/reliastra/state/current.json | jq
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

## Idempotency
`deploy 4f91e1d` twice: preflight detects `current commit == 4f91e1d` → converges (compose up idempotent), no duplicate resources.

## Timeouts
All steps bounded: pull 180, migrate 180, health 120, smoke 60, rollback 120, deploy total 600. Hung deploy = incident.

## Extensibility
`deploy.sh` abstraction (`artifact, release, environment, target, health/migration/rollback policy`) allows future `target=staging`, `target=prod-cluster` or `runtime=k8s` without rewriting source → artifact → release.
