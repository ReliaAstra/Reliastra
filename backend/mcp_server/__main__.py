"""Process entry point: ``python -m mcp_server``.

    python -m mcp_server --transport stdio          # local agent, credential from env
    python -m mcp_server --transport streamable-http # remote, always authenticated
    python -m mcp_server --print-capabilities        # dump the verified registry, exit
    python -m mcp_server --check-config              # validate configuration, exit

Configuration is read from the environment (see :mod:`mcp_server.config` and
``backend/.env.example``). Invalid configuration exits non-zero with the reason
before any listener is opened; the server never starts in a half-configured state.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

from . import __version__
from .config import ConfigurationError, load_config


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="mcp_server",
        description="Reliastra MCP server — external dependency observability and evidence.",
    )
    parser.add_argument(
        "--transport",
        choices=("stdio", "streamable-http"),
        default="stdio",
        help=(
            "stdio for a local agent that spawns this process; streamable-http for a "
            "remote caller. HTTP/SSE (the legacy transport) is deliberately not "
            "offered. Default: stdio."
        ),
    )
    parser.add_argument(
        "--version", action="store_true", help="Print the server version and exit."
    )
    parser.add_argument(
        "--print-capabilities",
        action="store_true",
        help=(
            "Print the verified capability registry as JSON and exit. No network, no "
            "credential. Useful for auditing what this server claims."
        ),
    )
    parser.add_argument(
        "--check-config",
        action="store_true",
        help="Validate configuration, print it with secrets redacted, and exit.",
    )
    return parser


def _declared_in_environment(name: str) -> bool:
    """Whether ``name`` is present in the environment, in any casing.

    :class:`McpServerConfig` reads variables case-insensitively, so "the operator
    said nothing" has to be asked the same way or ``mcp_http_enabled=false``
    would be treated as silence and overridden.
    """
    wanted = name.upper()
    return any(key.upper() == wanted for key in os.environ)


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)

    if args.version:
        print(__version__)
        return 0

    # ``--transport streamable-http`` is itself the explicit intent to serve the
    # remote transport, so it is also the switch. Requiring MCP_HTTP_ENABLED=true
    # *as well* would mean a deployment that sets only one of them fails as a
    # supervisord restart loop instead of a readable message.
    #
    # This is passed as a load_config override rather than written into
    # os.environ: a command-line entry point should not mutate the process
    # environment behind the back of everything else in it. Overrides rank above
    # every environment source and still run the model validators, so the
    # production fail-fast checks (a plaintext non-loopback bind, and a loopback
    # bind with no MCP_HTTP_ALLOWED_HOSTS that would answer 421 to every proxied
    # call) run exactly as they would for an explicit MCP_HTTP_ENABLED=true.
    #
    # Only when the operator has said nothing: an explicit
    # ``MCP_HTTP_ENABLED=false`` is honoured, and run_http then refuses with a
    # readable message instead of being overruled by a command-line default.
    overrides: dict[str, Any] = {}
    if args.transport == "streamable-http" and not _declared_in_environment(
        "MCP_HTTP_ENABLED"
    ):
        overrides["mcp_http_enabled"] = True

    try:
        config = load_config(**overrides)
    except ConfigurationError as exc:
        # Fail fast and loudly: a server that starts with bad configuration is a
        # server that misbehaves later in a way nobody can attribute.
        print(f"configuration error: {exc}", file=sys.stderr)
        return 2

    if args.print_capabilities:
        from .capabilities import build_capabilities

        document = build_capabilities(
            authenticated=False,
            allow_mutations=config.allow_mutations,
            server_version=__version__,
        )
        json.dump(document, sys.stdout, indent=2, default=str)
        sys.stdout.write("\n")
        return 0

    if args.check_config:
        json.dump(config.redacted, sys.stdout, indent=2, default=str)
        sys.stdout.write("\n")
        return 0

    import anyio

    from .observability import get_logger

    get_logger("main", config.log_level, json_logs=config.log_json)

    try:
        if args.transport == "stdio":
            anyio.run(_run_stdio, config)
        else:
            anyio.run(_run_http, config)
    except ConfigurationError as exc:
        print(f"configuration error: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        return 0
    return 0


async def _run_stdio(config: Any) -> None:
    from .server import run_stdio

    await run_stdio(config)


async def _run_http(config: Any) -> None:
    from .server import run_http

    await run_http(config)


if __name__ == "__main__":
    raise SystemExit(main())
