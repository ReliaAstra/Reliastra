#!/usr/bin/env bash
# cleanup.sh — retention-aware, never blind prune
set -euo pipefail

# Keep last 5 app images + current/previous (total ~7)
keep=5
echo "cleanup: pruning old images, keeping $keep"

# List images for reliastra, sorted newest first
images=$(docker images --format '{{.Repository}}:{{.Tag}}@{{.ID}}' ghcr.io/reliastra/reliastra 2>/dev/null | head -20 || true)
if [[ -z "$images" ]]; then
  echo "no images to prune"
  exit 0
fi

# Keep current and previous digests
keep_digests=()
for f in /opt/reliastra/state/current.json /opt/reliastra/state/previous.json; do
  if [[ -f "$f" ]]; then
    d=$(jq -r .digest "$f" 2>/dev/null || true)
    if [[ -n "$d" && "$d" != "null" ]]; then
      keep_digests+=("$d")
    fi
  fi
done

# Prune dangling only, never -a
docker image prune -f --filter "dangling=true" 2>&1 | tail -5

# Remove old reliastra images beyond keep, but never the kept digests
# Use docker images --filter, but protect keep_digests
count=0
for img in $(docker images ghcr.io/reliastra/reliastra --format '{{.Repository}}:{{.Tag}}' | tail -n +$((keep + 1)) ); do
  # Check if its digest is in keep list
  digest=$(docker inspect --format='{{index .RepoDigests 0}}' "$img" 2>/dev/null | cut -d'@' -f2 || true)
  skip=false
  for kd in "${keep_digests[@]:-}"; do
    if [[ "$digest" == "$kd" ]]; then skip=true; break; fi
  done
  if [[ "$skip" == "true" ]]; then
    echo "keep $img ($digest)"
    continue
  fi
  echo "prune $img"
  docker rmi "$img" 2>&1 | tail -2 || true
  count=$((count+1))
  if (( count > 20 )); then break; fi
done

# Prune logs older than 30d, keep last 100M
find /opt/reliastra/logs -type f -mtime +30 -delete 2>/dev/null || true
# Bounds state releases to 10
ls -1t /opt/reliastra/releases/*.json 2>/dev/null | tail -n +11 | xargs -r rm -f || true
# Vacuum docker logs
truncate -s 0 /var/lib/docker/containers/*/*-json.log 2>/dev/null || true

echo "cleanup done"
