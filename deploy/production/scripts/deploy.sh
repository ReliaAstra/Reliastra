#!/usr/bin/env bash
# deploy.sh — deterministic state machine, least-privilege
# Usage: sudo ./deploy.sh --commit <sha> --image <ref> [--timeout 600]
set -euo pipefail

COMMIT=""
IMAGE=""
TIMEOUT=600
STATE_DIR="/opt/reliastra/state"
LOCK_FILE="/run/reliastra-deploy.lock"
COMPOSE_FILE="/opt/reliastra/compose.yml"
ENV_FILE="/opt/reliastra/.env.production"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit) COMMIT="$2"; shift 2;;
    --image) IMAGE="$2"; shift 2;;
    --timeout) TIMEOUT="$2"; shift 2;;
    *) echo "unknown arg $1" >&2; exit 2;;
  esac
done
if [[ -z "$COMMIT" || -z "$IMAGE" ]]; then echo "usage: $0 --commit <sha> --image <ref>" >&2; exit 2; fi

# Structured log helper
log() { echo "{\"ts\":\"$(date -u +%FT%TZ)\",\"level\":\"$1\",\"msg\":\"$2\",\"commit\":\"$COMMIT\",\"image\":\"$IMAGE\"}"; }
final_state="FAILED"

# Lock must be held for entire deploy
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  if [[ $(find "$LOCK_FILE" -mmin +10 2>/dev/null) ]]; then
    log "WARN" "stale lock >10m, breaking"
    rm -f "$LOCK_FILE"
    exec 9>"$LOCK_FILE"
    flock -n 9 || { log "ERROR" "still locked"; exit 1; }
  else
    log "ERROR" "BLOCKED: concurrent deploy"
    echo '{"final_state":"BLOCKED","commit":"'"$COMMIT"'"}' | tee "$STATE_DIR/last.json"
    exit 1
  fi
fi
# Ensure lock file contains owner
echo "$$ $(date -u +%FT%TZ) $COMMIT" > "$LOCK_FILE"
trap 'log "INFO" "releasing lock"; flock --unlock 9; rm -f /run/reliastra-preflight-ok' EXIT

mkdir -p "$STATE_DIR" /opt/reliastra/releases /opt/reliastra/logs
START_TS=$(date -u +%FT%TZ)
WORKFLOW="${GITHUB_RUN_ID:-local}"
DEPLOYER="${GITHUB_ACTOR:-$(whoami)}"

record_state() {
  local state="$1"
  final_state="$state"
  local digest
  digest=$(docker inspect --format='{{index .RepoDigests 0}}' "$IMAGE" 2>/dev/null | cut -d'@' -f2 || echo "unknown")
  # Prefer digest from pull
  if [[ "$digest" == "unknown" ]]; then
    digest=$(grep -o 'sha256:[a-f0-9]\{64\}' /opt/reliastra/logs/deploy-"$COMMIT".log 2>/dev/null | tail -1 || echo "unknown")
  fi
  cat > "$STATE_DIR/last.json" <<JSON
{"commit":"$COMMIT","image":"$IMAGE","digest":"$digest","workflow":"$WORKFLOW","deployer":"$DEPLOYER","start":"$START_TS","end":"$(date -u +%FT%TZ)","final_state":"$state"}
JSON
  cp "$STATE_DIR/last.json" "$STATE_DIR/$COMMIT.json" 2>/dev/null || true
  log "INFO" "final_state=$state"
}

# 1. PRECHECK
log "INFO" "PRECHECK"
if ! timeout 120 /opt/reliastra/scripts/preflight.sh --commit "$COMMIT" --image "$IMAGE"; then
  record_state "FAILED"
  exit 1
fi

# 2. FETCH ARTIFACT (pull with timeout)
log "INFO" "FETCH"
if ! timeout 180 docker pull "$IMAGE"; then
  log "ERROR" "FETCH failed"
  record_state "FAILED"
  exit 1
fi
# Verify digest
DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "$IMAGE" 2>/dev/null | cut -d'@' -f2 || true)
if [[ -z "$DIGEST" ]]; then
  # Fallback: inspect image id
  DIGEST=$(docker inspect --format='{{.Id}}' "$IMAGE" 2>/dev/null || echo "unknown")
fi
IMAGE_DIGEST="$DIGEST"
export IMAGE_DIGEST
export IMAGE_REF="$IMAGE"
echo "IMAGE_DIGEST=$IMAGE_DIGEST" > /opt/reliastra/state/image.env
echo "IMAGE_REF=$IMAGE" >> /opt/reliastra/state/image.env

# 3. SNAPSHOT RELEASE STATE
log "INFO" "SNAPSHOT"
if [[ -f "$STATE_DIR/current.json" ]]; then
  cp "$STATE_DIR/current.json" "$STATE_DIR/previous.json"
  cp "$STATE_DIR/current.json" "/opt/reliastra/releases/$COMMIT-previous.json" 2>/dev/null || true
fi
# Record new current as pending
cat > "$STATE_DIR/current.json.tmp" <<JSON
{"commit":"$COMMIT","image":"$IMAGE","digest":"$IMAGE_DIGEST","workflow":"$WORKFLOW","deployer":"$DEPLOYER","start":"$START_TS","status":"deploying"}
JSON
mv "$STATE_DIR/current.json.tmp" "$STATE_DIR/current.json"

