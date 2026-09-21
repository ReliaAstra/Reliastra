#!/usr/bin/env bash
# update.sh - manual production update over Tailscale SSH.
#
# Usage (laptop, Tailscale on):
#   ssh reliastra@100.93.175.33
#   sudo /opt/reliastra/scripts/update.sh [--ref origin/main]
#
# What it does:
#   1. git fetch + reset --hard to the ref in the build tree
#      (/home/reliastra/reliastra). Local diffs there are DISCARDED by
#      design; /opt config (.env.production, compose.yml, Caddyfile) is
#      never overwritten by this script.
#   1b. Diffs the live /opt/reliastra/Caddyfile against the repository copy
#      and REFUSES to deploy when they differ, because the proxy bind-mounts
#      the /opt file and nothing else would ever notice the divergence.
#      Override with --allow-config-drift, then land the host change.
#   2. Rebuilds the all-in-one image tagged :local (warm cache: ~2 min).
#      Alembic migrations run automatically inside the new container.
#   3. Recreates the api container only (proxy+redis stay up). Expect ~60s
#      of 502s while the new container boots and passes healthchecks.
#   4. Runs healthcheck.sh + smoke-test.sh; exits non-zero on failure.
#      On failure, roll back with:
#        sudo /opt/reliastra/scripts/rollback.sh --reason manual
#      (rollback needs a recorded previous release from deploy.sh; without
#      one, redeploy the previous image by re-running this script at the
#      previous ref: sudo update.sh --ref <sha>.)
#
# BEFORE running: confirm the CI *build* job is green on the ref. If the
# image does not build in CI, it will not build here either.
set -euo pipefail

REF="origin/main"
ALLOW_CONFIG_DRIFT=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) REF="$2"; shift 2;;
    # Escape hatch for the proxy-config gate in step 1b. Use it only when the
    # host copy is intentionally ahead of the repository, and land the change
    # in the repo afterwards - an unlanded Caddyfile is how the /docs outage
    # happened.
    --allow-config-drift) ALLOW_CONFIG_DRIFT=1; shift;;
    *) echo "unknown arg $1 (usage: $0 [--ref origin/main|<sha>] [--allow-config-drift])" >&2; exit 2;;
  esac
done

REPO=/home/reliastra/reliastra
COMPOSE_FILE=/opt/reliastra/compose.yml
STATE_DIR=/opt/reliastra/state

# One deploy at a time.
exec 9>/run/reliastra-deploy.lock
if ! flock -n 9; then
  echo "FATAL: another deploy holds /run/reliastra-deploy.lock" >&2
  exit 1
fi

echo "=== 1/4 sync tree to $REF ==="
cd "$REPO"
# Self-heal: past root-run git ops leave root-owned objects behind.
chown -R reliastra:reliastra "$REPO"
sudo -u reliastra git fetch origin main
sudo -u reliastra git reset --hard "$REF"
COMMIT=$(git rev-parse HEAD)
echo "tree at $COMMIT"

# ── 1b. The proxy's config is NOT part of the tree sync ────────────────────
#
# The proxy bind-mounts /opt/reliastra/Caddyfile (see the `./Caddyfile` mount
# in compose.yml), and this script deliberately never overwrites /opt. That is
# correct for secrets, but it means the edge routing table can drift from the
# repository forever without any deploy noticing - which is precisely how the
# whole public documentation namespace went missing: the host Caddyfile still
# proxied /docs* to FastAPI, an older arrangement the repo had long since
# dropped, so /docs and all twelve guides answered 404 RESOURCE_NOT_FOUND while
# everything else stayed green.
#
# So the drift is reported here, at the top of the deploy, instead of being
# discovered by a reader. Recreate the proxy container after reconciling:
#   docker compose -f /opt/reliastra/compose.yml up -d --force-recreate proxy
echo "=== 1b/4 check proxy config drift ==="
LIVE_CADDYFILE=/opt/reliastra/Caddyfile
REPO_CADDYFILE="$REPO/deploy/production/Caddyfile"
if [[ ! -f "$LIVE_CADDYFILE" ]]; then
  echo "FATAL: $LIVE_CADDYFILE missing - the proxy has no config to mount" >&2
  exit 1
elif ! diff -u "$REPO_CADDYFILE" "$LIVE_CADDYFILE" > /tmp/caddyfile-drift.diff; then
  echo "PROXY CONFIG DRIFT: the live Caddyfile differs from $REF:" >&2
  cat /tmp/caddyfile-drift.diff >&2
  if [[ "$ALLOW_CONFIG_DRIFT" -ne 1 ]]; then
    echo >&2
    echo "FATAL: refusing to deploy over a proxy config the repository does not" >&2
    echo "describe. Reconcile /opt/reliastra/Caddyfile with" >&2
    echo "deploy/production/Caddyfile and recreate the proxy, or re-run with" >&2
    echo "--allow-config-drift and land the host change in the repo." >&2
    exit 1
  fi
  echo "WARNING: proceeding because --allow-config-drift was given" >&2
else
  echo "proxy config matches $REF"
fi

echo "=== 2/4 build image ==="
docker build --network host -t ghcr.io/reliastra/reliastra:local -f Dockerfile .
IMAGE_ID=$(docker inspect --format='{{.Id}}' ghcr.io/reliastra/reliastra:local)
echo "built $IMAGE_ID"

echo "=== 3/4 redeploy api ==="
mkdir -p "$STATE_DIR"
{
  echo "IMAGE_REF=ghcr.io/reliastra/reliastra:local"
  echo "IMAGE_DIGEST=$IMAGE_ID"
} > "$STATE_DIR/image.env"
cd /opt/reliastra
set -a
# shellcheck disable=SC1091
source "$STATE_DIR/image.env"
# shellcheck disable=SC1091
source /opt/reliastra/.env.production
set +a
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

echo "=== 4/4 verify ==="
/opt/reliastra/scripts/healthcheck.sh --timeout 180
/opt/reliastra/scripts/smoke-test.sh --timeout 60
echo "UPDATE SUCCESS $COMMIT $IMAGE_ID"
