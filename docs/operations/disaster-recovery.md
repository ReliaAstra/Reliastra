# Disaster Recovery — Rollback vs Recovery

```
Rollback  → revert application release (previous image)
Recovery  → restore service/data after corruption / catastrophic failure
```

Deploying previous image **cannot** recover a destroyed database.

## Backups (independent of deploy artifacts)
- Production DB: Supabase PITR + `deploy.sh` pre-migration `pg_dump --format=custom` to `/opt/reliastra/backups/pre-<sha>-*.sql.gz` (7d, max 10, 0600). Verify: `pg_restore --list`.
- If managed Postgres later: use provider snapshot + `PRECHECK` will detect managed and skip local dump (log).

## Failure scenarios
- **Registry unavailable**: `preflight` `docker pull`/`manifest inspect` times out (120s) → `FAILED`, production untouched.
- **Migration fails**: `alembic upgrade head` timeout 180s → `FAILED`, `previous.json` preserved, no new current.
- **Image broken / health never ready**: `healthcheck.sh` 120s → auto `rollback.sh` → `ROLLED_BACK` or `ROLLBACK_FAILED`.
- **Smoke fails**: same as health.
- **Rollback fails**: `ROLLBACK_FAILED` → operator must `ssh` via Tailscale, inspect `state/`, `docker ps`, `logs`, `alembic current`, disk/mem, then manual recovery.
- **VPS loses connectivity**: GH deploy times out (20m job) → `FAILED` in GH, VPS lock auto-expires after 10m stale, operator re-deploys.
- **GitHub Actions fails**: host remains operable via Tailscale (`/opt/reliastra/scripts/*` are host-local, not GH-dependent).

## Recovery steps (real data loss)
```bash
ssh reliastra-admin@100.x
ls -lt /opt/reliastra/backups/
# Supabase: use dashboard PITR to point-in-time, or
pg_restore --clean --if-exists -d "$DATABASE_URL" /opt/reliastra/backups/pre-<sha>.sql.gz
sudo /opt/reliastra/scripts/healthcheck.sh
```

## Operator checklist
- `tailscale status`, `ufw status verbose`, `systemctl status docker`, `docker ps`, `cat /opt/reliastra/state/current.json`, `alembic current`, `curl /health/ready`, `curl /sitemap.xml`.

Do not `docker system prune -a` on production.
