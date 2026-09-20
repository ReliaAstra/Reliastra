"""One-shot: generate back-compat shims at old import paths. Run once."""

import ast
import json
import pathlib

APP = pathlib.Path("app")
SNAP = json.load(open("/tmp/surface_before.json"))

SHIMS: dict[str, list[str]] = {
    "app.core.logging": ["app.platform.observability.logging"],
    "app.core.metrics": ["app.platform.observability.metrics"],
    "app.core.request_context": ["app.platform.observability.context"],
    "app.core.audit_log": ["app.platform.observability.audit"],
    "app.core.exceptions": ["app.platform.web.errors"],
    "app.core.pagination": ["app.platform.web.pagination"],
    "app.core.rate_limit": ["app.platform.web.rate_limit"],
    "app.core.tenant": ["app.platform.tenancy.middleware"],
    "app.core.circuit_breaker": ["app.platform.resilience.circuit_breaker"],
    "app.core.ssrf_protection": ["app.platform.security.ssrf"],
    "app.core.supabase": ["app.platform.security.supabase"],
    "app.core.security": [
        "app.platform.security.passwords",
        "app.platform.security.tokens",
        "app.platform.security.api_keys",
        "app.platform.security.field_encryption",
    ],
    "app.core.permissions": [
        "app.platform.tenancy.roles",
        "app.platform.commercial.entitlements",
    ],
    "app.core.payment_channels": ["app.modules.billing.channels"],
    "app.core.payment_disclosure": ["app.modules.billing.disclosure"],
    "app.core.payment_pricing": ["app.modules.billing.pricing"],
    "app.core.checkout_reasons": ["app.modules.billing.checkout_reasons"],
    "app.core.commercial_terms": ["app.modules.billing.commercial_terms"],
    "app.core.fx_reference": ["app.modules.billing.fx_reference"],
    "app.infrastructure.redis_client": ["app.platform.integrations.redis"],
    "app.infrastructure.celery_app": ["app.platform.messaging.celery_app"],
    "app.infrastructure.async_tasks": ["app.platform.messaging.async_tasks"],
    "app.infrastructure.after_commit": ["app.platform.persistence.after_commit"],
    "app.infrastructure.email": ["app.platform.integrations.email_smtp"],
    "app.infrastructure.email_layout": ["app.platform.integrations.email_layout"],
    "app.infrastructure.email_resend": ["app.platform.integrations.email_resend"],
    "app.infrastructure.ipgeo": ["app.platform.integrations.ipgeo"],
    "app.infrastructure.storage": ["app.platform.integrations.storage"],
    "app.db.base": ["app.platform.persistence.base"],
    "app.db.connect_args": ["app.platform.persistence.connect_args"],
    "app.db.session": ["app.platform.persistence.session"],
    "app.dependencies": ["app.api.deps"],
}


def top_level_names(dotted: str) -> set[str]:
    """Names bound at module top level (defs + imports), via AST."""
    rel = dotted.replace("app.", "app/").replace(".", "/") + ".py"
    tree = ast.parse(pathlib.Path(rel).read_text())
    names: set[str] = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = (
                node.targets if isinstance(node, ast.Assign) else [node.target]
            )
            for t in targets:
                if isinstance(t, ast.Name):
                    names.add(t.id)
                elif isinstance(t, ast.Tuple):
                    names.update(
                        e.id for e in t.elts if isinstance(e, ast.Name)
                    )
        elif isinstance(node, ast.Import):
            for a in node.names:
                names.add((a.asname or a.name).split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            for a in node.names:
                if a.name != "*":
                    names.add(a.asname or a.name)
    return names


TEMPLATE = '''"""{old} — backward-compatibility alias.

Canonical home: {canon_docs}
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

{imports}

__all__ = [
{all_names}
]
'''

failures: list[str] = []
for old, canonicals in SHIMS.items():
    names = SNAP[old]
    assert isinstance(names, list), (old, names)
    provided = {c: top_level_names(c) for c in canonicals}
    grouped: dict[str, list[str]] = {c: [] for c in canonicals}
    for name in names:
        for c in canonicals:
            if name in provided[c]:
                grouped[c].append(name)
                break
        else:
            failures.append(f"{old}: {name} not found in {canonicals}")
    imports = "\n".join(
        f"from {c} import (  # noqa: F401\n"
        + "".join(f"    {n},\n" for n in grouped[c])
        + ")"
        for c in canonicals
        if grouped[c]
    )
    canon_docs = ", ".join(f"``{c}``" for c in canonicals)
    content = TEMPLATE.format(
        old=old,
        canon_docs=canon_docs,
        imports=imports,
        all_names="".join(f'    "{n}",\n' for n in names),
    )
    rel = old.replace("app.", "app/").replace(".", "/") + ".py"
    pathlib.Path(rel).write_text(content)
    print(f"shim {rel} ({len(names)} names)")

if failures:
    print("UNRESOLVED:")
    print("\n".join(failures))
    raise SystemExit(1)
print("all shims generated")
