#!/usr/bin/env python3
"""Local dev launcher for the Reliastra API.

Brings up an embedded PostgreSQL server (via pgserver) and runs the FastAPI
app with uvicorn. Used when a full Supabase/Redis stack is unavailable, e.g.
in a sandbox where apt/Docker cannot be used.

    python scripts/dev_api.py
"""
from __future__ import annotations

import os
import pathlib
import sys

import pgserver
from alembic import command
from alembic.config import Config


def main() -> None:
    # Persist the data dir under /tmp so restarts reuse the migrated cluster.
    pgdata = pathlib.Path("/tmp/reliastra-pgdata")
    pgdata.mkdir(parents=True, exist_ok=True)

    srv = pgserver.get_server(pgdata=pgdata, cleanup_mode="stop")
    uri = srv.get_uri("postgres")
    async_uri = uri.replace("postgresql://", "postgresql+asyncpg://", 1)

    # Must be set BEFORE importing app.config (Settings is instantiated at import).
    os.environ["DATABASE_URL"] = async_uri
    os.environ["DATABASE_SSL_MODE"] = ""

    print(f"[dev_api] embedded Postgres running (pid {srv.get_pid()})")
    print(f"[dev_api] DATABASE_URL={async_uri}")

    # Apply migrations.
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", async_uri.replace("%", "%%"))
    print("[dev_api] applying migrations (alembic upgrade head)...")
    command.upgrade(cfg, "head")
    print("[dev_api] migrations complete")

    import uvicorn

    from app.main import app  # noqa: F401  (imports app, registers routes)

    print("[dev_api] starting uvicorn on 0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")


if __name__ == "__main__":
    sys.exit(main())
