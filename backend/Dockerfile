# Dockerfile for Reliastra-backend
# API + Redis + Celery worker/beat in one container.
# PostgreSQL lives on Supabase; object storage is Supabase Storage (S3).
# For single-container PaaS platforms (Railway, Render, etc.)
# ---------------------------------------------------------------------------

# ── Stage 1: Build Python venv ───────────────────────────────────────────
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN python -m venv --copies /opt/venv && \
    . /opt/venv/bin/activate && \
    pip install --upgrade pip setuptools build && \
    pip install .

# ── Stage 2: Runtime image ───────────────────────────────────────────────
FROM python:3.12-slim

# Redis (queue/cache) + supervisord. No PostgreSQL — the app uses Supabase.
RUN apt-get update && apt-get install -y --no-install-recommends \
    redis-server \
    supervisor \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

COPY . .

# Install Playwright Chromium for evidence generation tasks
RUN playwright install --with-deps chromium 2>/dev/null || true

RUN mkdir -p /app/templates /var/log/supervisor /var/log/redis

COPY supervisord.conf /app/supervisord.conf
COPY scripts/entrypoint.sh /app/scripts/entrypoint.sh
RUN chmod +x /app/scripts/entrypoint.sh

EXPOSE 8000

# start-period covers Alembic against Supabase + supervisord boot.
HEALTHCHECK --interval=15s --timeout=10s --start-period=90s --retries=8 \
    CMD curl -sf http://localhost:8000/health/live || exit 1

# The entrypoint runs migrations against DATABASE_URL (Supabase), then supervisord.
ENTRYPOINT ["/app/scripts/entrypoint.sh"]
