# Architecture — Source → Artifact → Production

## Overview
```
Developer → GitHub (PR → CI) → GHCR (immutable @sha256) → Tailscale (100.x) → VPS (Caddy → api/worker/scheduler → Supabase PG + Redis)
```
Single VPS today, extensible to multi-host, managed DB/Redis, external storage, staging, blue/green, multi-region without rewriting `commit → digest → release`.

## Trust boundaries
- **Workstation untrusted** for prod admin — no public SSH.
- **GitHub** — control plane, may deploy via least-privilege `reliastra-deploy` over Tailscale only.
- **GHCR** — distribution plane, immutable `ghcr.io/reliastra/reliastra@sha256:...`.
- **Tailscale** — admin network (`tailscale0` 100.64/10), ACL `tag:prod:22` only for `autogroup:admin` and `tag:ci`.
- **VPS** — execution env, assumed exposed to app threats, host firewall + container hardening.
- **Containers** — workloads, receive only required secrets, `read_only`, `no-new-privileges`, `cap_drop: ALL`, `user: 10001`, no `privileged`, no `host` net, no `docker.sock`.

## Release model
`commit SHA (40 hex) + image digest + workflow_run + timestamp + deployer` stored in `/opt/reliastra/state/current.json` and GH deployment. `latest` never used in prod. `build once, promote same digest` to staging then prod via different `.env`.

## Network
- Public: `80/443` → Caddy → `api:8000` (frontend) + `/api/*` → `api`. UFW `allow 80,443`, `deny 22` public, `allow 22 on tailscale0`.
- Internal: `api, worker, scheduler, redis` on `reliastra-internal` (`internal: true`), `redis:6379` not exposed to host.
- SSH: `sshd ListenAddress 127.0.0.1 + 100.x`, `PasswordAuthentication no`, `PermitRootLogin no`, `AllowUsers reliastra-admin`.

## Deployment abstraction
`artifact (digest) → release (commit+env) → target (prod-vps-01) → runtime (compose)` → future `target=prod-cluster, runtime=k8s`.

## Secrets
Image has no secrets. Runtime env from `/opt/reliastra/.env.production` (0600, root:root). GH `environment: production` secrets (`TS_*, PROD_DEPLOY_SSH_*`) are narrow, rotatable, never shared with DB/JWT.

## DB
Expand/contract, `pg_dump` backup before migrate (7d/10), `alembic upgrade head` with 180s timeout, no auto `downgrade` on rollback.

## Observability
`/health/live` (liveness) vs `/health/ready` (DB+Redis). `deploy.sh` emits JSON lines + `state/last.json` with `SUCCESS|FAILED|ROLLED_BACK|ROLLBACK_FAILED|BLOCKED`. `journalctl`, `docker logs`, `tailscale whois` for audit.

## Future
Add `staging` env (same artifact, different `.env`), then `blue/green` by extending `deploy.sh` `START→HEALTH→smoke→switch Caddy` without changing release concept.
