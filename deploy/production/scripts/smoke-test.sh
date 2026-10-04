#!/usr/bin/env bash
# smoke-test.sh - minimal production smoke, no dummy data
# Usage: ./smoke-test.sh --timeout 60
#
# NOTE: the api container publishes NO host ports by design (only the proxy
# binds 80/443), so backend probes must run INSIDE the container network
# namespace via `docker exec`. Host-local curl to :8000 always fails.
#
# ── Why every probe below retries ────────────────────────────────────────────
# This script runs immediately after healthcheck.sh reports ready. Readiness
# proves DB and Redis answer; it does not prove the heavier read paths answer.
# `/v1/vendors` is one of those: it joins the catalog against the observation
# table, and on a cold container that first query can fail while readiness is
# already green. The original script took one shot per probe, so a cold-start
# race was indistinguishable from a real regression - and because rollback
# re-runs this same script, the rollback then "failed" too, reporting
# ROLLBACK_FAILED for a deployment that may have been perfectly healthy.
#
# So: bounded retry with backoff, and every probe distinguishes three outcomes
# rather than two:
#
#   ok            - assertion satisfied
#   not-ready     - transient (5xx, connection refused, timeout). Retried.
#   broken        - a definite contract failure (404, wrong auth shape, a
#                   response body served by the wrong upstream). Fails at once,
#                   because retrying a wrong answer only delays the rollback.
#
# A probe that never leaves "not-ready" is reported as a readiness failure with
# the last observed status, the response body and the API log tail, so the
# cause is diagnosable from the workflow log without SSH access to the host.
set -euo pipefail

TIMEOUT=60
# Attempts per probe. Each attempt costs at most ~10s of curl time, so three
# attempts plus backoff fit inside the 60s budget the deploy wrapper allows.
ATTEMPTS=3
BACKOFF_SECONDS=3

while [[ $# -gt 0 ]]; do
  case "$1" in
    --timeout) TIMEOUT="$2"; shift 2;;
    --attempts) ATTEMPTS="$2"; shift 2;;
    *) shift;;
  esac
done

echo "smoke timeout=${TIMEOUT}s attempts=${ATTEMPTS}"

API_EXEC=(docker exec reliastra-api curl)

# Last observed response body, kept so a failure can print it. Discarding the
# body is why the previous failure produced no diagnosis: `-o /dev/null` threw
# away the only evidence the API was willing to give.
LAST_BODY=""
LAST_CODE=""

# Fetch a probe inside the container. Echoes "<code>\n<body>".
# Never fails the script: transport errors become code 000.
# Extra curl arguments may follow the URL (method, headers, body).
fetch() {
  local url="$1"; shift
  local out
  set +e
  out=$("${API_EXEC[@]}" -s --max-time 10 -w $'\n%{http_code}' "$@" "$url" 2>/dev/null)
  set -e
  LAST_CODE=$(printf '%s' "$out" | tail -n1)
  LAST_BODY=$(printf '%s' "$out" | sed '$d')
  [[ "$LAST_CODE" =~ ^[0-9]{3}$ ]] || LAST_CODE="000"
}

# True when a status code may still succeed on a later attempt: server-side or
# transport-level, i.e. "not ready yet". 4xx is never retried - a 404 or a 403
# is a stable answer.
is_transient() {
  local code="$1"
  [[ "$code" == "000" ]] && return 0
  [[ "$code" =~ ^5[0-9]{2}$ ]] && return 0
  return 1
}

# Retry a probe until it yields a non-transient code.
# Usage: await_status <url> <label> [extra curl args...]
await_status() {
  local url="$1" label="$2"; shift 2
  local attempt=1
  while (( attempt <= ATTEMPTS )); do
    fetch "$url" "$@"
    if ! is_transient "$LAST_CODE"; then
      printf '  %s: %s\n' "$label" "$LAST_CODE"
      return 0
    fi
    echo "  ${label}: ${LAST_CODE} (not ready, attempt ${attempt}/${ATTEMPTS})"
    (( attempt < ATTEMPTS )) && sleep "$BACKOFF_SECONDS"
    attempt=$(( attempt + 1 ))
  done
  return 1
}

# Report why a probe never settled, with enough evidence to act on.
diagnose() {
  local label="$1"
  echo "smoke FAIL: ${label} last status ${LAST_CODE} after ${ATTEMPTS} attempts" >&2
  if [[ -n "$LAST_BODY" ]]; then
    echo "--- response body ---" >&2
    printf '%s\n' "$LAST_BODY" | head -c 2000 >&2
    echo >&2
  fi
  echo "--- reliastra-api log tail ---" >&2
  docker logs --tail 60 reliastra-api 2>&1 | tail -30 >&2 || true
}

# 1. The API is serving, and the schema is NOT reachable.
#
# This replaced a probe that asserted /openapi.json parsed as JSON. That route
# no longer exists: EXPOSE_API_SCHEMA defaults to False in
# backend/app/config.py, so FastAPI registers no schema route, and the Caddyfile
# refuses the path at the edge. Probing for it would have turned a deliberate
# hardening decision into a deploy failure.
#
# Two assertions, in the file's own idiom:
#   1a. /health is 200, so the ASGI app is up and routing.
#   1b. /openapi.json is 404, so the schema has not reopened. This is a guard,
#       not a probe: if someone sets EXPOSE_API_SCHEMA=true in
#       .env.production, the deploy must fail rather than ship the regression.
if ! await_status "http://127.0.0.1:8000/health" "api health"; then
  diagnose "/health (API not serving)"
  exit 1
