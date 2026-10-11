"""reliastra_get_capabilities — permission-aware capability discovery.

Pure local read: no upstream call, works without any credential. The document
is built from the verified registry (capabilities.py), filtered by whether
the caller authenticated.
"""

from typing import Any

from ..capabilities import build_capabilities
from . import _base as base


async def get_capabilities(ctx: base.ToolContext) -> dict[str, Any]:
    """Implementation; registered by register()."""
    doc = build_capabilities(authenticated=ctx.authenticated)
    return base.envelope(
        "reliastra_get_capabilities", doc, ctx, source="local capability registry v0.1.0"
    )


DESCRIPTION = """Discover what Reliastra can actually do, tailored to your credential.

Use this FIRST before any other Reliastra tool: it tells you which operations
exist, which need an API key, what the methodology guarantees (1 observation
point, deterministic 2/2 detection, attribution v1.1), plan limits, and how
to integrate (REST, CLI). Read-only, works without credentials (public view);
with an API key the workspace and mutation operations unlock. When NOT to use:
to fetch live data — use the observatory tools instead. Next: search_vendors
for public data, or list_dependencies once authenticated."""


def register(server, deps: base.ServerDeps) -> None:
    base.register_tool(
        server,
        deps,
        get_capabilities,
        name="reliastra_get_capabilities",
        description=DESCRIPTION,
        read_only=True,
    )
