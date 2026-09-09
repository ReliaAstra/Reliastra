#!/usr/bin/env bash
# update.sh — manual production update over Tailscale SSH.
#
# Usage (laptop, Tailscale on):
#   ssh reliastra@100.93.175.33
#   sudo /opt/reliastra/scripts/update.sh [--ref origin/main]
#
# What it does:
#   1. git fetch + reset --hard to the ref in the build tree
#      (/home/reliastra/reliastra). Local diffs there are DISCARDED by
#      design; /opt config (.env.production, compose.yml, Caddyfile) is
#      never touched.
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
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) REF="$2"; shift 2;;
    *) echo "unknown arg $1 (usage: $0 [--ref origin/main|<sha>])" >&2; exit 2;;
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
chown -R reliastra:reliastra "$REPO/.git"
sudo -u reliastra git fetch origin main
sudo -u reliastra git reset --hard "$REF"
COMMIT=$(git rev-parse HEAD)
echo "tree at $COMMIT"

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
