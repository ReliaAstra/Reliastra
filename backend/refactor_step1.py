"""One-shot refactor script: rewire moved modules to canonical imports, split
security/permissions, and generate back-compat shims. Run once from backend/."""

import pathlib

APP = pathlib.Path("app")

# ── 1. Rewrite imports inside moved files to canonical paths ────────────────
MOVED_DIRS = ["platform", "api"]
MOVED_FILES = [
    "modules/billing/channels.py",
    "modules/billing/disclosure.py",
    "modules/billing/pricing.py",
    "modules/billing/checkout_reasons.py",
    "modules/billing/commercial_terms.py",
    "modules/billing/fx_reference.py",
]

REWRITES = [
    ("app.core.request_context", "app.platform.observability.context"),
    ("app.core.logging", "app.platform.observability.logging"),
    ("app.core.metrics", "app.platform.observability.metrics"),
    ("app.core.audit_log", "app.platform.observability.audit"),
    ("app.core.exceptions", "app.platform.web.errors"),
    ("app.core.rate_limit", "app.platform.web.rate_limit"),
    ("app.core.tenant", "app.platform.tenancy.middleware"),
    ("app.core.payment_pricing", "app.modules.billing.pricing"),
    ("app.core.fx_reference", "app.modules.billing.fx_reference"),
    ("app.core.supabase", "app.platform.security.supabase"),
    ("app.infrastructure.redis_client", "app.platform.integrations.redis"),
    ("app.infrastructure.email_resend", "app.platform.integrations.email_resend"),
    ("app.infrastructure.email_layout", "app.platform.integrations.email_layout"),
    ("app.infrastructure.storage", "app.platform.integrations.storage"),
    ("app.infrastructure.async_tasks", "app.platform.messaging.async_tasks"),
    ("app.infrastructure.celery_app", "app.platform.messaging.celery_app"),
    ("app.infrastructure.ipgeo", "app.platform.integrations.ipgeo"),
    ("from app.infrastructure import async_tasks",
     "from app.platform.messaging import async_tasks"),
    ("app.db.base", "app.platform.persistence.base"),
    ("app.db.connect_args", "app.platform.persistence.connect_args"),
    ("app.db.session", "app.platform.persistence.session"),
]

targets: list[pathlib.Path] = []
for d in MOVED_DIRS:
    targets.extend(sorted((APP / d).rglob("*.py")))
for f in MOVED_FILES:
    targets.append(APP / f)

for path in targets:
    if path.name == "__init__.py":
        continue
    text = path.read_text()
    for old, new in REWRITES:
        text = text.replace(old, new)
    path.write_text(text)
print(f"rewrote imports in {len(targets)} files")

# ── 2a. Split core/security.py → 4 focused modules ───────────────────────────
sec = (APP / "core/security.py").read_text().splitlines(keepends=True)
assert sec[13].startswith("def get_password_hash"), sec[13]
assert sec[28].startswith("def _base_token_payload"), sec[28]
assert sec[176].startswith("def generate_api_key"), sec[176]
assert sec[219].startswith("def get_fernet"), sec[219]
assert sec[246].startswith("        return {}"), sec[247]

SEC_HEAD = '"""%s\n\nCanonical home (moved from ``app.core.security`` during the platform\nredesign). Import from here in new code; ``app.core.security`` re-exports\nthese names for backward compatibility.\n"""\n\n'

(APP / "platform/security/passwords.py").write_text(
    SEC_HEAD % "Password hashing (bcrypt)."
    + "import bcrypt\n\n\n"
    + "".join(sec[11:27])
)
(APP / "platform/security/tokens.py").write_text(
    SEC_HEAD % "JWT session tokens (user + admin-console families)."
    + "import hashlib\nimport hmac\nimport secrets\n"
    + "from datetime import datetime, timedelta, timezone\n"
    + "from typing import Any\nimport jwt\n"
    + "from app.config import settings\n"
    + "from app.platform.web.errors import UnauthorizedException\n\n\n"
    + "".join(sec[27:175])
)
(APP / "platform/security/api_keys.py").write_text(
    SEC_HEAD % "Programmatic API-key generation and verification."
    + "import hashlib\nimport hmac\nimport secrets\nimport bcrypt\n\n\n"
    + "".join(sec[175:218])
)
(APP / "platform/security/field_encryption.py").write_text(
    SEC_HEAD % "Fernet field-level encryption for JSONB columns."
    + "import json\nfrom typing import Any\n"
    + "from cryptography.fernet import Fernet\n"
    + "from app.config import settings\n\n\n"
    + "".join(sec[218:247])
)
print("split security.py into passwords/tokens/api_keys/field_encryption")

# ── 2b. Split core/permissions.py → roles + billing entitlements ─────────────
perm = (APP / "core/permissions.py").read_text().splitlines(keepends=True)
assert perm[6].startswith("class Role"), perm[6]
assert perm[40].startswith("class Plan"), perm[40]

(APP / "platform/tenancy/roles.py").write_text(
    '"""Organization membership roles and the role hierarchy.\n\n'
    "Canonical home (moved from ``app.core.permissions``). Roles answer 'who\n"
    "may act'; plan limits and pricing live in\n"
    "``app.modules.billing.entitlements``.\n"
    '"""\n\n'
    + "from enum import Enum\n"
    + "from app.platform.web.errors import ForbiddenException\n\n\n"
    + "".join(perm[5:38])
)
(APP / "modules/billing/entitlements.py").write_text(
    '"""Plan catalog, trial evaluation, and entitlement resolution.\n\n'
    "Canonical home (moved from ``app.core.permissions``). This is billing-\n"
    "domain logic: the single source of truth for plan identifiers, limits,\n"
    "prices, the 14-day trial derivation, and feature gates.\n"
    '"""\n\n'
    + "from datetime import datetime, timedelta, timezone\n"
    + "from enum import Enum\n\n\n"
    + "".join(perm[38:507])
)
print("split permissions.py into tenancy/roles + billing/entitlements")
