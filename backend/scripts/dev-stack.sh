#!/usr/bin/env bash
# RELIASTRA local stack — no Docker, no external SaaS.
#
# Boots everything the product needs to run for real rather than mocked inside
# the browser:
#
#   postgres      embedded (pgserver), migrated to head
#   redis         broker + result backend for Celery (and the app cache)
#   api           uvicorn on :8000
#   worker        celery worker — executes the probes
#   beat          celery beat — the ONE thing that schedules checks
#   paystack      audit/mock_paystack.py on :9200  (records what we ask to charge)
#   mail          audit/mock_mail_sink.py  SMTP :2525 / HTTP inbox :8025
#
# Why Redis/Celery are part of the *local* stack and not optional: check
# scheduling is provided exclusively by Celery Beat. A stack without them
# boots a perfectly healthy API that executes exactly zero checks, and the
# dashboard shows an empty history that looks identical to "every vendor is
# quietly fine". There is no in-process fallback.
#
# The frontend runs separately (`npm run dev` on :3000) and proxies /api/v1 to
# :8000, so the browser, the API and the "provider" are all reached the way a
# customer reaches them.
#
# Usage:
#   backend/scripts/dev-stack.sh start     # background, logs under .dev-stack/
#   backend/scripts/dev-stack.sh run       # foreground; kills everything on exit
#   backend/scripts/dev-stack.sh stop
#   backend/scripts/dev-stack.sh status
#
# Env overrides:
#   API_PORT PAYSTACK_PORT MAIL_HTTP_PORT MAIL_SMTP_PORT FRONTEND_URL
#   REDIS_PORT REDIS_URL REDIS_SERVER_BIN REDIS_CLI_BIN
#   CHECK_SCHEDULE_SECONDS CELERY_CONCURRENCY VENV
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="${VENV:-$BACKEND_DIR/.venv/bin}"
STATE_DIR="$BACKEND_DIR/.dev-stack"
API_PORT="${API_PORT:-8000}"
PAYSTACK_PORT="${PAYSTACK_PORT:-9200}"
MAIL_HTTP_PORT="${MAIL_HTTP_PORT:-8025}"
MAIL_SMTP_PORT="${MAIL_SMTP_PORT:-2525}"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:3000}"
REDIS_PORT="${REDIS_PORT:-6379}"
# Configurable: point at a shared/remote Redis instead of the local one.
REDIS_URL="${REDIS_URL:-redis://127.0.0.1:$REDIS_PORT/0}"
# Shorter than production's 30s so a local Beat cycle (and therefore the
# scheduler heartbeat this script waits on) is observable in seconds.
CHECK_SCHEDULE_SECONDS="${CHECK_SCHEDULE_SECONDS:-10}"
CELERY_CONCURRENCY="${CELERY_CONCURRENCY:-2}"

PY="$VENV/python"
[ -x "$PY" ] || PY="$(command -v python3)"
CELERY="$VENV/celery"
[ -x "$CELERY" ] || CELERY="$(command -v celery || true)"
ALEMBIC="$VENV/alembic"
[ -x "$ALEMBIC" ] || ALEMBIC="$(command -v alembic || true)"
UVICORN="$VENV/uvicorn"
[ -x "$UVICORN" ] || UVICORN="$(command -v uvicorn || true)"
REDIS_SERVER_BIN="${REDIS_SERVER_BIN:-$(command -v redis-server || true)}"
REDIS_CLI_BIN="${REDIS_CLI_BIN:-$(command -v redis-cli || true)}"

# Scheduler heartbeat key — written by the Beat task `schedule_checks`. Its
# presence is the proof that Beat is alive, which is why `start` waits on it.
HEARTBEAT_KEY="reliastra:checks:scheduler:last_heartbeat"

mkdir -p "$STATE_DIR"

die() { echo "  ✗ $*" >&2; exit 1; }

# ── process bookkeeping ─────────────────────────────────────────────────────
# Every daemon is started with setsid so it owns a process group; the group id
# is what gets killed. Killing the recorded pid alone leaves Celery's prefork
# children (and Redis) behind, which is how zombie workers survive a `stop`.
declare -a STARTED_GROUPS=()

