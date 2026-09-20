"""Architectural contracts of the platform redesign.

1. Every legacy import path (``app.core.*``, ``app.infrastructure.*``,
   ``app.db.*``, ``app.dependencies``) re-exports the *same objects* as the
   canonical home — shims are aliases, never forks.
2. Layering: ``app.platform`` never imports domain logic (``app.modules``);
   the only exception is the model registry in
   ``app.platform.persistence.base``. ``app.platform`` also never imports
   the composition layers (``app.api``, ``app.bootstrap``).
3. The router registry is the single mount table: the unmounted set is
   pinned here so exposing or hiding a surface is a conscious diff.
"""

import ast
import importlib
import pathlib

APP = pathlib.Path(__file__).resolve().parents[2] / "app"

#: (legacy module, canonical module, names that must be identical objects)
ALIAS_SPOT_CHECKS: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    (
        "app.core.exceptions",
        "app.platform.web.errors",
        ("AppException", "error_payload", "setup_exception_handlers"),
    ),
    (
        "app.core.request_context",
        "app.platform.observability.context",
        ("request_id_var", "set_request_id", "get_user_id"),
    ),
    (
        "app.core.metrics",
        "app.platform.observability.metrics",
        ("checks_total", "http_requests_total", "render_metrics"),
    ),
    (
        "app.core.pagination",
        "app.platform.web.pagination",
        ("PaginatedResponse", "paginated"),
    ),
    (
        "app.core.rate_limit",
        "app.platform.web.rate_limit",
        ("enforce_rate_limit", "api_key_limiter"),
    ),
    ("app.core.tenant", "app.platform.tenancy.middleware", ("TenantContextMiddleware",)),
    (
        "app.core.supabase",
        "app.platform.security.supabase",
        ("verify_supabase_token",),
    ),
    (
        "app.core.security",
        "app.platform.security.tokens",
        ("decode_token", "create_access_token"),
    ),
    (
        "app.core.security",
        "app.platform.security.passwords",
        ("get_password_hash", "verify_password"),
    ),
    (
        "app.core.security",
        "app.platform.security.api_keys",
        ("generate_api_key", "verify_api_key"),
    ),
    (
        "app.core.security",
        "app.platform.security.field_encryption",
        ("get_fernet", "encrypt_jsonb"),
    ),
    (
        "app.core.permissions",
        "app.platform.tenancy.roles",
        ("Role", "has_permission", "require_permission"),
    ),
    (
        "app.core.permissions",
        "app.platform.commercial.entitlements",
        ("Plan", "normalize_plan", "PLAN_AMOUNTS", "get_effective_plan_for_org"),
    ),
    (
        "app.core.payment_pricing",
        "app.modules.billing.pricing",
        ("format_money", "PRODUCT_CURRENCY"),
    ),
    (
        "app.core.fx_reference",
        "app.modules.billing.fx_reference",
        ("fx_reference_payload",),
    ),
    (
        "app.infrastructure.redis_client",
        "app.platform.integrations.redis",
        ("get_redis", "safe_redis_claim", "set_test_redis"),
    ),
    (
        "app.infrastructure.celery_app",
        "app.platform.messaging.celery_app",
        ("celery_app", "beat_task_names", "probe_broker"),
    ),
    (
        "app.infrastructure.async_tasks",
        "app.platform.messaging.async_tasks",
        ("async_task_body", "run_async"),
    ),
    (
        "app.infrastructure.after_commit",
        "app.platform.persistence.after_commit",
        ("dispatch_after_commit",),
    ),
    ("app.db.base", "app.platform.persistence.base", ("Base", "import_all_models")),
    (
        "app.db.session",
        "app.platform.persistence.session",
        ("get_db", "get_engine", "get_session_maker", "set_test_engine"),
    ),
    ("app.dependencies", "app.api.deps", ("get_current_user", "get_current_org")),
)


def test_legacy_paths_reexport_identical_objects():
    for legacy, canonical, names in ALIAS_SPOT_CHECKS:
        old = importlib.import_module(legacy)
        new = importlib.import_module(canonical)
        for name in names:
            assert getattr(old, name) is getattr(new, name), (
                f"{legacy}.{name} is not {canonical}.{name}: shims must alias, not fork"
            )


def _imports_of(path: pathlib.Path) -> set[str]:
    tree = ast.parse(path.read_text())
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            found.add(node.module)
        elif isinstance(node, ast.Import):
            found.update(a.name for a in node.names)
    return found


def test_platform_never_imports_domain_logic():
    """The dependency rule juniors can rely on: platform is bottom-layer.

    ``app.platform`` may not import ``app.modules`` — except the model
    registry (``persistence/base.import_all_models``), which exists precisely
    so workers boot with a complete mapper graph.
    """
    violations: list[str] = []
    for path in sorted((APP / "platform").rglob("*.py")):
        if "__pycache__" in str(path):
            continue
        for imported in _imports_of(path):
            if not imported.startswith("app.modules"):
                continue
            if path.name == "base.py" and imported.endswith(".models"):
                continue
            violations.append(f"{path.relative_to(APP)} imports {imported}")
    assert not violations, "platform → modules imports:\n" + "\n".join(violations)


def test_platform_never_imports_composition_layers():
    for path in sorted((APP / "platform").rglob("*.py")):
        if "__pycache__" in str(path):
            continue
        for imported in _imports_of(path):
            assert not imported.startswith(("app.api", "app.bootstrap", "app.main")), (
                f"{path.relative_to(APP)} imports {imported}"
            )


def test_main_entrypoint_stays_thin_and_stable():
    import app.main as main

    for name in ("app", "create_app", "lifespan", "IdempotencyMiddleware", "RequestIdMiddleware"):
        assert hasattr(main, name), f"app.main.{name} is part of the import contract"


def test_router_registry_pins_the_unmounted_set():
    """Exposing or hiding an HTTP surface must be a conscious diff.

    If this fails because the product intentionally mounted/unmounted a
    router, update both the registry and this expected set together.
    """
    from app.bootstrap.routers import ROUTER_REGISTRY, unmounted_routers

    names = [entry.name for entry in ROUTER_REGISTRY]
    assert len(names) == len(set(names)), "registry names must be unique"
    assert unmounted_routers(), "registry must record unmounted surfaces"
    assert sorted(e.name for e in unmounted_routers()) == sorted(
        [
            "agencies",
            "partners",
            "admin_partners",
            "badges",
            "vendor_submissions",
            "vendor_submission_admin",
            "growth",
            "status",
            "status_page",
            "public_analytics",
            "email_admin",
            "email_center",
            "outreach_admin",
        ]
    )