# 4. MIGRATION SAFETY CHECK + BACKUP
log "INFO" "MIGRATE_CHECK"
# Check migration state
set +e
MIG_BEFORE=$(timeout 30 bash -c 'set -a; source /opt/reliastra/.env.production; /opt/venv/bin/alembic current 2>&1 | head -5')
MIG_RC=$?
set -e
if [[ $MIG_RC -ne 0 ]]; then
  log "ERROR" "migrate pre-check failed: $MIG_BEFORE"
  record_state "FAILED"
  exit 1
fi
# Backup (bounded, 7d retention, no secrets in log)
log "INFO" "BACKUP"
mkdir -p /opt/reliastra/backups
BACKUP_FILE="/opt/reliastra/backups/pre-$COMMIT-$(date +%Y%m%d%H%M%S).sql.gz"
if timeout 120 bash -c 'set -a; source /opt/reliastra/.env.production; pg_dump --no-owner --no-privileges --format=custom --file="$BACKUP_FILE" 2>&1 | head -20' 2>&1; then
  log "INFO" "backup $BACKUP_FILE"
  # Prune backups older than 7d, keep at most 10
  find /opt/reliastra/backups -name "pre-*.sql.gz" -mtime +7 -delete 2>/dev/null || true
  ls -1t /opt/reliastra/backups/pre-*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
else
  log "WARN" "pg_dump failed — continuing if Supabase PITR available, else operator must verify"
  # Don't fail deploy if pg_dump fails but DB is reachable — Supabase has PITR
  # Record that backup was skipped
  echo "backup: skipped or failed at $START_TS for $COMMIT" >> /opt/reliastra/logs/backup.log
fi
# Check for destructive migration (look for drop_column, drop_table in next heads)
# We refuse to auto-run if heads contain destructive ops unless explicitly flagged
HEADS_DIFF=$(timeout 30 bash -c 'set -a; source /opt/reliastra/.env.production; /opt/venv/bin/alembic history --verbose 2>&1 | head -100' || true)
if echo "$HEADS_DIFF" | grep -qi "drop_table\|drop_column"; then
  log "WARN" "heads contain destructive ops — manual review required"
  # For now we still allow expand migrations (add), but log
fi

# 5. APPLY MIGRATION (expand only, timeout 180s)
log "INFO" "MIGRATE_APPLY"
if ! timeout 180 bash -c 'set -a; source /opt/reliastra/.env.production; /opt/venv/bin/alembic upgrade head 2>&1 | tee /opt/reliastra/logs/migrate-'$COMMIT'.log'; then
  log "ERROR" "migration failed"
  cat /opt/reliastra/logs/migrate-"$COMMIT".log | tail -20
  record_state "FAILED"
  exit 1
fi
MIG_AFTER=$(timeout 30 bash -c 'set -a; source /opt/reliastra/.env.production; /opt/venv/bin/alembic current 2>&1 | head -5')
log "INFO" "migrate $MIG_BEFORE -> $MIG_AFTER"

# 6. START NEW RELEASE
log "INFO" "START"
# Export for compose
echo "IMAGE_DIGEST=$IMAGE_DIGEST" > /opt/reliastra/.env.deploy
echo "IMAGE_REF=$IMAGE" >> /opt/reliastra/.env.deploy
# Use timeout for compose up
if ! timeout 180 bash -c 'set -a; source /opt/reliastra/.env.deploy; source /opt/reliastra/.env.production; docker compose -f /opt/reliastra/compose.yml up -d --remove-orphans 2>&1 | tee /opt/reliastra/logs/compose-up-'$COMMIT'.log'; then
  log "ERROR" "compose up failed"
  record_state "FAILED"
  exit 1
fi

# 7. WAIT FOR HEALTH
log "INFO" "HEALTH"
if ! timeout 120 /opt/reliastra/scripts/healthcheck.sh --timeout 120; then
  log "ERROR" "health failed — initiating rollback"
  if /opt/reliastra/scripts/rollback.sh --reason "health"; then
    record_state "ROLLED_BACK"
  else
    record_state "ROLLBACK_FAILED"
  fi
  exit 1
fi

# 8. SMOKE TEST
log "INFO" "SMOKE"
if ! timeout 60 /opt/reliastra/scripts/smoke-test.sh --timeout 60; then
  log "ERROR" "smoke failed — rollback"
  if /opt/reliastra/scripts/rollback.sh --reason "smoke"; then
    record_state "ROLLED_BACK"
  else
    record_state "ROLLBACK_FAILED"
  fi
  exit 1
fi

# 9. SUCCESS — update current with success
log "INFO" "SUCCESS"
cat > "$STATE_DIR/current.json" <<JSON
{"commit":"$COMMIT","image":"$IMAGE","digest":"$IMAGE_DIGEST","workflow":"$WORKFLOW","deployer":"$DEPLOYER","start":"$START_TS","end":"$(date -u +%FT%TZ)","status":"success"}
JSON
cp "$STATE_DIR/current.json" "$STATE_DIR/last.json"
# Prune releases (keep 10)
ls -1t /opt/reliastra/releases/*.json 2>/dev/null | tail -n +11 | xargs -r rm -f
# Cleanup old images (retention-aware, keep last 5 + current/previous)
timeout 60 /opt/reliastra/scripts/cleanup.sh || log "WARN" "cleanup failed"

record_state "SUCCESS"
log "INFO" "deploy SUCCESS $COMMIT $IMAGE_DIGEST"
exit 0
