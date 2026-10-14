# `mcp_server` — developer quick reference

The Reliastra MCP server. Operator and architecture documentation lives in
[`docs/mcp/`](../../docs/mcp/); this file is the short version for someone about
to change the code.

```bash
pip install -r requirements-mcp.txt     # separate from requirements.txt, on purpose
python -m mcp_server --transport stdio
python -m mcp_server --check-config
pytest tests/unit/mcp -q                # 427 tests, no DB, no network
python scripts/mcp_smoke.py             # real processes, real MCP client
```

## The rule that governs every change

**This server is an HTTP client of the canonical API and nothing else.**

No database, no ORM, no Celery, no restatement of a rule that lives in
`backend/app`. If you find yourself writing business logic here, you are writing
it in the wrong place — call the endpoint that already implements it. If the
endpoint does not exist, the capability does not exist, and the registry must say
so rather than imply otherwise.

## Before you add a capability

Ask, in this order:

1. Does a **documented endpoint** exist? Dump the real route table:
   `python -c "from app.main import app; import json; print(json.dumps(list(app.openapi()['paths']), indent=1))"`
   — 186 paths. If it is not there, it does not exist.
2. Is it **public** (`security: []` in the OpenAPI document) or does it need a
   scope? `app/api/deps.py::_infer_scope` decides, deny-by-default, by path
   substring. Read it; do not guess.
3. Does the **plan** allow it? `PLAN_FEATURES[plan]["api_access"]` gates all
   API-key traffic — it is a paid entitlement.
4. Add the operation to `capabilities.py` **and** a contract assertion in
   `tests/unit/mcp/test_capability_contract.py`. The registry is a transcription
   of the product; an unpinned transcription drifts into a lie an agent repeats.

## Adding a tool

1. `tools/<surface>.py` exposing `register(server, deps)`.
2. Add it to `ALL_MODULES` in `tools/__init__.py`.

`_base.register_tool` does the rest: schema generation from the signature, the
result envelope, error translation, timeout, admission control, metrics, audit.

Rules the existing tools follow:

- Return `dict[str, Any]`. A bare `dict` annotation is rejected by
  `structured_output=True`.
- Raise `err.invalid_input(...)` / `err.not_found(...)` / etc. — never return an
  error dict by hand.
- Validate path segments with `sanitization.as_slug` / `as_uuid` /
  `as_verification_id` / `as_positive_int`.
- **Never** accept an organization or tenant parameter. Cross-tenant access must
  be inexpressible, not merely discouraged.
- Use `ctx.client` for upstream calls. Do not construct an HTTP client.
- Anything that writes goes in `mutations.py`, behind `ctx.request_approval(...)`,
  audited with `audit_call(...)`.

## Things that will bite you

Recorded because each of these cost hours to find.

- **`ToolFailure` must stay a plain `Exception` subclass.** It was a frozen
  dataclass once; raising it died with `FrozenInstanceError: cannot assign to
  field '__traceback__'`, so *every* structured failure collapsed to "Internal
  server error".
- **`audit_call` must not pass a reserved `LogRecord` name in `extra=`.**
  `logging` refuses the overwrite and reports it on stderr rather than raising, so
  the record vanishes. `_RESERVED_LOG_FIELDS` filtering exists because mutations
  were silently not audited at all.
- **Redaction is substring-based, and it scrubs values too.** Exact key matching
  missed `report_token`; key matching of any kind misses a credential in a
  presigned URL's `?sig=`. Both are handled — do not "simplify" either.
- **The wrapper must set `__signature__` and `__annotations__`.** The SDK reads
  the first via `inspect.signature(..., eval_str=True)` and the second via
  `get_type_hints`. Setting one is not enough. Skip `VAR_KEYWORD`/`VAR_POSITIONAL`
  parameters or they become required schema fields.
- **`get_logger` clears `logger.disabled`.** Alembic's `fileConfig` disables
  loggers created at import time, and this repo runs alembic in its test session
  fixture. Without the clear, the audit trail disappears with no error anywhere.
- **Log format is process state.** Module-level `get_logger("x")` calls run at
  import time, before configuration exists. `configure_logging` re-applies to
  every logger already handed out; a per-call format flag cannot work.
- **Do not mount this app into FastAPI.** The SDK's lifespan is not run for a
  mounted sub-application: `RuntimeError: Task group is not initialized`.
- **An async fixture cannot hold a `Client`.** Setup and teardown run in different
  tasks; anyio cancel scopes are task-bound. Use the session-free harness, or keep
  the session inside one test body.
- **`caplog` sees nothing here.** `propagate=False`. Attach a handler to the
  logger you care about.
- **Behind a proxy, `MCP_HTTP_ALLOWED_HOSTS` is mandatory.** The SDK allow-lists
  loopback only and answers 421 to everything else; a proxy forwards the public
  Host. Production refuses to start without it.

## Layout

See [`docs/mcp/ARCHITECTURE.md`](../../docs/mcp/ARCHITECTURE.md) for the module
map, the dependency direction, and the reasoning behind the standalone process,
the bearer gate, and the pinned registry.
