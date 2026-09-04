# Incident Response — Production

## Triage (Tailscale)
```bash
ssh reliastra-admin@100.x
sudo /opt/reliastra/scripts/healthcheck.sh --timeout 60
docker ps --format "table {{.Names}}\t{{.Status}}"
docker logs --tail 100 reliastra-api
cat /opt/reliastra/state/current.json | jq
cat /opt/reliastra/state/last.json | jq
alembic current
curl -fsS http://127.0.0.1:8000/health/ready | jq
curl -fsS http://127.0.0.1:8000/metrics | head
```

## Scenarios
- **Deploy failed, previous still healthy** → `deploy.sh` already rolled back or left `FAILED`. Inspect `logs/deploy-*.log`, fix source, re-deploy same or new SHA. No DB downgrade.
- **New release unhealthy** → auto `rollback.sh` to `previous.json`. Verify `healthcheck.sh` then `smoke-test.sh`. If rollback fails → `ROLLBACK_FAILED` → manual: `docker pull <previous image>`, `docker compose up -d`, health, then escalate.
- **DB migration failed** → deployment `FAILED`, DB at previous head, no backup restore needed. Fix migration (expand), re-deploy.
- **Rollback fails** → check `docker pull` for previous digest, `df -h` / `free -m`, `alembic history`, `tailscale status`, `ufw status`. If DB corrupted, restore from `backups/pre-*.sql.gz` or Supabase PITR (not `alembic downgrade` blindly).
- **VPS unreachable** → use provider console, `systemctl status docker`, `journalctl -u sshd`, `tailscale status`.

## Comms
GH `deploy-production.yml` logs + `state/*.json` are audit. Post incident in `docs/operations` with commit, digest, timeline, root cause, and whether DB was touched.

## No public SSH
All ops via Tailscale. If Tailscale down, provider console is the only break-glass.
