#!/usr/bin/env bash
set -euo pipefail

echo "=== Reliastra entrypoint ==="
echo "[init] Database: Supabase Postgres (DATABASE_URL is never rewritten)"
echo "[init] Object storage: Supabase Storage S3"

if [ -z "${DATABASE_URL:-}" ]; then
    echo "[init] FATAL: DATABASE_URL is required." >&2
    echo "[init] Point it at your Supabase Postgres URI, e.g." >&2
    echo "[init]   postgresql+asyncpg://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres" >&2
    exit 1
fi

# The previous single-container image overrode DATABASE_URL to an
# in-container PostgreSQL cluster. Reliastra no longer ships a database —
# SQLite and local Postgres are unsupported.
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

# In-container Redis is used for rate limiting / Celery unless an external
# REDIS_URL is already provided. Never clobber a caller-supplied value.
if [ -z "${REDIS_URL:-}" ]; then
    export REDIS_URL="redis://127.0.0.1:6379/0"
fi

export ENVIRONMENT="${ENVIRONMENT:-development}"

echo "[init] Running Alembic migrations against Supabase..."
/opt/venv/bin/alembic upgrade head
echo "[init] Migrations complete."

SUPERVISORD_BIN="$(command -v supervisord || true)"
if [ -z "$SUPERVISORD_BIN" ]; then
    echo "[init] FATAL: supervisord not found on PATH" >&2
    exit 1
fi

echo "=== Starting supervisord ($SUPERVISORD_BIN) ==="
exec "$SUPERVISORD_BIN" -c /app/supervisord.conf
