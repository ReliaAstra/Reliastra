# syntax=docker/dockerfile:1
# =============================================================================
# Reliastra ALL-IN-ONE production image
#
# One container runs the entire platform:
#   - FastAPI backend (uvicorn)          -> :8000
#   - Next.js frontend (standalone)      -> :3000
#   - Redis (rate limit / Celery broker) -> internal
#   - Celery worker + beat               -> internal
#
# Persistence stays external: Supabase Postgres (DATABASE_URL) and
# Supabase Storage S3 (SUPABASE_S3_*). SQLite and local Postgres are NOT
# supported. Required env: DATABASE_URL (+ SECRET_KEY in production).
#
# Build:  docker build -t reliastra-allinone .
# Run:    docker run -p 3000:3000 -p 8000:8000 \
#           -e DATABASE_URL="postgresql+asyncpg://..." \
#           -e SECRET_KEY="$(openssl rand -hex 32)" \
#           -e ENVIRONMENT=production \
#           -e SUPABASE_S3_*="..." reliastra-allinone
# =============================================================================

# ── Stage 1: Build the Next.js frontend ────────────────────────────────────
FROM node:20.18.1-slim AS frontend-builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /build

# Install dependencies first for layer caching. Dev deps are REQUIRED for
# the build (tailwind/postcss/typescript) — do not set NODE_ENV=production
# before this step.
COPY frontend/package.json frontend/bun.lock ./
RUN npm install --no-audit --no-fund

COPY frontend/prisma ./prisma
RUN npx prisma generate

COPY frontend/ ./

# `npm run build` emits output:"standalone" and copies .next/static +
# public/ into .next/standalone (see frontend/package.json).
RUN npm run build


# ── Stage 2: Build the Python virtualenv ───────────────────────────────────
FROM python:3.12.7-slim AS backend-builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/ .

RUN python -m venv --copies /opt/venv && \
    . /opt/venv/bin/activate && \
    pip install --upgrade pip setuptools build && \
    pip install .


# ── Stage 3: Runtime ────────────────────────────────────────────────────────
FROM python:3.12.7-slim

# Pinned runtime deps — update via `docker buildx imagetools inspect` and CI provenance
# Node.js 20 (frontend), Redis (broker/cache), supervisord (process manager),
# curl (healthchecks), gosu (privilege drop)
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg supervisor gosu \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update && apt-get install -y --no-install-recommends \
        nodejs redis-server \
    && rm -rf /var/lib/apt/lists/* \
    && node --version && python --version

# Non-root app user (also used in production compose for api/worker)
RUN groupadd --system --gid 10001 reliastra && \
    useradd --system --uid 10001 --gid 10001 --create-home --shell /bin/bash reliastra

# Python venv (API + Celery + Alembic)
COPY --from=backend-builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Backend application code (owned by reliastra, but supervisord runs as root to manage redis)
COPY --chown=reliastra:reliastra backend/ /app/

# Frontend standalone bundle (server.js + traced node_modules + static + public)
COPY --chown=reliastra:reliastra --from=frontend-builder /build/.next/standalone /app/web/
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    # The frontend proxies /api/* to the API. Default to THIS container's
    # API; override RELIASTRA_API_URL for split deployments.
    RELIASTRA_API_URL=http://127.0.0.1:8000

# Playwright Chromium for evidence-generation tasks (best effort)
RUN playwright install --with-deps chromium 2>/dev/null || true

RUN mkdir -p /app/templates /app/web/.next /var/log/supervisor /var/log/redis && \
    chown -R reliastra:reliastra /app && \
    chmod 750 /app

# Process supervision for the whole stack (supervisord itself runs as root to manage redis,
# but api/worker/beat drop to reliastra via supervisord user=)
COPY deploy/supervisord-all.conf /app/supervisord-all.conf
COPY deploy/entrypoint.sh /app/scripts/entrypoint-all.sh
RUN chmod +x /app/scripts/entrypoint-all.sh

# Production hardening: no secrets in image, no build creds retained
RUN rm -rf /root/.cache /tmp/* /var/tmp/*

EXPOSE 3000 8000

# Graceful shutdown: SIGTERM → supervisord → children
STOPSIGNAL SIGTERM

# Both surfaces must answer: backend liveness + frontend root page.
HEALTHCHECK --interval=15s --timeout=10s --start-period=120s --retries=8 \
    CMD curl -sf http://localhost:8000/health/live && curl -sf http://localhost:3000/ || exit 1

# Labels for provenance (also set by CI metadata-action)
LABEL org.opencontainers.image.title="reliastra" \
      org.opencontainers.image.description="Reliastra — external dependency intelligence" \
      org.opencontainers.image.source="https://github.com/ReliaAstra/Reliastra"

ENTRYPOINT ["/app/scripts/entrypoint-all.sh"]
