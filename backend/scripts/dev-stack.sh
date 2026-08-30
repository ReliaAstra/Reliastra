#!/usr/bin/env bash
# RELIASTRA local stack for the checkout journey — no Docker, no external SaaS.
#
# Boots everything the customer flow needs so billing can be exercised for real
# rather than mocked inside the browser:
#
#   postgres      embedded (pgserver), migrated to head
#   api           uvicorn on :8000
#   paystack      audit/mock_paystack.py on :9200  (records what we ask to charge)
#   mail          audit/mock_mail_sink.py  SMTP :2525 / HTTP inbox :8025
#
# The frontend runs separately (`npm run dev` on :3000) and proxies /api/v1 to
# :8000, so the browser, the API and the "provider" are all reached the way a
# customer reaches them.
#
# Usage:
#   backend/scripts/dev-stack.sh start     # background, logs under .dev-stack/
#   backend/scripts/dev-stack.sh stop
#   backend/scripts/dev-stack.sh status
#
# Env overrides: API_PORT PAYSTACK_PORT MAIL_HTTP_PORT MAIL_SMTP_PORT FRONTEND_URL
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="${VENV:-$BACKEND_DIR/.venv/bin}"
STATE_DIR="$BACKEND_DIR/.dev-stack"
API_PORT="${API_PORT:-8000}"
PAYSTACK_PORT="${PAYSTACK_PORT:-9200}"
MAIL_HTTP_PORT="${MAIL_HTTP_PORT:-8025}"
MAIL_SMTP_PORT="${MAIL_SMTP_PORT:-2525}"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:3000}"
PY="$VENV/python"
[ -x "$PY" ] || PY="$(command -v python3)"

mkdir -p "$STATE_DIR"

start_postgres() {
  # The cluster outlives this helper (cleanup_mode=None), and pgserver would
  # block trying to re-adopt one that is already running — so a live cluster is
  # recognised from its postmaster.pid and the saved URI is reused. Helper
  # stdout is redirected because a daemon holding the caller's pipe would keep
  # `start` from ever returning.
  "$PY" - "$STATE_DIR" > "$STATE_DIR/postgres.out" 2>&1 <<PYEOF
import os, sys
import pgserver

state = sys.argv[1]
pgdata = os.path.join(state, "pgdata")
uri_file = os.path.join(state, "postgres.uri")
pidfile = os.path.join(pgdata, "postmaster.pid")


def cluster_alive() -> bool:
    """Live cluster = its postmaster process exists *and* its socket is bound.

    The pid alone is not enough: pids get recycled, and a crash or a container
    restart leaves postmaster.pid behind with a socket that no longer answers.
    Trusting the pid file would have us reuse a dead database and fail later,
    with a confusing error, inside the first request that touched it.
    """
    try:
        lines = open(pidfile).read().splitlines()
        pid, port = int(lines[0]), lines[3].strip()
        os.kill(pid, 0)
    except (OSError, ValueError, IndexError):
        return False
    return os.path.exists(uri_file) and os.path.exists(f"{pgdata}/.s.PGSQL.{port}")


if not cluster_alive():
    os.makedirs(pgdata, exist_ok=True)
    # Postgres refuses to open a data directory the group can read, and refuses
    # to start on a leftover lock; both are the shape of an unclean shutdown.
    os.chmod(pgdata, 0o700)
    # setsid-style detachment: the cluster must not stay attached to whoever asked
# for it, or a terminal would wait on a daemon it already got an answer from.
os.setsid() if hasattr(os, "setsid") and os.getpid() != os.getpgid(0) else None
try:
    os.setsid()
except OSError:
    pass
srv = pgserver.get_server(pgdata=pgdata, cleanup_mode=None)
    open(uri_file, "w").write(
        srv.get_uri("postgres").replace("postgresql://", "postgresql+asyncpg://")
    )
PYEOF
  cat "$STATE_DIR/postgres.uri"
}

wait_for() { # url, name, seconds
  local url="$1" name="$2" limit="${3:-40}" i=0
  while [ "$i" -lt "$limit" ]; do
    if curl -s -o /dev/null --max-time 2 "$url"; then return 0; fi
    i=$((i+1)); sleep 0.5
  done
  echo "  ! $name did not answer on $url" >&2; return 1
}

