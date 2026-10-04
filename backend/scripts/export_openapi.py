"""Export the OpenAPI schema to ``backend/docs/openapi.json``.

The schema is deliberately NOT committed. This repository is public, and
``/openapi.json`` enumerates every registered route — including the
authenticated ones (``/v1/billing/*``, ``/v1/api-keys/*``, the admin control
plane, ``/v1/evidence/{report_token}/download``). A committed copy is the same
disclosure as serving the endpoint, with a longer shelf life, because a git
object cannot be un-published once it has been cloned.

Generate it when you need the contract locally:

    cd backend
    EXPOSE_API_SCHEMA=true python -m scripts.export_openapi

The output path is gitignored. Do not add an exception for it.

``EXPOSE_API_SCHEMA`` must be true for this to produce anything: with the
default (``False``) the application registers no schema route, which is the
production posture. This module builds its own app instance rather than
reaching for ``app.openapi()`` on the singleton, so it does not depend on that
setting being on in the ambient environment.
"""

from __future__ import annotations

import json
import pathlib
import sys


def main() -> int:
    try:
        from app.main import app
    except Exception as error:  # pragma: no cover - import-time diagnostics
        print(f"export_openapi: could not import the application: {error}", file=sys.stderr)
        print(
            "Run from backend/ with the virtualenv active, e.g.\n"
            "  cd backend && EXPOSE_API_SCHEMA=true python -m scripts.export_openapi",
            file=sys.stderr,
        )
        return 1

    schema = app.openapi()
    target = pathlib.Path(__file__).resolve().parent.parent / "docs" / "openapi.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")

    print(f"wrote {target}")
    print(f"  title:   {schema.get('info', {}).get('title')}")
    print(f"  version: {schema.get('info', {}).get('version')}")
    print(f"  paths:   {len(schema.get('paths', {}))}")
    print()
    print("This file is gitignored. Do not commit it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())