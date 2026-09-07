#!/usr/bin/env bash
# smoke-test.sh - minimal production smoke, no dummy data
# Usage: ./smoke-test.sh --timeout 60
#
# NOTE: the api container publishes NO host ports by design (only the proxy
# binds 80/443), so backend probes must run INSIDE the container network
# namespace via `docker exec`. Host-local curl to :8000 always fails.
set -euo pipefail

TIMEOUT=60
while [[ $# -gt 0 ]]; do
  case "$1" in
    --timeout) TIMEOUT="$2"; shift 2;;
    *) shift;;
  esac
done

echo "smoke timeout=${TIMEOUT}s"

API_EXEC=(docker exec reliastra-api curl)

# 1. OpenAPI reachable and valid JSON
if ! timeout "$TIMEOUT" bash -c 'docker exec reliastra-api curl -fsS --max-time 10 http://127.0.0.1:8000/openapi.json | python3 -m json.tool >/dev/null'; then
  echo "smoke FAIL: openapi.json unreachable or invalid" >&2
  exit 1
fi
echo "smoke: openapi OK"

# 2. Public vendor list (no auth) - must 200 (canonical public route)
code=$("${API_EXEC[@]}" -s -o /dev/null -w "%{http_code}" --max-time 10 "http://127.0.0.1:8000/v1/vendors?limit=1" || echo "000")
if [[ "$code" != "200" ]]; then
  echo "smoke FAIL: /v1/vendors $code (public catalog unreachable)" >&2
  exit 1
fi
echo "smoke: public vendors OK"

# 3. Frontend renders (200) via the proxy (only host-port listener)
if ! curl -fsS --max-time 10 http://127.0.0.1:80 >/dev/null; then
  echo "smoke FAIL: frontend not reachable" >&2
  exit 1
fi
echo "smoke: frontend OK"

# 4. Auth shape - login with bad creds should 401, not 500
code=$("${API_EXEC[@]}" -s -o /dev/null -w "%{http_code}" --max-time 10 -X POST -H "Content-Type: application/json" -d '{"email":"smoke@example.com","password":"wrong"}' http://127.0.0.1:8000/v1/auth/login || echo "000")
if [[ "$code" != "401" && "$code" != "422" && "$code" != "403" ]]; then
  echo "smoke FAIL: /v1/auth/login expected 401/422 got $code" >&2
  exit 1
fi
echo "smoke: auth shape OK ($code)"

# 5. Health must stay ready after smoke
ready=$("${API_EXEC[@]}" -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:8000/health/ready || echo "000")
if [[ "$ready" != "200" ]]; then
  echo "smoke FAIL: /health/ready $ready after smoke" >&2
  exit 1
fi

echo "SMOKE SUCCESS"
exit 0
