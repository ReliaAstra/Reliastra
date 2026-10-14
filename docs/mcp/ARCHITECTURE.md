# MCP server architecture

How [`backend/mcp_server/`](../../backend/mcp_server/) is put together, the
decisions behind it, and how to extend it. 8,757 lines of implementation, 5,878
lines of test.

## The one decision that shapes everything

**This server is an HTTP client of the canonical Reliastra API and nothing else.**

No database driver, no ORM import, no DSN in the configuration schema, no Celery,
no business logic. Every tool either reads the local verified capability registry
or makes an HTTP call to a documented endpoint.

That single constraint buys four properties that would otherwise each need their
own machinery:

- **Authorization cannot be bypassed.** There is no internal table to query "just
  because it's easier", so scope, plan entitlement and tenant pinning are
  enforced by the code that already enforces them, once.
- **Business logic cannot drift.** A rule that lives in `backend/app` cannot be
  subtly misrestated here, because it is not restated here at all.
- **It scales and deploys independently.** Stateless, no shared state, no
  migrations, nothing to coordinate.
- **It is testable against a fake.** `tests/unit/mcp/conftest.py` routes a fake
  API by path; the whole suite runs with no database and no network.

The cost is real and accepted: an extra network hop, and a dependency on the API
being up. Both are handled explicitly (retries, circuit breaker, honest failure
reporting) rather than avoided.

## Module layout

```text
mcp_server/
├── __init__.py          version, layout doc
├── __main__.py          argparse entry point: --transport, --check-config,
│                        --print-capabilities, --version
├── config.py            McpServerConfig: validated env config, production fail-fast
├── errors.py            ToolFailure + the category taxonomy
├── observability.py     Prometheus metrics, JSON logs, secret redaction, W3C trace
├── sanitization.py      slug/uuid/id/int validation, redaction, untrusted-content notice
├── cache.py             PublicCache — bounded TTL cache for PUBLIC data only
├── upstream.py          ReliastraClient — the single API boundary
├── auth.py              Credential, transport gate, rate limiter, token_verifier seam
├── capabilities.py      the verified capability registry (pinned to backend source)
├── resources.py         4 MCP resources + 1 template
├── prompts.py           4 MCP prompts
├── server.py            composition root: create_server, build_http_app, run_stdio/http
└── tools/
    ├── __init__.py      ALL_MODULES — the extension point
    ├── _base.py         ToolContext, ServerDeps, envelope, approval, admission, audit
    ├── capabilities.py  reliastra_get_capabilities
    ├── observatory.py   public provider catalog, metrics, timeline, pipeline health
    ├── incidents.py     public + workspace incidents, evidence retrieval
    ├── evidence.py      evidence reports, verification
    ├── workspace.py     your dependencies and observations
    ├── analysis.py      reliastra_analyze_dependencies
    ├── planning.py      reliastra_plan_integration
    └── mutations.py     the two state-changing tools + SSRF preflight
```

Dependency direction is one-way: `tools/*` → `_base` → `upstream`/`auth`/`errors`/
`observability`/`sanitization`/`cache`. `server.py` composes; nothing imports it
except `__main__` and the tests.

## Composition

`create_server(config, *, transport_override=None, allow_mutations=None)` returns
`(MCPServer, ServerDeps)`. `ServerDeps` holds the shared client, config, cache,
limiter, admission control and metrics — one instance per process, passed by
reference into every tool closure. `build_http_app(server, deps)` wraps it in the
auth middleware and adds the unauthenticated operational routes.

Nothing is a module-level global. That is what makes the tests able to inject a
fake transport without patching, and what makes two servers in one process
possible (the test suite does exactly that).

## Decisions worth knowing

### Standalone process, not mounted into FastAPI

Mounting the SDK's Starlette app into the existing FastAPI application **does not
work**, and this was verified rather than assumed. The SDK builds it with
`lifespan=lambda app: session_manager.run()`, and Starlette does not run a mounted
sub-application's lifespan — so the session manager never starts and every request
fails with `RuntimeError: Task group is not initialized`.

A separate process was the answer, and it turned out to be the better design
anyway: independent scaling, an independent dependency set, and no way for an MCP
defect to take down the API.

### Streamable HTTP, never HTTP+SSE

SSE is the legacy transport. Only stdio and Streamable HTTP are offered, and
`--transport` accepts exactly those two values.

### Not an OAuth 2.1 resource server

The SDK's `token_verifier` + `AuthSettings` path requires `issuer_url` and
`resource_server_url`, and enables it publishes
`/.well-known/oauth-protected-resource` naming an authorization server. Reliastra
operates no such server. Publishing that metadata would send clients to discover
endpoints that do not exist — a fabricated capability in the one place the
protocol expects precision.

Instead: a spec-shaped bearer gate (401 + `WWW-Authenticate: Bearer
error="invalid_token"`), the product's own API key as the credential, and
`TokenVerifier` kept as an async `(key) -> bool` seam for a deployment that does
have an authoritative validator. Tested, including that it fails closed when it
raises.