start() {
  echo "▶ postgres"
  local DATABASE_URL
  if ! DATABASE_URL="$(start_postgres)" || [ -z "$DATABASE_URL" ]; then
    echo "  postgres did not come up; last lines of its log:" >&2
    tail -n 3 "$STATE_DIR/postgres.out" >&2 2>/dev/null || true
    tail -n 3 "$STATE_DIR/pgdata/log" >&2 2>/dev/null || true
    echo "  (remove $STATE_DIR/pgdata for a fresh cluster)" >&2
    return 1
  fi
  echo "  db ready"
  echo "▶ migrations"
  ( cd "$BACKEND_DIR" && DATABASE_URL="$DATABASE_URL" "$VENV/alembic" upgrade head >/dev/null )

  echo "▶ paystack stand-in :$PAYSTACK_PORT"
  ( cd "$BACKEND_DIR" && PORT="$PAYSTACK_PORT" FRONTEND_URL="$FRONTEND_URL" \
      PAYSTACK_CAPTURE="$STATE_DIR/paystack-init.jsonl" \
      FX_NGN_RATE=1650.00 \
      setsid nohup "$PY" audit/mock_paystack.py > "$STATE_DIR/paystack.log" 2>&1 < /dev/null & )
  wait_for "http://127.0.0.1:$PAYSTACK_PORT/fx/latest" "paystack"

  echo "▶ mail sink :$MAIL_SMTP_PORT (inbox :$MAIL_HTTP_PORT)"
  ( cd "$BACKEND_DIR" && SMTP_PORT="$MAIL_SMTP_PORT" HTTP_PORT="$MAIL_HTTP_PORT" \
      setsid nohup "$PY" audit/mock_mail_sink.py > "$STATE_DIR/mail.log" 2>&1 < /dev/null & )
  wait_for "http://127.0.0.1:$MAIL_HTTP_PORT/" "mail sink"

  echo "▶ api :$API_PORT"
  # Written once, sourced by both `start` and `api`, so a restart after a code
  # change cannot silently run with a different configuration than the stack.
  cat > "$STATE_DIR/api.env" <<ENV
export DATABASE_URL="$DATABASE_URL"
export ENVIRONMENT=development
export SECRET_KEY="local-dev-stack-secret-key-not-for-production-use"
export REDIS_URL=""
export CORS_ORIGINS='["http://localhost:3000","http://127.0.0.1:3000"]'
export NEXT_PUBLIC_SITE_URL="$FRONTEND_URL"
export RELIASTRA_PUBLIC_URL="$FRONTEND_URL"
export SMTP_HOST=127.0.0.1
export SMTP_PORT="$MAIL_SMTP_PORT"
export SMTP_FROM="noreply@reliastra.com"
export PAYSTACK_SECRET_KEY="sk_test_local_stack"
export PAYSTACK_PUBLIC_KEY="pk_test_local_stack"
export PAYSTACK_BASE_URL="http://127.0.0.1:$PAYSTACK_PORT"
export PAYSTACK_INLINE_JS_URL="http://127.0.0.1:$PAYSTACK_PORT/v1/inline.js"
export FX_REFERENCE_URL="http://127.0.0.1:$PAYSTACK_PORT/fx/latest"
export FX_REFERENCE_PROVIDER="ExchangeRate-API (local stub)"
export FX_REFERENCE_PROVIDER_URL="https://open.er-api.com"
export RUN_IN_PROCESS_SCHEDULER=false
ENV

  # Test-mode Paystack keys: the mock speaks the real API contract, so the
  # product code paths (initialize → hand off → verify) run unchanged.
  ( cd "$BACKEND_DIR" && \
      set -a && . "$STATE_DIR/api.env" && set +a
      setsid nohup "$VENV/uvicorn" app.main:app --host 0.0.0.0 --port "$API_PORT" \
        > "$STATE_DIR/api.log" 2>&1 < /dev/null & )
  wait_for "http://127.0.0.1:$API_PORT/health" "api" || true

  cat <<EOF

Stack is up.
  API        http://127.0.0.1:$API_PORT
  Paystack   http://127.0.0.1:$PAYSTACK_PORT   (capture: $STATE_DIR/paystack-init.jsonl)
  Mailbox    http://127.0.0.1:$MAIL_HTTP_PORT
  Frontend   cd frontend && npm run dev       (expects :3000)

Logs: $STATE_DIR/*.log
EOF
}

stop() {
  pkill -f "uvicorn app.main:app --host 0.0.0.0 --port $API_PORT" 2>/dev/null || true
  pkill -f "audit/mock_paystack.py" 2>/dev/null || true
  pkill -f "audit/mock_mail_sink.py" 2>/dev/null || true
  echo "stopped (postgres left running; remove $STATE_DIR to reset data)"
}

status() {
  for probe in "api|http://127.0.0.1:$API_PORT/health" \
               "paystack|http://127.0.0.1:$PAYSTACK_PORT/fx/latest" \
               "mail|http://127.0.0.1:$MAIL_HTTP_PORT/"; do
    name="${probe%%|*}"; url="${probe#*|}"
    if curl -s -o /dev/null --max-time 2 "$url"; then echo "  ✓ $name"; else echo "  ✗ $name ($url)"; fi
  done
  curl -s http://127.0.0.1:$PAYSTACK_PORT/capture 2>/dev/null | head -c 200
}

start_api() {
  pkill -f "uvicorn app.main:app --host 0.0.0.0 --port $API_PORT" 2>/dev/null || true
  sleep 0.5
  echo "▶ api :$API_PORT"
  ( cd "$BACKEND_DIR" && set -a && . "$STATE_DIR/api.env" && set +a
    setsid nohup "$VENV/uvicorn" app.main:app --host 0.0.0.0 --port "$API_PORT" \
      >> "$STATE_DIR/api.log" 2>&1 < /dev/null & )
  wait_for "http://127.0.0.1:$API_PORT/health" "api" || true
}

case "${1:-start}" in
  start) start ;;
  api) start_api ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  *) echo "usage: $0 {start|stop|restart|api|status}" >&2; exit 2 ;;
esac
