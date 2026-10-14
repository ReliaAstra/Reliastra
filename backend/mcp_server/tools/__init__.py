"""Tool modules and the registration order.

This tuple is the extension point. Adding a capability means writing a module
with a ``register(server, deps)`` function and appending it here — the server
core never changes, and no module imports another tool module.

Each entry is a ``(module, enabled)`` decision, so an operator can switch a
surface off without editing tool code: ``allow_mutations=False`` drops the
mutation module entirely, which means those tools are not even *listed*, rather
than being listed and refusing.

Ordering matters for one reason only: ``capabilities`` registers first so that
``deps.registered_tools`` is complete by the time the capability document is
built. The document is built per call, not at registration, so the tools a
caller sees are always the tools that actually exist on this server.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ._base import ServerDeps

from . import (
    analysis,
    capabilities,
    evidence,
    incidents,
    mutations,
    observatory,
    planning,
    workspace,
)

#: Every tool module, in registration order.
ALL_MODULES: tuple[Any, ...] = (
    capabilities,
    observatory,
    incidents,
    evidence,
    workspace,
    analysis,
    planning,
    mutations,
)

#: Modules that expose state-changing tools.
MUTATION_MODULES: frozenset[str] = frozenset({"mutations"})


def enabled_modules(allow_mutations: bool) -> Iterator[Any]:
    """The modules this server should register, given its configuration."""
    for module in ALL_MODULES:
        if not allow_mutations and module.__name__.rsplit(".", 1)[-1] in MUTATION_MODULES:
            continue
        yield module


def register_all(server: Any, deps: ServerDeps) -> list[str]:
    """Register every enabled module. Returns the tool names registered."""
    for module in enabled_modules(deps.config.allow_mutations):
        module.register(server, deps)
    return list(deps.registered_tools)


__all__ = ["ALL_MODULES", "MUTATION_MODULES", "enabled_modules", "register_all"]
