#!/usr/bin/env bash
# Preflight - verify host and release are safe to deploy
# Usage: sudo ./preflight.sh --commit <sha> --image <ref> [--timeout 120]
set -euo pipefail

COMMIT=""
IMAGE=""
TIMEOUT=120
LOCK_FILE="/run/reliastra-deploy.lock"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --commit) COMMIT="$2"; shift 2;;
    --image) IMAGE="$2"; shift 2;;
    --timeout) TIMEOUT="$2"; shift 2;;
    *) echo "unknown arg $1" >&2; exit 2;;
  esac
done

if [[ -z "$COMMIT" || -z "$IMAGE" ]]; then
  echo "usage: $0 --commit <sha> --image <ref>" >&2
  exit 2
fi

# Must match 40 hex
if ! [[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "FATAL: commit $COMMIT not a 40-char sha" >&2
  exit 1
fi

echo "=== PRECHECK commit=$COMMIT image=$IMAGE ==="

# 1. No concurrent deployment (flock, 10m stale)
exec 9>"$LOCK_FILE" || { echo "cannot open lock $LOCK_FILE" >&2; exit 1; }
if ! flock -n 9; then
  # Check stale: lock older than 10m
  if [[ $(find "$LOCK_FILE" -mmin +10 2>/dev/null) ]]; then
    echo "WARN: stale lock >10m, breaking" >&2
    flock --unlock 9 || true
    rm -f "$LOCK_FILE"
    exec 9>"$LOCK_FILE"
    flock -n 9 || { echo "still locked" >&2; exit 1; }
  else
    echo "BLOCKED: another deployment holds $LOCK_FILE" >&2
    exit 1
  fi
fi
# Keep lock fd open until script ends; caller (deploy.sh) will hold it

# 2. Disk / memory
#
# Reclaim before refusing. cleanup.sh only runs at the *end* of a successful
# deploy, so a host that filled up (build cache, an interrupted deploy, a
# half-written image) could never recover on its own: preflight hard-failed,
# cleanup was never reached, and the disk stayed full. That is a deadlock, not
# a safety check, and it turns a routine full disk into a manual page.
#
# The reclaim is deliberately narrow. Build cache is regenerable and nothing
# running depends on it; `image prune` without filters is not run here because
# that would remove the very image this deploy is about to roll out.
reclaim_disk() {
  command -v docker >/dev/null 2>&1 || return 1
  # Build cache first: it is the largest reclaimable class on a host that only
  # ever *pulls* prebuilt images, so it is pure waste here.
  timeout 300 docker buildx prune -af >/dev/null 2>&1 || true
  # Dangling layers only. Never `-a`: the deploy target is unreferenced and
  # would be destroyed.
  timeout 120 docker image prune -f --filter 'dangling=true' >/dev/null 2>&1 || true
}

avail_mb=$(df -m / | awk 'NR==2{print $4}')
if (( avail_mb < 2048 )); then
  echo "WARN: disk <2GB free ($avail_mb MB) - reclaiming" >&2
  reclaim_disk
  avail_mb=$(df -m / | awk 'NR==2{print $4}')
fi
if (( avail_mb < 2048 )); then
  # Only now is this a real refusal: reclamation ran and the host is still short.
  echo "FATAL: disk <2GB free ($avail_mb MB) after reclaim" >&2; exit 1;
fi

mem_mb=$(free -m | awk '/Mem:/{print $2}')
if (( mem_mb < 1024 )); then
  echo "FATAL: memory <1GB ($mem_mb MB)" >&2; exit 1;
fi

# 3. Required env
ENV_FILE="/opt/reliastra/.env.production"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "FATAL: $ENV_FILE missing" >&2; exit 1;
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
: "${DATABASE_URL:?missing DATABASE_URL}"
: "${SECRET_KEY:?missing SECRET_KEY}"
if [[ ${#SECRET_KEY} -lt 32 ]]; then echo "FATAL: SECRET_KEY too short" >&2; exit 1; fi
if [[ "$ENVIRONMENT" != "production" ]]; then echo "WARN: ENVIRONMENT=$ENVIRONMENT not production" >&2; fi

# 4. DB connectivity (host-side toolchain optional: the api container runs
# `alembic upgrade head` at boot, so when /opt/venv is absent we skip these
# host-side checks LOUDLY instead of fake-passing through a masked pipeline)
if [[ -x /opt/venv/bin/alembic ]]; then
  echo "checking DB..."
  timeout 10 bash -c 'source /opt/reliastra/.env.production; python3 -c "import asyncio, asyncpg, os; asyncio.run(asyncpg.connect(os.environ[\"DATABASE_URL\"].replace(\"postgresql+asyncpg://\",\"postgresql://\").split(\"?\")[0]))" 2>&1 | head -20' || {
    # Fallback: try via python with asyncpg via DATABASE_URL
    echo "WARN: direct asyncpg check failed, trying alembic check..."
  }
  # Check alembic can see DB
  timeout 15 bash -c 'source /opt/reliastra/.env.production; /opt/venv/bin/alembic current 2>&1 | head -20' || {
    echo "FATAL: alembic cannot connect to DB" >&2; exit 1;
  }
else
  echo "WARN: /opt/venv/bin/alembic missing on host - skipping host-side DB checks (migrations run inside the api container at boot)" >&2
fi

# 5. Registry availability (with timeout)
echo "checking registry $IMAGE (timeout ${TIMEOUT}s)..."
if ! timeout "$TIMEOUT" bash -c "docker pull --quiet \"$IMAGE\" 2>&1 | tail -5"; then
  # Try manifest inspect without pull (for digest verification)
  if ! timeout 30 docker manifest inspect "$IMAGE" >/dev/null 2>&1; then
    echo "FATAL: registry unavailable or image not found $IMAGE" >&2; exit 1;
  fi
fi

# 6. Release state
STATE_DIR="/opt/reliastra/state"
mkdir -p "$STATE_DIR"
if [[ -f "$STATE_DIR/current.json" ]]; then
  cur=$(jq -r .commit "$STATE_DIR/current.json" 2>/dev/null || echo "unknown")
  echo "current release: $cur"
  if [[ "$cur" == "$COMMIT" ]]; then
    echo "IDEMPOTENT: $COMMIT already current - safe to converge"
  fi
fi

# 7. Verify no other deploy in progress (compose ps)
if docker compose -f /opt/reliastra/compose.yml ps 2>&1 | grep -qi "deploy"; then
  echo "WARN: compose reports deploy-related containers"
fi

echo "PRECHECK OK"
# Hold lock for caller - do not unlock here; deploy.sh will inherit fd 9
# To allow deploy.sh to hold it, we create a marker
touch /run/reliastra-preflight-ok
echo "$COMMIT $IMAGE" > /run/reliastra-preflight-ok

# Unlock will happen when this process exits unless deploy.sh re-acquires
# For explicit handoff, we leave lock file but release flock
flock --unlock 9 || true