_spawn() { # name, logfile, command...
  local name="$1" logfile="$2"; shift 2
  setsid nohup "$@" > "$logfile" 2>&1 < /dev/null &
  local pid=$!
  echo "$pid" > "$STATE_DIR/$name.pid"
  STARTED_GROUPS+=("$pid")
}

cleanup_children() {
  local pid
  for pid in "${STARTED_GROUPS[@]:-}"; do
    [ -n "$pid" ] || continue
    # Negative pid = the whole process group (worker prefork children included).
    kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  done
  # Give them a moment, then force. A SIGKILL'd prefork child can otherwise
  # linger holding the broker connection.
  sleep 1
  for pid in "${STARTED_GROUPS[@]:-}"; do
    [ -n "$pid" ] || continue
    kill -KILL -"$pid" 2>/dev/null || true
  done
}

# ── postgres ────────────────────────────────────────────────────────────────
start_postgres() {
  # The cluster outlives this helper (cleanup_mode=None), and pgserver would
  # block trying to re-adopt one that is already running — so a live cluster is
  # recognised from its postmaster.pid and the saved URI is reused. Helper
  # stdout is redirected because a daemon holding the caller's pipe would keep
  # `start` from ever returning.
  "$PY" - "$STATE_DIR" > "$STATE_DIR/postgres.out" 2>&1 <<'PYEOF'
import os
import sys

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
    # Detach from the caller's process group so the cluster is not tied to
    # whoever asked for it, and a terminal never waits on the daemon.
    try:
        os.setsid()
    except OSError:
        pass
    srv = pgserver.get_server(pgdata=pgdata, cleanup_mode=None)
    uri = srv.get_uri("postgres").replace("postgresql://", "postgresql+asyncpg://")
    with open(uri_file, "w") as handle:
        handle.write(uri)

print(open(uri_file).read().strip())
PYEOF
  cat "$STATE_DIR/postgres.uri"
}

# ── redis ───────────────────────────────────────────────────────────────────
redis_ping() { # -> 0 when Redis answers PONG
  if [ -n "$REDIS_CLI_BIN" ]; then
    [ "$("$REDIS_CLI_BIN" -u "$REDIS_URL" ping 2>/dev/null)" = "PONG" ] && return 0
    return 1
  fi
  # No redis-cli on PATH: fall back to the client library the app already uses.
  REDIS_URL="$REDIS_URL" "$PY" - <<'PYEOF' 2>/dev/null
import os, sys
import redis
try:
    r = redis.Redis.from_url(os.environ["REDIS_URL"], socket_connect_timeout=2, socket_timeout=2)
    sys.exit(0 if r.ping() else 1)
except Exception:
    sys.exit(1)
PYEOF
}

redis_llen() { # key -> depth
  REDIS_URL="$REDIS_URL" KEY="$1" "$PY" - <<'PYEOF' 2>/dev/null || echo "?"
import os
import redis
r = redis.Redis.from_url(os.environ["REDIS_URL"], socket_connect_timeout=2, socket_timeout=2)
print(r.llen(os.environ["KEY"]))
PYEOF
}

start_redis() {
  if redis_ping; then
    echo "  redis already reachable at $REDIS_URL (not starting a second one)"
    return 0
  fi
  if [ -z "$REDIS_SERVER_BIN" ]; then
    die "redis-server not found. Install it (apt-get install redis-server /
    brew install redis), or point REDIS_URL at a running Redis.
    Check scheduling needs a broker: without Redis the API boots fine and
    executes zero checks."
  fi
  echo "▶ redis :$REDIS_PORT"
  # No persistence in dev: RDB/AOF snapshots add fsync stalls and, more
  # importantly, a stale dump can resurrect revoked refresh tokens between
  # runs. Production compose keeps --appendonly yes.
  _spawn redis "$STATE_DIR/redis.log" \
    "$REDIS_SERVER_BIN" --port "$REDIS_PORT" --bind 127.0.0.1 \
    --save '' --appendonly no --protected-mode yes
  local i=0
  while [ "$i" -lt 40 ]; do
    if redis_ping; then echo "  redis ready"; return 0; fi
    i=$((i+1)); sleep 0.25
  done
  echo "  redis did not answer; last lines of its log:" >&2
  tail -n 5 "$STATE_DIR/redis.log" >&2 2>/dev/null || true
  return 1
}

