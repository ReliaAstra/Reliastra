#!/usr/bin/env bash
# rollback.sh — restore previous known-good application release
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

# Config compatibility — ensure .env still valid
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ROLLBACK FAIL: $ENV_FILE missing" >&2
  exit 1
fi

# Restore — do NOT downgrade DB
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
if ! timeout 120 /opt/reliastra/scripts/healthcheck.sh --timeout 120; then
  echo "ROLLBACK FAIL: health after rollback" >&2
  exit 1
fi
if ! timeout 60 /opt/reliastra/scripts/smoke-test.sh --timeout 60; then
  echo "ROLLBACK FAIL: smoke after rollback" >&2
  exit 1
fi

# Promote previous to current
cp "$STATE_DIR/previous.json" "$STATE_DIR/current.json"
cat > "$STATE_DIR/last.json" <<JSON
{"commit":"$PREV_COMMIT","image":"$PREV_IMAGE","digest":"$PREV_DIGEST","reason":"rollback:$REASON","from":"$CUR_COMMIT","end":"$(date -u +%FT%TZ)","final_state":"ROLLED_BACK"}
JSON
echo "ROLLBACK SUCCESS to $PREV_COMMIT"
exit 0
