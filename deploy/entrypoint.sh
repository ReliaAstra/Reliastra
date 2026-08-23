#!/usr/bin/env bash
# Entrypoint for the all-in-one Reliastra image (frontend + backend).
set -euo pipefail

echo "=== Reliastra all-in-one entrypoint ==="

if [ -z "${DATABASE_URL:-}" ]; then
    echo "[init] FATAL: DATABASE_URL is required." >&2
    echo "[init] Point it at your Supabase Postgres URI, e.g." >&2
    echo "[init]   postgresql+asyncpg://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres" >&2
    exit 1
fi

# SQLite and local Postgres are unsupported — fail fast with a clear message.
case "${DATABASE_URL}" in
    sqlite:*|sqlite+*|*"sqlite://"*)
        echo "[init] FATAL: SQLite is not supported. Use Supabase Postgres." >&2
        exit 1
        ;;
esac

# Default SSL for Supabase when the operator did not set a mode.
if [ -z "${DATABASE_SSL_MODE:-}" ]; then
    case "${DATABASE_URL}" in
        *supabase.co*|*supabase.com*|*pooler.supabase*)
            export DATABASE_SSL_MODE="require"
            echo "[init] DATABASE_SSL_MODE defaulted to 'require' for Supabase."
            ;;
    esac
fi

# In-container Redis serves the broker/rate limiting unless an external
# REDIS_URL is provided. Never clobber a caller-supplied value.
if [ -z "${REDIS_URL:-}" ]; then
    export REDIS_URL="redis://127.0.0.1:6379/0"
fi

export ENVIRONMENT="${ENVIRONMENT:-development}"

# supervisord interpolates these into program definitions so they MUST be defined.
export ENABLE_CELERY="${ENABLE_CELERY:-true}"
export API_WORKERS="${API_WORKERS:-2}"

# Frontend -> backend wiring inside this container (overridable).
export RELIASTRA_API_URL="${RELIASTRA_API_URL:-http://127.0.0.1:8000}"
echo "[init] Frontend proxies API calls to ${RELIASTRA_API_URL}"
echo "[init] Celery worker/beat: ${ENABLE_CELERY}"

if [ -n "${SECRET_KEY:-}" ]; then
    echo "[init] SECRET_KEY provided."
elif [ "${ENVIRONMENT}" = "production" ]; then
    echo "[init] FATAL: SECRET_KEY is required when ENVIRONMENT=production." >&2
    exit 1
else
    echo "[init] WARNING: SECRET_KEY not set; using development default." >&2
fi

echo "[init] Running Alembic migrations against the database..."
/opt/venv/bin/alembic upgrade head
echo "[init] Migrations complete."

echo "=== Starting supervisord (api :8000, web :3000) ==="
exec /usr/bin/supervisord -c /app/supervisord-all.conf