fi
if [[ "$LAST_CODE" != "200" ]]; then
  echo "smoke FAIL: /health expected 200 got ${LAST_CODE}" >&2
  exit 1
fi
echo "smoke: API serving OK"

# 404 is a stable answer, so await_status returns on the first attempt.
if ! await_status "http://127.0.0.1:8000/openapi.json" "schema must stay closed"; then
  diagnose "/openapi.json unreachable (expected a stable 404)"
  exit 1
fi
if [[ "$LAST_CODE" != "404" ]]; then
  echo "smoke FAIL: /openapi.json returned ${LAST_CODE}, expected 404." >&2
  echo "  The API schema is exposed and enumerates every authenticated route." >&2
  echo "  Unset EXPOSE_API_SCHEMA in .env.production and confirm the Caddyfile" >&2
  echo "  still refuses /openapi.json*, /api-docs* and /api-redoc*." >&2
  exit 1
fi
echo "smoke: schema correctly closed"

# 2. Public vendor list (no auth) - the canonical public route.
if ! await_status "http://127.0.0.1:8000/v1/vendors?limit=1" "public vendors"; then
  diagnose "/v1/vendors (public catalog unreachable)"
  exit 1
fi
if [[ "$LAST_CODE" != "200" ]]; then
  # Reached a stable non-200. The public catalog is unauthenticated, so any
  # 4xx here is a routing or authorisation regression, not a race.
  echo "smoke FAIL: /v1/vendors expected 200 got ${LAST_CODE}" >&2
  printf '%s\n' "$LAST_BODY" | head -c 2000 >&2 || true
  echo >&2
  exit 1
fi
echo "smoke: public vendors OK"

# 3. Frontend renders (200) via the proxy (only host-port listener).
if ! curl -fsS --max-time 10 http://127.0.0.1:80 >/dev/null; then
  echo "smoke FAIL: frontend not reachable" >&2
  exit 1
fi
echo "smoke: frontend OK"

# 3b. The public documentation namespace renders - THROUGH THE PROXY.
#
# Checking `/` alone is not enough, and that gap is how this shipped once: the
# proxy handed `/docs*` to FastAPI, whose console routes live at `/api-docs`
# (and are now opt-in anyway), so it has no `/docs` route. All thirteen
# documentation pages - and every "Docs" link in the nav - answered
# 404 {"code":"RESOURCE_NOT_FOUND"} while the landing page, the console and the
# API stayed green, so a smoke test that only requested `/` passed.
#
# So assert both halves: the status code, and that the body is the rendered
# page rather than the API's error envelope. A 200 from the wrong upstream
# would pass a status-only check.
for docs_path in /docs /docs/quickstart; do
  docs_body=$(curl -skL --resolve reliastra.com:443:127.0.0.1 --max-time 10 -w '\n%{http_code}' "https://reliastra.com${docs_path}" || echo "000")
  docs_code=$(printf '%s' "$docs_body" | tail -n1)
  docs_html=$(printf '%s' "$docs_body" | head -n -1)

  if [[ "$docs_code" != "200" ]]; then
    echo "smoke FAIL: ${docs_path} returned ${docs_code} via the proxy" >&2
    exit 1
  fi
  if grep -q 'RESOURCE_NOT_FOUND' <<< "$docs_html"; then
    echo "smoke FAIL: ${docs_path} was served by the API, not Next.js (RESOURCE_NOT_FOUND in body)" >&2
    echo "  -> /docs* must be claimed for reliastra-api:3000 in Caddyfile" >&2
    exit 1
  fi
  if ! grep -qi '<html' <<< "$docs_html"; then
    echo "smoke FAIL: ${docs_path} returned 200 but no HTML document" >&2
    exit 1
  fi
done
echo "smoke: documentation namespace OK (/docs, /docs/quickstart)"

# 4. Auth shape - login with bad credentials must be rejected, never served.
# The original accepted 401, 422 or 403. Any of those is a refusal, so the
# assertion is "refused", and a 500 or 200 is the regression.
if ! await_status "http://127.0.0.1:8000/v1/auth/login" "auth login" \
      -X POST -H "Content-Type: application/json" \
      -d '{"email":"smoke@example.com","password":"wrong"}'; then
  diagnose "/v1/auth/login never answered"
  exit 1
fi
case "$LAST_CODE" in
  401|403|422)
    echo "smoke: auth shape OK (${LAST_CODE})"
    ;;
  200)
    echo "smoke FAIL: /v1/auth/login accepted invalid credentials (200)" >&2
    exit 1
    ;;
  *)
    echo "smoke FAIL: /v1/auth/login expected 401/403/422 got ${LAST_CODE}" >&2
    printf '%s\n' "$LAST_BODY" | head -c 2000 >&2 || true
    echo >&2
    exit 1
    ;;
esac

# 5. Health must stay ready after the smoke load.
if ! await_status "http://127.0.0.1:8000/health/ready" "ready"; then
  diagnose "/health/ready never answered"
  exit 1
fi
if [[ "$LAST_CODE" != "200" ]]; then
  echo "smoke FAIL: /health/ready ${LAST_CODE} after smoke" >&2
  exit 1
fi

echo "SMOKE SUCCESS"
exit 0