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

# SQLite and local Postgres are unsupported - fail fast with a clear message.
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
# Optional MCP server (agent-native interface to this API). Off by default: it is
# a separate process with its own memory cost on a 1.6GB box. See docs/mcp/.
export ENABLE_MCP="${ENABLE_MCP:-false}"

# Frontend -> backend wiring inside this container (overridable).
export RELIASTRA_API_URL="${RELIASTRA_API_URL:-http://127.0.0.1:8000}"
echo "[init] Frontend proxies API calls to ${RELIASTRA_API_URL}"
echo "[init] Celery worker/beat: ${ENABLE_CELERY}"
echo "[init] MCP server: ${ENABLE_MCP}"

if [ "${ENABLE_MCP}" = "true" ]; then
    # The MCP server is a plain HTTP client of the canonical API, and in this
    # container the API is on loopback - so it uses the same in-container address
    # the frontend proxy uses rather than hairpinning out through the public
    # hostname and back.
    export MCP_RELIASTRA_API_URL="${MCP_RELIASTRA_API_URL:-${RELIASTRA_API_URL}}"

    # Validate with the server's own loader instead of restating its rules here.
    # --transport streamable-http matters: the production refusals (a plaintext
    # non-loopback bind, and a loopback bind with no MCP_HTTP_ALLOWED_HOSTS that
    # would answer 421 to every proxied call) only apply to the HTTP transport,
    # so checking the default stdio shape would report a false "valid".
    #
    # A bad configuration is reported and the container still starts: supervisord
    # keeps the mcp program down and prints the reason, while the API and the web
    # keep serving. An optional sidecar must not be able to take the product down.
    if /opt/venv/bin/python -m mcp_server --transport streamable-http --check-config >/dev/null; then
        echo "[init] MCP configuration valid; serving ${MCP_RELIASTRA_API_URL}."
    else
        echo "[init] WARNING: MCP configuration is invalid - the mcp program will" >&2
        echo "[init]          not start. The reason is above; the API is unaffected." >&2
    fi
fi

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

echo "=== Starting supervisord (api :8000, web :3000, mcp :8765 if enabled) ==="
exec /usr/bin/supervisord -c /app/supervisord-all.conf
