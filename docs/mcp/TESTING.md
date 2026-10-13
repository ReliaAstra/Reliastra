# MCP server testing

How the suite is organized, how to run it, what it actually proves, and what it
does not.

## Running it

```bash
cd backend
pip install -r requirements-mcp.txt          # or: pip install -e '.[dev,mcp]'

pytest tests/unit/mcp -q                     # 430 tests, ~36 s
make test-mcp                                # same, from the repo root
make smoke-mcp                               # end-to-end, real processes + real client
```

No database, no Redis, no network, no credentials. The suite runs against a
routing fake of the canonical API.

The end-to-end smoke test is separate on purpose: it spawns the server as a real
subprocess on both transports and drives it with a real MCP client from the
official SDK. A protocol server whose wire behaviour is only ever exercised
through fakes has not been shown to work.

## Results

At the time of writing, both were executed, not assumed:

| | Result |
|---|---|
| `pytest tests/unit/mcp -q` | **430 passed** |
| `python scripts/mcp_smoke.py` | **18/18 checks passed** |
| `pytest tests/unit tests/integration` (whole backend, `mcp` installed) | **1593 passed, 3 skipped** |
| Regression baseline before this work | 1001 unit + 183 integration = 1184 |

1184 + 430 + ... — the whole-backend figure is the meaningful one: the existing
suite still passes unchanged with the MCP package installed in the same
environment. No existing test was disabled, weakened or deleted.

CI runs this in two places: the `test` job collects `tests/unit/mcp` as part of
the normal backend run, and the dedicated `mcp` job adds the contract test in
isolation (so registry drift is obvious in the summary) plus the smoke test.

## What each file covers

| File | Tests | Covers |
|---|---|---|
| `test_security.py` | 119 | Authentication, tenant isolation, secret leakage, SSRF, injection, prompt-injection resistance, approval gate, rate limiting, configuration fail-fast |
| `test_reliability.py` | 46 | Honest failure reporting, retries, circuit breaker, timeouts, concurrency, error mapping, caching, trace propagation |
| `test_planning.py` | 44 | `reliastra_plan_integration`: only verified mechanisms (REST, CLI, GitHub Action), no fabricated flags, inputs or actions; prerequisites the chosen mechanism cannot perform are still shown |
| `test_capability_contract.py` | 43 | The registry vs. the product: real route table, real `_infer_scope`, real methodology/plan/CLI literals, documented configuration, and the GitHub Action's interface transcribed from its own `action.yml` |
| `test_protocol.py` | 39 | MCP wire behaviour: tools, resources, templates, prompts, structured output, approval over a real client session |
| `test_analysis.py` | 39 | `reliastra_analyze_dependencies`: client-supplied inventory only, honest "you do not need this" verdicts |
| `test_tools.py` | 37 | Per-tool behaviour across the read surfaces |
| `test_transport_http.py` | 34 | The real ASGI app over Streamable HTTP: handshake, 401/429/421, unauthenticated operational endpoints, per-request credential isolation |
| `test_mutations.py` | 29 | The two state-changing tools: approval, idempotency, audit, SSRF preflight, kill-switch |
| `conftest.py` | — | The routing fake API, fixtures, and the call harness |

## The harness

### A routing fake, not a mock

`FakeReliastraAPI` routes by path and method the way the real API does, and
supports failure injection: `inject(path, *outcomes)` serves a queue then routes
normally, `fail_always(path, outcome)` never runs out (an outage test whose queue
exhausts would silently become a success test). It can force an authenticated
status, flip pipeline health, remove evidence, and degrade verification.

Its error envelope mirrors `app/platform/web/errors.py` verbatim — same status →
code map, same `HTTP_ERROR` fallback — because a fake that drifts from the real
envelope teaches the server nothing.

### Two ways to call a tool

Most tests use a **session-free** harness: `server.call_tool(name, args,
make_context(server))`. It is fast, deterministic, and gives direct access to the
structured result.

Tests that assert *protocol* behaviour use a real `Client(server)` session — an
in-process handshake against the actual SDK. Those are kept **inside a single test
body**, never in a fixture (see below).

`test_transport_http.py` goes further and runs the real ASGI application with its
lifespan started, over an in-process HTTP transport, so the session manager is
genuinely running.

## Hazards recorded so nobody rediscovers them

These all cost real time and are written down where the next person will see them.

**An async fixture that opens a `Client` cannot tear down.** Fixture setup and
teardown run in different tasks, and anyio's cancel scopes are task-bound:
`RuntimeError: Attempted to exit cancel scope in a different task than it was
entered in`. Hence the session-free harness, with real sessions confined to test
bodies.

**`caplog` cannot see these loggers.** They are configured with
`propagate=False`, so records never reach the root logger pytest captures. Tests
that assert on the audit trail attach a handler to
`mcp_server.tools._base.audit_log` directly.

**Alembic disables loggers.** `tests/conftest.py`'s session-scoped autouse fixture
runs migrations, and `app/db/migrations/env.py` calls `logging.config.fileConfig`,
whose default `disable_existing_loggers=True` silently mutes every logger created
at import time. `get_logger` clears `logger.disabled` on every call, and the audit
fixture re-enables it too.

**Mounting the MCP app into FastAPI fails.** The SDK's app carries a lifespan that
Starlette will not run for a mounted sub-application: `RuntimeError: Task group is
not initialized`. For ASGI tests, enter `app.router.lifespan_context(app)`
manually — which is what `http_stack` does.

**`pytest.raises(Exception)` produced a false green.** A test asserting that a
traversal URI was refused passed for the wrong reason: the SDK's template matcher
rejected the URI before it ever reached the validation under test. It now asserts
`MCPError` and the specific JSON-RPC code, and parametrizes over URIs that
genuinely reach the handler. The same class of defect — an assertion that cannot
fail — was found a second time as `assert fake.prompts == [] or True`, a
tautology in the approval-fallback test. Both are fixed.

**A fixture bug turned an invalid credential into a success.** `_envelope_error(
self.api_key_status or 401, ...)` with a default `api_key_status` of `200`
returned HTTP 200 carrying an error body, and the tool reported `ok: true` with an
empty list. Two fixes: the fixture now always produces an error *status*, and the
upstream client refuses a 2xx whose body is nothing but an error envelope, because
"nothing is monitored" and "you may not look" are different statements and only
one of them was true.

## What is not covered

Stated plainly rather than left to be discovered:

- **No live API.** Every upstream interaction is against the fake. Real-response
  shape drift would be caught by the contract test (which reads the real route
  table and the real `_infer_scope`), but not by an actual round trip. Running the
  smoke test against a real deployment with a real key is the remaining step, and
  it needs credentials this repository does not contain.
- **No real MCP client other than the SDK.** The handshakes are against the
  official Python SDK's own client. Compatibility with Claude Desktop, Cursor or
  Codex is *not* claimed — protocol version `2025-11-25` is negotiated and the
  surface is standard, but no third-party client was exercised.
- **No load or soak testing.** Concurrency and admission control are tested for
  correctness at small scale, not for throughput. The RSS figures are a single
  measurement on one machine, not a distribution.
- **No test runs the Docker image.** The `[program:mcp]` wiring, the entrypoint
  validation and the Caddy route are reviewed and consistent with the existing
  patterns, but they have not been exercised in a built container.
- **`e2e` tests are not MCP-aware.** `backend/tests/e2e` covers the API; nothing
  there drives the MCP surface.
