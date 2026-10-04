"""The API schema must not be public.

`/openapi.json` enumerates every route the application registers, including
the authenticated ones: `/v1/billing/*`, `/v1/api-keys/*`, the admin control
plane, and `/v1/evidence/{report_token}/download`. Serving it without
authentication hands an attacker the complete attack surface from one GET, in
a product whose entire claim is that it takes infrastructure security
seriously.

There are two independent guards and this module asserts both, because either
can be undone by accident:

1. `EXPOSE_API_SCHEMA` (default `False`) stops FastAPI registering the route.
2. The Caddyfile refuses the path, so a misconfigured environment file cannot
   re-expose the schema at the edge.

A third guard lives in `deploy/production/scripts/smoke-test.sh`, which fails a
deploy if `/openapi.json` ever answers anything but 404.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.bootstrap.app_factory import create_app
from app.config import Settings

REPO_ROOT = Path(__file__).resolve().parents[3]
CADDYFILE = REPO_ROOT / "deploy" / "production" / "Caddyfile"

SCHEMA_PATHS = ("/openapi.json", "/api-docs", "/api-redoc")


def _schema_routes(app) -> list[str]:
    return sorted(
        route.path
        for route in app.routes
        if any(marker in route.path for marker in ("openapi", "api-docs", "api-redoc"))
    )


def test_schema_is_not_exposed_by_default():
    """The default posture must withhold the schema."""
    assert Settings().EXPOSE_API_SCHEMA is False, (
        "EXPOSE_API_SCHEMA must default to False. If this test is failing after an "
        "intentional change, also check the Caddyfile and smoke-test.sh."
    )


def test_create_app_registers_no_schema_route_by_default(monkeypatch):
    from app.config import settings as settings_singleton

    monkeypatch.setattr(settings_singleton, "EXPOSE_API_SCHEMA", False)
    app = create_app()
    assert _schema_routes(app) == [], (
        "the application registered a schema route with EXPOSE_API_SCHEMA off"
    )


def test_create_app_still_serves_health_when_the_schema_is_withheld(monkeypatch):
    """Withholding the schema must not take down the probes deploys rely on."""
    from app.config import settings as settings_singleton

    monkeypatch.setattr(settings_singleton, "EXPOSE_API_SCHEMA", False)
    app = create_app()
    paths = {route.path for route in app.routes}
    assert "/health" in paths
    assert "/health/ready" in paths


def test_opt_in_restores_the_schema(monkeypatch):
    """The escape hatch must work, or local work and contract tests break.

    `app.config.settings` is a module-level singleton built at import time, the
    same as every other setting in this codebase, so the environment cannot be
    monkeypatched into effect after import. The factory reads the value off the
    settings object, so that is what is patched here. Environment-to-field
    wiring is asserted separately by test_setting_is_read_from_the_environment.
    """
    from app.config import settings as settings_singleton

    monkeypatch.setattr(settings_singleton, "EXPOSE_API_SCHEMA", True)
    app = create_app()
    assert _schema_routes(app) == sorted(SCHEMA_PATHS)


def test_no_schema_path_is_committed_to_the_repository():
    """A committed schema is the same disclosure with a longer shelf life."""
    snapshot = REPO_ROOT / "backend" / "docs" / "openapi.json"
    assert not snapshot.exists(), (
        f"{snapshot} exists. This repository is public, so a committed OpenAPI "
        "document publishes the full attack surface regardless of server config. "
        "Generate it on demand: cd backend && EXPOSE_API_SCHEMA=true "
        "python -m scripts.export_openapi"
    )


def test_caddyfile_refuses_the_schema_at_the_edge():
    """Layer two: the proxy must not offer the paths the app withholds."""
    caddy = CADDYFILE.read_text(encoding="utf-8")

    for path in SCHEMA_PATHS:
        matcher = f"handle {path}*"
        assert matcher in caddy, f"Caddyfile is missing a refusal for {path}"
        block = caddy.split(matcher, 1)[1].split("}", 1)[0]
        assert "abort" in block, f"{path} is claimed but not refused at the edge"


def test_apex_proxy_does_not_forward_the_schema():
    """The apex site block must not hand these paths to the backend either."""
    caddy = CADDYFILE.read_text(encoding="utf-8")
    apex = caddy.split("api.{$DOMAIN", 1)[1]

    for path in SCHEMA_PATHS:
        for block in re.finditer(rf"handle {re.escape(path)}\*\s*\{{([^}}]*)\}}", apex):
            assert "abort" in block.group(1), (
                f"the API host forwards {path} to the backend; an accidental "
                "EXPOSE_API_SCHEMA=true would publish all routes from the host an "
                "attacker tries first"
            )


def test_smoke_test_fails_the_deploy_if_the_schema_reopens():
    """Layer three: the deploy-time guard exists and is not commented out."""
    smoke = (REPO_ROOT / "deploy" / "production" / "scripts" / "smoke-test.sh").read_text(
        encoding="utf-8"
    )
    assert "/openapi.json" in smoke
    assert "EXPOSE_API_SCHEMA" in smoke
    # The script's own idiom for a stable status assertion is
    # [[ "$LAST_CODE" != "<expected>" ]]. Matching on that shape rather than a
    # bare "404" means a commented-out mention cannot satisfy this test.
    assert re.search(r'"?\$\{?LAST_CODE\}?"\s*!=\s*"?404"?', smoke), (
        "the smoke test must assert /openapi.json answers 404, not merely that the "
        "file mentions it"
    )


@pytest.mark.parametrize("path", SCHEMA_PATHS)
def test_schema_paths_are_not_proxyable_to_the_backend(path: str):
    """No `handle <schema path>*` block may name the API upstream."""
    caddy = CADDYFILE.read_text(encoding="utf-8")
    for block in re.finditer(rf"handle {re.escape(path)}\*\s*\{{([^}}]*)\}}", caddy):
        assert "reverse_proxy" not in block.group(1), (
            f"{path} is reverse-proxied; the schema must not be reachable"
        )


def test_environment_default_is_absent_from_production_config():
    """Nothing in deploy/ may switch the schema on."""
    deploy_dir = REPO_ROOT / "deploy"
    offenders: list[str] = []
    for path in deploy_dir.rglob("*"):
        if path.is_dir() or path.suffix not in {".sh", ".yml", ".yaml", ".env", ".example", ""}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for line in text.splitlines():
            if line.strip().startswith("#"):
                continue
            if re.search(r"EXPOSE_API_SCHEMA\s*[=:]\s*[\"']?(true|1)\b", line, re.IGNORECASE):
                offenders.append(f"{path.relative_to(REPO_ROOT)}: {line.strip()}")
    assert not offenders, (
        "production config switches the API schema on:\n  " + "\n  ".join(offenders)
    )


def test_setting_is_read_from_the_environment(monkeypatch):
    """The field must be wired to the environment, not hardcoded in the factory."""
    monkeypatch.setenv("EXPOSE_API_SCHEMA", "false")
    assert Settings().EXPOSE_API_SCHEMA is False
    monkeypatch.setenv("EXPOSE_API_SCHEMA", "true")
    assert Settings().EXPOSE_API_SCHEMA is True


def test_export_helper_documents_the_opt_in():
    """The regeneration path must exist, or removing the snapshot breaks CI."""
    script = REPO_ROOT / "backend" / "scripts" / "export_openapi.py"
    assert script.exists(), "backend/scripts/export_openapi.py is missing"
    body = script.read_text(encoding="utf-8")
    assert "EXPOSE_API_SCHEMA" in body
    assert "openapi.json" in body
    assert "gitignored" in body.lower(), (
        "the helper must tell the operator the output is gitignored, or the first "
        "person to run it will commit the schema"
    )