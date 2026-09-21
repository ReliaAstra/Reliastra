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

# 3b. The public documentation namespace renders - THROUGH THE PROXY.
#
# Checking `/` alone is not enough, and that gap is how this shipped once: the
# proxy handed `/docs*` to FastAPI, which mounts its consoles at `/api-docs`
# and so has no `/docs` route. All thirteen documentation pages - and every
# "Docs" link in the nav - answered 404 {"code":"RESOURCE_NOT_FOUND"} while
# the landing page, the console and the API stayed green, so a smoke test that
# only requested `/` passed.
#
# So assert both halves: the status code, and that the body is the rendered
# page rather than the API's error envelope. A 200 from the wrong upstream
# would pass a status-only check.
for docs_path in /docs /docs/quickstart; do
  docs_body=$(curl -sS --max-time 10 -w '\n%{http_code}' "http://127.0.0.1:80${docs_path}" || echo "000")
  docs_code=$(printf '%s' "$docs_body" | tail -n1)
  docs_html=$(printf '%s' "$docs_body" | head -n -1)

  if [[ "$docs_code" != "200" ]]; then
    echo "smoke FAIL: ${docs_path} returned ${docs_code} via the proxy" >&2
    exit 1
  fi
  if printf '%s' "$docs_html" | grep -q 'RESOURCE_NOT_FOUND'; then
    echo "smoke FAIL: ${docs_path} was served by the API, not Next.js (RESOURCE_NOT_FOUND in body)" >&2
    echo "  -> /docs* must be claimed for reliastra-api:3000 in Caddyfile" >&2
    exit 1
  fi
  if ! printf '%s' "$docs_html" | grep -qi '<html'; then
    echo "smoke FAIL: ${docs_path} returned 200 but no HTML document" >&2
    exit 1
  fi
done
echo "smoke: documentation namespace OK (/docs, /docs/quickstart)"

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
