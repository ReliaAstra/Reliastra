#!/usr/bin/env bash
# rollback.sh - restore previous known-good application release
# Usage: sudo ./rollback.sh [--reason health|smoke|manual]
# Never auto-downgrades DB.
set -euo pipefail

REASON="${1:-manual}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --reason) REASON="$2"; shift 2;;
    *) shift;;
  esac
done

STATE_DIR="/opt/reliastra/state"
COMPOSE_FILE="/opt/reliastra/compose.yml"
ENV_FILE="/opt/reliastra/.env.production"

if [[ ! -f "$STATE_DIR/previous.json" ]]; then
  echo "ROLLBACK FAIL: no previous release at $STATE_DIR/previous.json" >&2
  exit 1
fi

PREV_COMMIT=$(jq -r .commit "$STATE_DIR/previous.json")
PREV_IMAGE=$(jq -r .image "$STATE_DIR/previous.json")
PREV_DIGEST=$(jq -r .digest "$STATE_DIR/previous.json")
CUR_COMMIT=$(jq -r .commit "$STATE_DIR/current.json" 2>/dev/null || echo "unknown")

echo "rollback: $CUR_COMMIT -> $PREV_COMMIT ($PREV_IMAGE @ $PREV_DIGEST) reason=$REASON"

# Verify artifact still exists (pull)
if ! timeout 120 docker pull "$PREV_IMAGE"; then
  echo "ROLLBACK FAIL: previous image not in registry $PREV_IMAGE" >&2
  exit 1
fi
# Verify digest if available
if [[ "$PREV_DIGEST" != "null" && "$PREV_DIGEST" != "unknown" && -n "$PREV_DIGEST" ]]; then
  actual=$(docker inspect --format='{{index .RepoDigests 0}}' "$PREV_IMAGE" 2>/dev/null | cut -d'@' -f2 || true)
  if [[ -n "$actual" && "$actual" != "$PREV_DIGEST" ]]; then
    echo "WARN: previous digest mismatch expected $PREV_DIGEST got $actual" >&2
  fi
fi

# Config compatibility - ensure .env still valid
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ROLLBACK FAIL: $ENV_FILE missing" >&2
  exit 1
fi

# Restore - do NOT downgrade DB
echo "rollback: restoring app image (DB left intact)"
export IMAGE_REF="$PREV_IMAGE"
export IMAGE_DIGEST="$PREV_DIGEST"
echo "IMAGE_DIGEST=$PREV_DIGEST" > /opt/reliastra/state/image.env
echo "IMAGE_REF=$PREV_IMAGE" >> /opt/reliastra/state/image.env

if ! timeout 180 bash -c 'set -a; source /opt/reliastra/state/image.env; source /opt/reliastra/.env.production; docker compose -f /opt/reliastra/compose.yml up -d --remove-orphans'; then
  echo "ROLLBACK FAIL: compose up failed" >&2
  exit 1
fi

# Health
#
# This IS part of the restore. Health failing means the previous release did
# not come up, so the rollback genuinely did not achieve its goal and the
# operator needs to know the host is not serving. `record_state` lives in
# deploy.sh and is deliberately not called here - this script is also invoked
# directly by an operator, where that function does not exist.
if ! timeout 120 /opt/reliastra/scripts/healthcheck.sh --timeout 120; then
  echo "ROLLBACK FAIL: previous release did not become healthy" >&2
  exit 1
fi

# Smoke after rollback.
#
# This is a VERIFICATION step, not part of the restore. The previous image has
# already been pulled, the environment written and `compose up` has returned
# zero by the time this line runs - production is on the previous release
# either way. Exiting non-zero here used to report ROLLBACK_FAILED, which
# claims the restore itself broke when the only thing that failed was a
# re-run of the same assertions against the same database and Redis.
#
# That distinction cost a real diagnosis: on 2026-10-03 the smoke probe for
# /v1/vendors returned 500 both before and after the rollback, and the
# ROLLBACK_FAILED verdict implied the previous release was also broken - which
# was false, since that identical image had passed the identical probe two days
# earlier. The fault was environmental, not in either image.
#
# So the restore is recorded as complete, and only the verification verdict is
# allowed to change the exit status. ROLLBACK_UNVERIFIED means "the previous
# release is live and something is wrong with it" - a different, and much more
# actionable, statement than "the rollback failed".
smoke_ok=1
if ! timeout 90 /opt/reliastra/scripts/smoke-test.sh --timeout 60; then
  smoke_ok=0
  echo "ROLLBACK UNVERIFIED: smoke failed against the restored release" >&2
  echo "  previous release IS live; the failing assertion above is not evidence" >&2
  echo "  that this rollback caused it. Treat as an environment or data fault." >&2
fi

# Promote previous to current
cp "$STATE_DIR/previous.json" "$STATE_DIR/current.json"

if [[ "$smoke_ok" -eq 1 ]]; then
  final_state="ROLLED_BACK"
  cat > "$STATE_DIR/last.json" <<JSON
{"commit":"$PREV_COMMIT","image":"$PREV_IMAGE","digest":"$PREV_DIGEST","reason":"rollback:$REASON","from":"$CUR_COMMIT","end":"$(date -u +%FT%TZ)","final_state":"ROLLED_BACK"}
JSON
  echo "ROLLBACK SUCCESS to $PREV_COMMIT"
  exit 0
fi

echo "ROLLBACK COMPLETED BUT UNVERIFIED to $PREV_COMMIT" >&2
exit 2