# ── readiness helpers ───────────────────────────────────────────────────────
wait_for() { # url, name, seconds
  local url="$1" name="$2" limit="${3:-40}" i=0
  while [ "$i" -lt "$limit" ]; do
    if curl -s -o /dev/null --max-time 2 "$url"; then return 0; fi
    i=$((i+1)); sleep 0.5
  done
  echo "  ! $name did not answer on $url" >&2; return 1
}

wait_for_worker() { # seconds — celery inspect ping
  local limit="${1:-40}" i=0 out
  [ -n "$CELERY" ] || return 1
  while [ "$i" -lt "$limit" ]; do
    # Capture, then match. Piping `celery` straight into `grep -q` looks
    # equivalent but is not: grep exits the instant it matches, celery gets
    # SIGPIPE, and `set -o pipefail` then reports the healthy worker as a
    # failure. `|| true` keeps a not-yet-ready worker from tripping `set -e`.
    out="$( cd "$BACKEND_DIR" && REDIS_URL="$REDIS_URL" \
           "$CELERY" -A app.infrastructure.celery_app.celery_app inspect ping -t 3 \
           2>/dev/null || true )"
    case "$out" in
      *pong*) return 0 ;;
    esac
    i=$((i+1)); sleep 1
  done
  return 1
}

wait_for_beat() { # seconds — the scheduler heartbeat appearing in Redis
  local limit="${1:-40}" i=0
  while [ "$i" -lt "$limit" ]; do
    local value
    value="$(redis_get "$HEARTBEAT_KEY" || true)"
    [ -n "$value" ] && return 0
    i=$((i+1)); sleep 1
  done
  return 1
}

redis_get() { # key -> value
  REDIS_URL="$REDIS_URL" KEY="$1" "$PY" - <<'PYEOF' 2>/dev/null
import os
import redis
r = redis.Redis.from_url(os.environ["REDIS_URL"], decode_responses=True,
                         socket_connect_timeout=2, socket_timeout=2)
v = r.get(os.environ["KEY"])
print(v or "")
PYEOF
}

# ── shared env for API / worker / beat ──────────────────────────────────────
# Written once and sourced by all three so a restart after a code change cannot
# silently run one process with a different configuration than the others.
write_env() { # database_url
  cat > "$STATE_DIR/api.env" <<ENV
export DATABASE_URL="$1"
export ENVIRONMENT=development
export SECRET_KEY="local-dev-stack-secret-key-not-for-production-use"
export REDIS_URL="$REDIS_URL"
export CORS_ORIGINS='["http://localhost:3000","http://127.0.0.1:3000"]'
export NEXT_PUBLIC_SITE_URL="$FRONTEND_URL"
export RELIASTRA_PUBLIC_URL="$FRONTEND_URL"
export SMTP_HOST=127.0.0.1
export SMTP_PORT="$MAIL_SMTP_PORT"
export SMTP_FROM="noreply@reliastra.com"
export PAYSTACK_SECRET_KEY="sk_test_local_stack"
export PAYSTACK_PUBLIC_KEY="pk_test_local_stack"
export PAYSTACK_BASE_URL="http://127.0.0.1:$PAYSTACK_PORT"
export PAYSTACK_INLINE_JS_URL="http://127.0.0.1:$PAYSTACK_PORT/v2/inline.js"
export FX_REFERENCE_URL="http://127.0.0.1:$PAYSTACK_PORT/fx/latest"
export FX_REFERENCE_PROVIDER="ExchangeRate-API (local stub)"
export FX_REFERENCE_PROVIDER_URL="https://open.er-api.com"
export CHECK_SCHEDULE_SECONDS="$CHECK_SCHEDULE_SECONDS"
# Check metrics are incremented in the worker, not the API. Sharing one
# directory lets the API's existing /metrics endpoint serve the whole fleet
# (see app/core/metrics.py). Cleaned on start: stale files from a killed
# worker would otherwise be reported as live series forever.
export PROMETHEUS_MULTIPROC_DIR="$STATE_DIR/prometheus"
ENV
}

with_env() { # command... — run with the stack env loaded
  ( cd "$BACKEND_DIR" && set -a && . "$STATE_DIR/api.env" && set +a && "$@" )
}

