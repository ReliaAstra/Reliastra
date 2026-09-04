# Observability — Health, Deploy, Logs

## Health
- `GET /health/live` — liveness: process alive? Always 200 if uvicorn running. No DB/Redis.
- `GET /health/ready` + `GET /health` (compat) — readiness: DB `SELECT 1` + `redis ping` → 200 ok else 503 degraded. `healthcheck.sh` requires `live=ok && ready=200 && proxy 200` within 120s (poll 5s, 6 retries).
- Uvicorn `healthcheck` in `compose.yml` uses `/health/live` with `start_period 30s`.

## Deploy observability
Every `deploy.sh` emits JSON lines:
```json
{"ts":"2025-09-04T10:00:00Z","level":"INFO","msg":"HEALTH","commit":"abc","image":"..."}
```
Final state file `/opt/reliastra/state/last.json`:
```json
{"commit":"abc","image":"ghcr.io/...:sha-abc","digest":"sha256:...","workflow":"123","deployer":"arena","start":"...","end":"...","final_state":"SUCCESS"}
```
States: `SUCCESS | FAILED | ROLLED_BACK | ROLLBACK_FAILED | BLOCKED`.
Logs: `/opt/reliastra/logs/deploy-<sha>.log`, `compose-up-<sha>.log`, `migrate-<sha>.log` (30d, 100M cap, truncated).

## Metrics
- `GET /metrics` (Prometheus) — `reliastra_*` counters already in app (see `backend/docs/observability`).
- Caddy access logs `json` to stdout, `docker logs`.

## Audit
- GH: `Deployments` tab + `deploy-production.yml` + `state/*.json`
- Host: `journalctl -u sshd`, `tailscale whois`, `cat /opt/reliastra/state/current.json`
- No custom audit DB needed.
