# Database Safety

## Expand/Contract (required)
```
N   : add nullable column / new table (backward compat with N)
N+1 : dual-write/read new, still support old
N+2 : drop old
```
Never `drop_column` in same release that stops reading it.

## Pre-migration (deploy.sh)
1. `alembic current` must succeed (DB reachable, head known)
2. Detect destructive heads (`drop_table`/`drop_column` in `alembic history`) → WARN (operator review, not auto-block for additive)
3. Backup: `pg_dump --no-owner --format=custom` → `/opt/reliastra/backups/pre-<sha>-<ts>.sql.gz` (0600, 7d retention, max 10). If `pg_dump` fails and Supabase PITR exists, log WARN and continue (PITR is actual recovery).
4. `alembic upgrade head` with `timeout 180`. On fail → `FAILED` (production preserved, no new current).

## Rollback
`rollback.sh` **never** runs `alembic downgrade`. It restores previous **app image** only, DB stays at migrated schema (expand ensures old app still works). If migration was destructive (contract) and rollback would break, `deploy.sh` already warned and operator must decide — auto-rollback will still try app revert but DB remains, and `healthcheck` will tell if incompatible (`ROLLBACK_FAILED` → escalate).

## Backup vs Rollback
- `previous.json` + GHCR digest = app rollback
- `backups/*.sql.gz` + Supabase PITR = data recovery
- Never `docker system prune -a` destroying backups

## Verification
```bash
alembic current
alembic history --verbose
ls -lh /opt/reliastra/backups/
pg_restore --list /opt/reliastra/backups/pre-*.sql.gz | head
```