### Failures are results, not exceptions

A tool returns `CallToolResult(is_error=True, structured_content=…)` with a
`category` rather than raising a JSON-RPC error. An agent can branch on
`error.category == "upstream_timeout"` and retry; it cannot branch on a protocol
error it never sees the inside of. This is also the spec-preferred shape.

Getting here required fixing a defect that made *every* structured failure
collapse to "Internal server error" — see
[ENGINEERING_REPORT.md](ENGINEERING_REPORT.md).

### The capability registry is transcribed, then pinned

`capabilities.py` is a transcription of the deployed product: paths, methods,
scopes, methodology weights and thresholds, plan limits, CLI commands, exit codes,
environment variables. A transcription that drifts becomes a lie an agent repeats
to a user, so `tests/unit/mcp/test_capability_contract.py` checks it against
source:

- every claimed path and method against `app.openapi()`'s real route table
  (186 paths);
- every claimed scope against `app/api/deps.py::_infer_scope` itself;
- methodology literals against `app/modules/attribution`, `evidence_gate`,
  `checks`;
- plan and pricing literals against `app/platform/commercial/entitlements.py`;
- CLI commands, flags, exit codes and env vars against
  `cli/cmd/reliastra/help.go`;
- negative claims — that unmounted B2B routers are absent, that the OpenAPI
  schema is not published;
- the GitHub Action's inputs, outputs and exit codes against `action.yml` at tag
  `v1` of `ReliaAstra/reliastra-action`. This is the one entry that cannot be
  verified from this repository, because the action lives in another one. The
  registry therefore records *where and when* it was transcribed, and a test
  compares the root README's workflow snippet against the declared inputs so the
  two documents cannot drift apart silently.

This follows a convention the repository already set:
`frontend/src/lib/product-contract.ts` and its test transcribe backend constants
and fail on drift. The motivating bug there was a homepage rendering
`attribution: external_dependency`, a classification the engine cannot produce.
Same failure mode, same remedy.

### Caching is structurally incapable of leaking

`PublicCache` refuses to store any path that is not in an explicit public
allow-list — it is not a cache with a rule bolted on, it is a cache that cannot
hold tenant data. Liveness, verification and evidence reads bypass it even when
public, because a cached "healthy" or a cached "verified" is a stale claim about
the present.

### Observability reuses the backend's conventions

`reliastra_mcp_*` Prometheus metrics; single-line JSON logs; W3C `traceparent`
joined (not replaced) and propagated upstream. The trace format is
contract-tested against `app/platform/observability/tracing.py::parse_traceparent`
so the two cannot drift. The SDK's OpenTelemetry middleware is registered and is a
no-op until an OTel SDK is configured — no new dependency, no forced exporter.

`get_logger` clears `logger.disabled` on every call. `logging.config.fileConfig`
defaults to `disable_existing_loggers=True`, and this repository runs alembic,
which calls it (`app/db/migrations/env.py`). An MCP server imported into such a
process would otherwise stop logging entirely — **including its audit trail** —
with no error anywhere.

## Extending it

Add a tool:

1. Write `tools/<surface>.py` exposing `register(server, deps)`.
2. Add the module to `ALL_MODULES` in `tools/__init__.py`.

Nothing else changes. Registration, argument-schema generation, the result
envelope, error translation, timeout, admission control, metrics and audit are all
applied by `tools/_base.register_tool`, which wraps the function and projects its
signature so the SDK derives the schema from the type hints.

Conventions a new tool should follow:

- Return `dict[str, Any]` (or a Pydantic model). A bare `dict` is rejected by
  `structured_output=True` as not serializable.
- Take identifiers as validated types; run path segments through `sanitization`.
- Never accept an organization or tenant parameter.
- Raise `err.*` helpers rather than returning an error dict; `_base` turns it into
  the envelope.
- If it changes state, put it in `mutations.py`, gate it with
  `ctx.request_approval(...)`, and audit it with `audit_call(...)`.

Two wrapper details that cost hours to find and are recorded so nobody repeats
it: the projected signature must set **both** `wrapper.__signature__` (used by
`func_metadata`) **and** `wrapper.__annotations__` (used by
`find_context_parameter`), and `VAR_KEYWORD`/`VAR_POSITIONAL` parameters must be
skipped or they become bogus required schema fields.

## Performance and limits

Measured on the deployed shape (one process, one thread):

| | |
|---|---|
| RSS idle | 72.9 MB |
| RSS after 40 tool calls | 74.6 MB (no growth — no per-caller state) |
| Per-call timeout | `MCP_TOOL_TIMEOUT_S`, default 30 s, covers retries |
| Concurrency | `MCP_MAX_INFLIGHT_REQUESTS`, default 32, plus a bounded queue |
| Upstream response cap | 4 MB, refused rather than truncated |
| Request body cap | 1 MB, enforced by the SDK before any handler runs |
| Result list cap | 50 items, truncation reported |
| Cache | 512 entries, 60 s TTL, public paths only |