# ── services ────────────────────────────────────────────────────────────────
start_api() {
  echo "▶ api :$API_PORT"
  _spawn api "$STATE_DIR/api.log" \
    env bash -c "cd '$BACKEND_DIR'; set -a; . '$STATE_DIR/api.env'; set +a; exec '$UVICORN' app.main:app --host 0.0.0.0 --port $API_PORT"
  wait_for "http://127.0.0.1:$API_PORT/health/live" "api" 60 || {
    echo "  api did not come up; last lines of its log:" >&2
    tail -n 15 "$STATE_DIR/api.log" >&2 2>/dev/null || true
    return 1
  }
}

start_worker() {
  [ -n "$CELERY" ] || die "celery not found on PATH or in $VENV — cannot start a worker.
  Check execution requires it (pip install -r requirements.txt)."
  echo "▶ celery worker (concurrency=$CELERY_CONCURRENCY)"
  _spawn worker "$STATE_DIR/worker.log" \
    env bash -c "cd '$BACKEND_DIR'; set -a; . '$STATE_DIR/api.env'; set +a; exec '$CELERY' -A app.infrastructure.celery_app.celery_app worker --loglevel=info --concurrency=$CELERY_CONCURRENCY --without-gossip"
  if ! wait_for_worker 45; then
    echo "  worker did not answer 'inspect ping'; last lines of its log:" >&2
    tail -n 15 "$STATE_DIR/worker.log" >&2 2>/dev/null || true
    return 1
  fi
  echo "  worker ready (inspect ping → pong)"
}

start_beat() {
  [ -n "$CELERY" ] || die "celery not found on PATH or in $VENV — cannot start beat.
  Beat is the only thing that schedules checks."
  echo "▶ celery beat (every ${CHECK_SCHEDULE_SECONDS}s)"
  _spawn beat "$STATE_DIR/beat.log" \
    env bash -c "cd '$BACKEND_DIR'; set -a; . '$STATE_DIR/api.env'; set +a; exec '$CELERY' -A app.infrastructure.celery_app.celery_app beat --loglevel=info"
  if ! wait_for_beat 60; then
    echo "  beat published no scheduler heartbeat within 60s; last lines of its log:" >&2
    tail -n 15 "$STATE_DIR/beat.log" >&2 2>/dev/null || true
    return 1
  fi
  echo "  beat ready (scheduler heartbeat present in Redis)"
}

