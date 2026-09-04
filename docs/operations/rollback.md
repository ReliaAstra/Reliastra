# Rollback

## Application vs DB
Rollback = revert **application image**. DB rollback is NOT automatic. Migrations are `expand/contract`:

```
Release N   add column/table (nullable, backward compat)
Release N+1 write/read new, still read old
Release N+2 drop old (after N+1 stable)
```
Thus app rollback (N+1 → N) stays safe because N still understands old schema.

## Automatic rollback
`deploy.sh` auto-rollbacks when:
- `healthcheck.sh` never healthy (120s)
- `smoke-test.sh` fails

It **never** downgrades DB:
```
new app stopped → previous image verified (still in GHCR) → previous app started → health+smoke → report ROLLED_BACK
DB left intact, operator notified
```
If migration was `expand` (additive), rollback is safe. If heads contained `drop_column/drop_table`, `deploy.sh` logs WARN and operator must decide — auto-rollback will still restore previous app but DB will have extra column (harmless) not missing column.

## Manual rollback
```bash
ssh reliastra-admin@100.x
cat /opt/reliastra/state/current.json
cat /opt/reliastra/state/previous.json
sudo /opt/reliastra/scripts/rollback.sh --reason manual
# Check
sudo /opt/reliastra/scripts/healthcheck.sh
curl -fsS http://127.0.0.1:8000/health/ready | jq
```

## What rollback retains
- Bounded history: `/opt/reliastra/releases/*.json` (keep 10) + GHCR last 5 images + `previous.json`
- `image digest`, `commit`, `timestamp`, `deployer`

## When rollback fails
`ROLLBACK_FAILED` → escalate: inspect `docker logs reliastra-api --tail 100`, `alembic current`, `df -h`, `free -m`, `/opt/reliastra/logs/deploy-<sha>.log`. Do NOT run `alembic downgrade` blindly. Restore from `backups/pre-<sha>.sql.gz` or Supabase PITR only after confirming data loss.

## Idempotency
`rollback.sh` twice is safe — second finds `current == previous` and converges.
