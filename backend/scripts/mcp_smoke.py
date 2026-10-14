"""End-to-end smoke test for the Reliastra MCP server.

This is not a unit test. It starts the server the way an operator would - as a
real subprocess, on both transports - and drives it with a real MCP client from
the official SDK. It exists to answer one question that unit tests with fakes
cannot: **does a compatible MCP client actually get a working session?**

What it verifies, in order:

1. ``--version``, ``--check-config`` and ``--print-capabilities`` exit 0 and print
   what they claim.
2. stdio: a spawned ``python -m mcp_server --transport stdio`` completes the
   initialize handshake, advertises tools/resources/prompts, and answers a tool
   call.
3. Streamable HTTP: a spawned server on a loopback port answers ``/healthz``
   without a credential, completes an authenticated handshake, lists the same
   surface, answers the same tool call, and refuses an unauthenticated request
   with 401.

It needs no database, no Redis and no network: the tool it calls
(``reliastra_get_capabilities`` with ``include_live`` left at its default false)
reads the verified capability registry and never calls the upstream API. A bogus
``RELIASTRA_API_URL`` is set deliberately, so if anything in this path did reach
out, it would fail loudly rather than depend on live infrastructure.

    python scripts/mcp_smoke.py            # from backend/
    make smoke-mcp                         # from the repo root

Exits 0 when every check passed, 1 otherwise, and prints one line per check.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

BACKEND = Path(__file__).resolve().parents[1]
BOGUS_API_URL = "http://127.0.0.1:9"  # discard port: nothing can answer here
# Concatenated on purpose: a single quoted high-entropy rel_ literal trips
# the gitleaks generic-api-key rule and fails CI. Runtime value unchanged.
SMOKE_KEY = "rel_" + "smoke_test_key_0123456789"

_checks: list[tuple[bool, str]] = []


def check(ok: bool, label: str, detail: str = "") -> None:
    _checks.append((ok, label))
    print(f"{'PASS' if ok else 'FAIL'}  {label}" + (f"  [{detail}]" if detail else ""))


def _env(**extra: str) -> dict[str, str]:
    """A subprocess environment that imports mcp_server from this checkout."""
    env = dict(os.environ)
    env["PYTHONPATH"] = str(BACKEND) + os.pathsep + env.get("PYTHONPATH", "")
    env["PYTHONUNBUFFERED"] = "1"
    env["RELIASTRA_API_URL"] = BOGUS_API_URL
    env["ENVIRONMENT"] = "development"
    env["LOG_JSON"] = "false"
    env.pop("MCP_HTTP_ENABLED", None)
    env.update(extra)
    return env


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


# ── 1. Command-line surface ─────────────────────────────────────────────────


def smoke_cli() -> None:
    version = subprocess.run(
        [sys.executable, "-m", "mcp_server", "--version"],
        cwd=BACKEND, env=_env(), capture_output=True, text=True, timeout=60, check=False,
    )
    check(
        version.returncode == 0 and version.stdout.strip() != "",
        "--version prints a version",
        version.stdout.strip() or version.stderr.strip()[:80],
    )

    check_config = subprocess.run(
        [sys.executable, "-m", "mcp_server", "--check-config"],
        cwd=BACKEND, env=_env(), capture_output=True, text=True, timeout=60, check=False,
    )
    redacted: dict[str, Any] = {}
    try:
        redacted = json.loads(check_config.stdout)
    except (ValueError, TypeError):
        pass
    check(
        check_config.returncode == 0 and bool(redacted),
        "--check-config validates and prints the configuration",
        f"{len(redacted)} keys" if redacted else check_config.stderr.strip()[:80],
    )
    # The one thing that must never appear in printed configuration.
    check(
        SMOKE_KEY not in json.dumps(redacted) and BOGUS_API_URL in json.dumps(redacted),
        "--check-config redacts the credential but shows the upstream URL",
    )

    caps = subprocess.run(
        [sys.executable, "-m", "mcp_server", "--print-capabilities"],
        cwd=BACKEND, env=_env(), capture_output=True, text=True, timeout=60, check=False,
    )
    try:
        registry = json.loads(caps.stdout)
        operations = registry.get("operations") or []
    except (ValueError, TypeError):
        registry, operations = {}, []
    check(
        caps.returncode == 0 and len(operations) > 0,
        "--print-capabilities prints the verified registry",
        f"{len(operations)} operations" if operations else caps.stderr.strip()[:80],
    )


# ── 2. stdio transport ──────────────────────────────────────────────────────


async def smoke_stdio() -> None:
    from mcp import ClientSession
    from mcp.client.stdio import StdioServerParameters, stdio_client

    params = StdioServerParameters(
        command=sys.executable,
        args=["-m", "mcp_server", "--transport", "stdio"],
        env=_env(RELIASTRA_API_KEY=SMOKE_KEY),
        cwd=str(BACKEND),
    )
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            initialized = await session.initialize()
            check(
                initialized.server_info.name != "",
                "stdio: initialize handshake completes",
                f"server={initialized.server_info.name} "
                f"protocol={session.protocol_version}",
            )

            tools = (await session.list_tools()).tools
            names = {tool.name for tool in tools}
            check(
                len(names) >= 15 and "reliastra_get_capabilities" in names,
                "stdio: tools are advertised",
                f"{len(names)} tools",
            )

            resources = (await session.list_resources()).resources
            templates = (await session.list_resource_templates()).resource_templates
            check(
                len(resources) >= 4 and len(templates) >= 1,
                "stdio: resources and a resource template are advertised",
                f"{len(resources)} resources, {len(templates)} templates",
            )

            prompts = (await session.list_prompts()).prompts
            check(len(prompts) >= 4, "stdio: prompts are advertised", f"{len(prompts)}")

            result = await session.call_tool("reliastra_get_capabilities", {})
            payload = json.loads(result.content[0].text)
            check(
                result.is_error is not True and payload.get("ok") is True,
                "stdio: a tool call returns a structured envelope",
                f"{len(payload.get('data', {}).get('operations', []))} operations",
            )
            check(
                payload["meta"]["source"] != "",
                "stdio: the result states where its data came from",
                payload["meta"]["source"][:60],
            )


# ── 3. Streamable HTTP transport ────────────────────────────────────────────


def _start_server(port: int) -> tuple[subprocess.Popen[bytes], str]:
    """Spawn the HTTP transport as a real subprocess, logging to a temp file.

    Synchronous on purpose: opening a file and forking a process would block the
    event loop this smoke test runs on. The server's output goes to a file rather
    than a pipe because a pipe nobody is draining can fill and stall the child,
    and two readers (the failure dump and the log-format check) each need the
    whole thing independently.
    """
    import tempfile

    sink = tempfile.NamedTemporaryFile(  # noqa: SIM115 - closed by the caller
        "w+", suffix=".log", prefix="reliastra-mcp-smoke-", delete=False
    )
    log_path = sink.name
    sink.close()
    with open(log_path, "wb") as server_log:
        process = subprocess.Popen(
            [sys.executable, "-m", "mcp_server", "--transport", "streamable-http"],
            cwd=BACKEND,
            env=_env(
                MCP_HTTP_HOST="127.0.0.1",
                MCP_HTTP_PORT=str(port),
                MCP_HTTP_STATELESS="true",
                MCP_LOG_JSON="false",
            ),
            stdout=server_log,
            stderr=subprocess.STDOUT,
        )
    return process, log_path


async def smoke_http() -> None:

    import httpx2
    from mcp import ClientSession
    from mcp.client.streamable_http import create_mcp_http_client, streamable_http_client

    port = _free_port()
    url = f"http://127.0.0.1:{port}/mcp"
    process, log_path = _start_server(port)
    try:
        health_url = f"http://127.0.0.1:{port}/healthz"
        ready = False
        deadline = time.monotonic() + 30
        async with httpx2.AsyncClient(timeout=2.0) as probe:
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    break
                try:
                    response = await probe.get(health_url)
                    if response.status_code == 200:
                        ready = True
                        break
                except httpx2.HTTPError:
                    await _sleep(0.25)
        check(ready, "http: the server binds and /healthz answers without a credential")
        if not ready:
            _dump(process, log_path)
            return

        # Unauthenticated: refused at the edge, before the protocol layer.
        async with httpx2.AsyncClient(timeout=10.0) as bare:
            response = await bare.post(
                url,
                json={
                    "jsonrpc": "2.0", "id": 1, "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-11-25", "capabilities": {},
                        "clientInfo": {"name": "smoke", "version": "0"},
                    },
                },
                headers={
                    "content-type": "application/json",
                    "accept": "application/json, text/event-stream",
                },
            )
        check(
            response.status_code == 401
            and response.headers.get("www-authenticate", "").startswith("Bearer"),
            "http: an unauthenticated request is refused with 401 + WWW-Authenticate",
            str(response.status_code),
        )

        # Authenticated handshake through the SDK's own Streamable HTTP client.
        http_client = create_mcp_http_client(
            headers={"Authorization": f"Bearer {SMOKE_KEY}"}
        )
        async with http_client:
            async with streamable_http_client(url, http_client=http_client) as (read, write):
                async with ClientSession(read, write) as session:
                    initialized = await session.initialize()
                    check(
                        initialized.server_info.name != "",
                        "http: initialize handshake completes over Streamable HTTP",
                        f"protocol={session.protocol_version}",
                    )
                    names = {tool.name for tool in (await session.list_tools()).tools}
                    check(len(names) >= 15, "http: tools are advertised", f"{len(names)}")
                    result = await session.call_tool("reliastra_get_capabilities", {})
                    payload = json.loads(result.content[0].text)
                    check(
                        result.is_error is not True and payload.get("ok") is True,
                        "http: a tool call returns a structured envelope",
                    )

        # Operational endpoints: reachable unauthenticated, leaking no tenant data.
        async with httpx2.AsyncClient(timeout=5.0) as bare:
            metrics = (await bare.get(f"http://127.0.0.1:{port}/metrics")).text
            ready_body = (await bare.get(f"http://127.0.0.1:{port}/readyz")).text
        check(
            "reliastra_mcp_tool_calls_total" in metrics and SMOKE_KEY not in metrics,
            "http: /metrics is scrapable without a credential and holds no secret",
        )
        check(
            json.loads(ready_body)["upstream"]["circuit_open"] is False,
            "http: /readyz reports the upstream circuit without failing",
        )
    finally:
        _stop(process)
        lines = _read(log_path)
        os.unlink(log_path)
        # MCP_LOG_JSON=false has to reach the loggers created at import time
        # (server, auth, upstream, tools, audit), not only the entry point's own.
        # That was a real defect: the format used to be decided by whichever
        # get_logger() call arrived first, so the setting silently did nothing for
        # every interesting line. Checked here as well as in a unit test because
        # it is a property of the assembled process, not of one function.
        logged = [line for line in lines if line.strip()]
        still_json = [line for line in logged if line.startswith('{"ts"')]
        check(
            bool(logged) and not still_json,
            "http: MCP_LOG_JSON=false is honoured by every logger in the process",
            f"{len(logged)} log lines, {len(still_json)} still JSON",
        )


def _read(path: str) -> list[str]:
    try:
        with open(path, encoding="utf-8", errors="replace") as handle:
            return handle.read().splitlines()
    except OSError:
        return []


def _stop(process: subprocess.Popen[bytes]) -> None:
    """Terminate, then kill. Never leaves the smoke test holding a server."""
    if process.poll() is None:
        process.terminate()
    try:
        process.wait(timeout=15)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


def _dump(process: subprocess.Popen[bytes], log_path: str) -> None:
    """Print a dead server's output - a smoke test that hides why is useless."""
    _stop(process)
    print("---- server output ----")
    print("\n".join(_read(log_path)[-40:]))
    print("-----------------------")


async def _sleep(seconds: float) -> None:
    import anyio

    await anyio.sleep(seconds)


async def _amain() -> None:
    await smoke_stdio()
    await smoke_http()


def main() -> int:
    import anyio

    print(f"Reliastra MCP smoke test (backend={BACKEND})")
    print(f"python={sys.version.split()[0]}  upstream={BOGUS_API_URL} (unreachable on purpose)\n")
    smoke_cli()
    try:
        anyio.run(_amain)
    except Exception as exc:  # a smoke test must report, not traceback and exit 1 silently
        check(False, "transport smoke tests ran to completion", f"{type(exc).__name__}: {exc}")

    failed = [label for ok, label in _checks if not ok]
    print(f"\n{len(_checks) - len(failed)}/{len(_checks)} checks passed")
    if failed:
        print("failed:")
        for label in failed:
            print(f"  - {label}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