print_summary() {
  local api_st="DOWN" pg_st="DOWN" redis_st="DOWN" worker_st="DOWN" beat_st="DOWN"
  curl -s -o /dev/null --max-time 3 "http://127.0.0.1:$API_PORT/health/live" && api_st="healthy"
  [ -s "$STATE_DIR/postgres.uri" ] && pg_st="healthy"
  redis_ping && redis_st="healthy"
  wait_for_worker 10 && worker_st="healthy"
  [ -n "$(redis_get "$HEARTBEAT_KEY" || true)" ] && beat_st="running"

  cat <<EOF

RELIASTRA development stack
API:      $api_st      http://127.0.0.1:$API_PORT
Postgres: $pg_st
Redis:    $redis_st    $REDIS_URL
Worker:   $worker_st
Beat:     $beat_st     every ${CHECK_SCHEDULE_SECONDS}s
Check scheduler: enabled (Celery Beat is the only scheduler)

Frontend  cd frontend && npm run dev       (expects :3000)
Pipeline  curl -s http://127.0.0.1:$API_PORT/health/checks
Queue     depth=$(redis_llen celery)

Logs: $STATE_DIR/*.log
EOF
}

start() {
  echo "▶ postgres"
  local DATABASE_URL
  if ! DATABASE_URL="$(start_postgres)" || [ -z "$DATABASE_URL" ]; then
    echo "  postgres did not come up; last lines of its log:" >&2
    tail -n 5 "$STATE_DIR/postgres.out" >&2 2>/dev/null || true
    echo "  (remove $STATE_DIR/pgdata for a fresh cluster)" >&2
    return 1
  fi
  echo "  db ready"

  start_redis || return 1

  echo "▶ migrations"
  ( cd "$BACKEND_DIR" && DATABASE_URL="$DATABASE_URL" "$ALEMBIC" upgrade head >/dev/null ) \
    || die "alembic upgrade head failed (DATABASE_URL=$DATABASE_URL)"

  write_env "$DATABASE_URL"
  rm -rf "$STATE_DIR/prometheus"
  mkdir -p "$STATE_DIR/prometheus"

  echo "▶ paystack stand-in :$PAYSTACK_PORT"
  _spawn paystack "$STATE_DIR/paystack.log" \
    env bash -c "cd '$BACKEND_DIR'; PORT=$PAYSTACK_PORT FRONTEND_URL='$FRONTEND_URL' PAYSTACK_CAPTURE='$STATE_DIR/paystack-init.jsonl' FX_NGN_RATE=1650.00 exec '$PY' audit/mock_paystack.py"
  wait_for "http://127.0.0.1:$PAYSTACK_PORT/fx/latest" "paystack"

  echo "▶ mail sink :$MAIL_SMTP_PORT (inbox :$MAIL_HTTP_PORT)"
  _spawn mail "$STATE_DIR/mail.log" \
    env bash -c "cd '$BACKEND_DIR'; SMTP_PORT=$MAIL_SMTP_PORT HTTP_PORT=$MAIL_HTTP_PORT exec '$PY' audit/mock_mail_sink.py"
  wait_for "http://127.0.0.1:$MAIL_HTTP_PORT/" "mail sink"

  # Order matters: the worker imports the app and needs Postgres migrated;
  # beat's first tick dispatches real work, so the worker must be consuming
  # first or the first cycle's tasks would sit in the queue.
  start_api || return 1
  start_worker || return 1
  start_beat || return 1

  print_summary
}

stop() {
  local name pid
  for name in beat worker api mail paystack redis; do
    pidfile="$STATE_DIR/$name.pid"
    [ -f "$pidfile" ] || continue
    pid="$(cat "$pidfile" 2>/dev/null || true)"
    if [ -n "$pid" ]; then
      # Whole process group: Celery's prefork children must go too.
      kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
  done
  sleep 1
  # Fallback for processes started before pid tracking existed.
  pkill -f "uvicorn app.main:app --host 0.0.0.0 --port $API_PORT" 2>/dev/null || true
  pkill -f "celery -A app.infrastructure.celery_app.celery_app" 2>/dev/null || true
  pkill -f "audit/mock_paystack.py" 2>/dev/null || true
  pkill -f "audit/mock_mail_sink.py" 2>/dev/null || true
  echo "stopped (postgres left running; remove $STATE_DIR to reset data)"
}

status() {
  for probe in "api|http://127.0.0.1:$API_PORT/health/live" \
               "paystack|http://127.0.0.1:$PAYSTACK_PORT/fx/latest" \
               "mail|http://127.0.0.1:$MAIL_HTTP_PORT/"; do
    name="${probe%%|*}"; url="${probe#*|}"
    if curl -s -o /dev/null --max-time 2 "$url"; then echo "  ✓ $name"; else echo "  ✗ $name ($url)"; fi
  done
  if redis_ping; then echo "  ✓ redis ($REDIS_URL) queue=$(redis_llen celery)"; else echo "  ✗ redis ($REDIS_URL)"; fi
  if wait_for_worker 6; then echo "  ✓ celery worker"; else echo "  ✗ celery worker"; fi
  local hb; hb="$(redis_get "$HEARTBEAT_KEY" || true)"
  if [ -n "$hb" ]; then echo "  ✓ celery beat (last heartbeat $hb)"; else echo "  ✗ celery beat (no scheduler heartbeat)"; fi
  echo "  pipeline: $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$API_PORT/health/checks") on /health/checks (200 = healthy)"
  curl -s "http://127.0.0.1:$PAYSTACK_PORT/capture" 2>/dev/null | head -c 200
}

# Foreground mode: everything dies with this shell. This is the mode to use in
# CI or a scratch container, where leaving a Beat process behind would be a
# zombie with a live broker connection.
run() {
  trap 'echo; echo "shutting down..."; cleanup_children; stop' EXIT INT TERM
  start || exit 1
  echo "running in foreground — Ctrl-C to stop everything"
  while true; do sleep 5; done
}

case "${1:-start}" in
  start) start ;;
  run) run ;;
  api)
    pkill -f "uvicorn app.main:app --host 0.0.0.0 --port $API_PORT" 2>/dev/null || true
    sleep 0.5
    start_api
    ;;
  worker) start_worker ;;
  beat) start_beat ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  *) echo "usage: $0 {start|run|stop|restart|status|api|worker|beat}" >&2; exit 2 ;;
esac
