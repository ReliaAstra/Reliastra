#!/usr/bin/env bash
# healthcheck.sh — liveness vs readiness
# Usage: ./healthcheck.sh --timeout 120
set -euo pipefail

TIMEOUT=120
while [[ $# -gt 0 ]]; do
  case "$1" in
    --timeout) TIMEOUT="$2"; shift 2;;
    *) shift;;
  esac
done

echo "healthcheck timeout=${TIMEOUT}s"

# Wait for api container healthy
deadline=$(( $(date +%s) + TIMEOUT ))
while (( $(date +%s) < deadline )); do
  # Docker health (if defined)
  api_health=$(docker inspect --format='{{.State.Health.Status}}' reliastra-api 2>/dev/null || echo "unknown")
  # Direct liveness
  if curl -fsS --max-time 5 http://127.0.0.1:8000/health/live >/dev/null 2>&1; then
    live="ok"
  else
    live="fail"
  fi
  # Readiness (DB+Redis)
  ready_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:8000/health/ready || echo "000")
  # Also check /health (back-compat)
  health_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:8000/health || echo "000")
  # Check proxy -> frontend
  proxy_ok="fail"
  if curl -fsS --max-time 5 http://127.0.0.1:3000 >/dev/null 2>&1; then
    proxy_ok="ok"
  elif curl -fsS --max-time 5 http://127.0.0.1:80 >/dev/null 2>&1; then
    proxy_ok="ok"
  fi

  echo "health: docker=$api_health live=$live ready=$ready_code health=$health_code proxy=$proxy_ok"

  if [[ "$live" == "ok" && "$ready_code" == "200" && "$proxy_ok" == "ok" ]]; then
    echo "HEALTH READY"
    exit 0
  fi
  if [[ "$api_health" == "unhealthy" ]]; then
    echo "container unhealthy"
    docker logs --tail 50 reliastra-api 2>&1 | tail -20
  fi
  sleep 5
done

echo "HEALTH TIMEOUT after ${TIMEOUT}s" >&2
docker ps -a 2>&1 | head -20
docker logs --tail 100 reliastra-api 2>&1 | tail -50
docker logs --tail 50 reliastra-redis 2>&1 | tail -20
exit 1
