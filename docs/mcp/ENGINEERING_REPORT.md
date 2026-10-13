# MCP server — engineering report

Delivery report for the agent-native Reliastra MCP server. What was built, what
was verified by execution, what was found and fixed along the way, and what is
not done.

Date: 2026-10-13 · Branch: `arena/26d73be4-reliastra` · Base: `13b8f25`

## 1. Summary

A production-shaped MCP server at [`backend/mcp_server/`](../../backend/mcp_server/),
built on the official `mcp` 2.3.0 SDK, serving **stdio** and **Streamable HTTP**.
It is an HTTP client of the canonical Reliastra API and nothing else: no database,
no Celery, no restated business logic.

| | |
|---|---|
| Implementation | 9,100 lines across 23 modules |
| Tests | 6,057 lines, **430 tests**, all passing |
| End-to-end smoke | **18/18 checks** passing, real subprocesses, real SDK client |
| Whole-backend regression | **1,614 passed, 3 skipped** (baseline was 1,184) |
| Surface | 18 tools · 4 resources · 1 resource template · 4 prompts |
| Capability registry | 33 operations (18 public, 15 authenticated), each pinned to source |
| Protocol version | `2025-11-25` negotiated on both transports |
| Memory | 72.9 MB RSS idle, 74.6 MB after 40 calls, 1 thread |
| Packaging | `requirements-mcp.txt`, `pip install -e '.[mcp]'`, `ENABLE_MCP` gate |
| CI | new `mcp` job + the existing `test` job now installs the extra |

The starting point was a committed scaffold (15 registry entries, one tool, no
transport that ran). What is here now is a working server: it initializes, it is
exercisable by a compatible client, it refuses what it should refuse, and it says
what it does not know.

## 2. Verification — what was actually executed

Nothing below is inferred. Each line was run.

| Command | Result |
|---|---|
| `pytest tests/unit/mcp -q` | 430 passed |
| `python scripts/mcp_smoke.py` | 18/18 checks passed |
| `pytest tests/unit tests/integration -q` | 1,614 passed, 3 skipped |
| `pytest tests/unit tests/integration -q` *(baseline, before this work)* | 1,184 passed, 3 skipped |
| `python -m mcp_server --version / --check-config / --print-capabilities` | exit 0, no credential, no network |
| `ruff check mcp_server/ scripts/ tests/unit/mcp/` (correctness rules) | clean |
| `pip install --dry-run --report` on `.` vs `.[mcp]` | +10 packages, **0 version changes, 0 removals** |
| `app.openapi()` route table | 186 paths dumped and checked against the registry |
| RSS measurement of a running HTTP instance | 72.9 MB → 74.6 MB |

The smoke test is the one that matters most for the "is it actually usable"
question: it spawns `python -m mcp_server` as a real subprocess on **both**
transports and drives it with the SDK's own client — handshake, `tools/list`,
`resources/list`, `resource_templates/list`, `prompts/list`, a `tools/call`, the
401 path, `/healthz`, `/readyz`, `/metrics`, and the log-format contract. It needs
no infrastructure: the upstream is pointed at a port nothing listens on.

`ruff` on the whole repository reports 1,010 pre-existing errors and 419 files
that would be reformatted, which is why CI's ruff steps are non-blocking warnings.
The new code was not mass-reformatted (that would be an unrelated 30,000-line
diff); instead every rule that indicates a *defect* rather than a style preference
was driven to zero on the new files: unused imports and variables, unsorted
imports, blind exception assertions, useless expressions, mutable class defaults,
blocking calls inside async functions, `subprocess.run` without `check`.

## 3. What it exposes

**Tools (18).** Discovery (`reliastra_get_capabilities`); nine public observatory
and evidence tools that need no credential; four workspace tools scoped to the
caller's organization; `reliastra_analyze_dependencies` and
`reliastra_plan_integration`; and two state-changing tools.

**Resources (4 + 1 template).** `reliastra://capabilities`,
`reliastra://methodology`, `reliastra://limitations`,
`reliastra://integration-guide`, and the `reliastra://observatory/{provider}`
template.

**Prompts (4).** `assess_observability`, `investigate_failure`, `evaluate_fit`,
`plan_integration` — each carrying the rule that retrieved third-party text is
data, not instructions.

Three properties the brief asked for and that are worth calling out because they
are easy to fake and hard to get right:

- **`reliastra_analyze_dependencies` works only from a client-supplied inventory.**
  It never scans a repository, never infers dependencies, and it can and does
  return "Reliastra adds nothing here". 39 tests cover the verdict logic,
  including the cases where the honest answer is *no*.
- **`reliastra_plan_integration` uses only verified mechanisms.** CLI commands and
  flags are transcribed from `cli/cmd/reliastra/help.go`; endpoints from the real
  route table; the GitHub Action's inputs, outputs and exit codes from
  `action.yml` at tag `v1` of `ReliaAstra/reliastra-action`. It can now be asked
  for a `github_action` plan and will produce one, with the registration steps the
  action cannot perform itself. **This was not true of the first version of this
  server** — see §5.5.
- **Observed vs. reported vs. caller-failure vs. correlation vs. causation is
  preserved.** Incident and evidence results keep the distinction the product
  makes. The registry states that attribution is a deterministic weighted-signal
  *correlation* with a maximum reachable score of 55.0 without corroboration, and
  that it is **not** a validated causal model. That language was not softened
  anywhere.

## 4. Architecture decisions

Full reasoning in [ARCHITECTURE.md](ARCHITECTURE.md). The four that mattered most:

**Standalone process, not mounted into FastAPI.** Mounting the SDK's Starlette app
does not work — the SDK builds it with `lifespan=lambda app: session_manager.run()`
and Starlette does not run a mounted sub-app's lifespan, so every request fails
with `RuntimeError: Task group is not initialized`. Verified, not assumed. The
separate process turned out to be better anyway: independent scaling, an
independent dependency set, and no path by which an MCP defect takes down the API.

**Not an OAuth 2.1 resource server.** The SDK's `AuthSettings` path requires an
`issuer_url` and publishes `/.well-known/oauth-protected-resource`. Reliastra
operates no MCP authorization server, so publishing that metadata would direct
clients to endpoints that do not exist. Instead: a spec-shaped bearer gate
(401 + `WWW-Authenticate: Bearer error="invalid_token"`), the product's own API
key as the credential, and `TokenVerifier` retained as an async `(key) -> bool`
seam that fails closed when it raises.

**Failures are results, not protocol errors.** A failed call returns
`is_error=True` with a `category` an agent can branch on, rather than raising a
JSON-RPC error whose contents the agent never sees.

**Dependencies isolated, co-installation measured.** `mcp` is not in
`requirements.txt`. Before accepting that the production image would install both,
the resolve was diffed: `.[mcp]` adds ten packages and changes **no existing
version** — fastapi 0.143 already resolves to the pydantic and starlette versions
`mcp` asks for. With `mcp` present, all 1,184 pre-existing tests still pass. So
the image installs `.[mcp]` and `ENABLE_MCP` stays a runtime switch.

## 5. Defects found and fixed

Twenty-two distinct defects, in five groups. They are grouped by where they lived,
because the later groups matter more than the first: a bug in the implementation is
found by a test, but a bug in a *test* hides itself, a false claim in
*documentation* is the failure mode this task was explicitly meant to avoid, and a
**denied capability** (§5.5) is that same failure mode with the sign flipped.

### 5.1 In the implementation

| # | Defect | Consequence if unfixed |
|---|---|---|
| 1 | `ToolFailure` was a `@dataclass(frozen=True)` subclass of `Exception` | Raising it died with `FrozenInstanceError: cannot assign to field '__traceback__'`, so **every** structured failure collapsed to "Internal server error" and no agent could ever branch on a category |
| 2 | Log redaction used an exact-match key list | `report_token`, `X-API-Key` and similar leaked into logs. Now substring matching with `-`/`_` normalization |
| 3 | A presigned URL carried a credential in a **value** (`download_url: …?sig=SECRET`) | Invisible to any key-based redaction. Added `scrub_presigned_url`, applied inside `redact_secrets` |
| 4 | `audit_call` passed `name` in `extra=` | Collided with a `LogRecord` attribute; `logging` refuses the overwrite and reports it on stderr instead of raising, so the record vanished. **Mutations were not audited at all.** Now `_RESERVED_LOG_FIELDS` filtering, records `dropped_fields`, wrapped so it cannot raise |
| 5 | No `Host` allow-list configuration | Behind a reverse proxy every request answered **421 Misdirected Request**: the SDK enables DNS-rebinding protection on a loopback bind and allow-lists `127.0.0.1`/`localhost`/`[::1]` only, while Caddy forwards the public hostname. Added `MCP_HTTP_ALLOWED_HOSTS`/`_ORIGINS`, explicit `TransportSecuritySettings`, and a production fail-fast |
| 6 | Approval relied solely on MCP elicitation | On the modern protocol era the stateless HTTP transport builds contexts with `can_send_request=False`, so `ctx.elicit()` raises — **the two write tools were permanently unusable remotely**. Redesigned as `request_approval()` with three-tier precedence (see §6) |
| 7 | `MCP_LOG_JSON=false` did nothing | Module-level `get_logger("x")` runs at import time, before configuration exists, and the format was decided by whichever call arrived first. Only the entry point's own logger changed; every interesting line — including the audit trail — stayed JSON. Format and level are now process state, re-applied to every logger already handed out |
| 8 | `--transport streamable-http` and `MCP_HTTP_ENABLED` could disagree | The production fail-fast validators are gated on `mcp_http_enabled`. Setting the flag *after* loading config would have served a plaintext `0.0.0.0` listener with those checks never having run. The CLI now passes it as a `load_config` override, so validators run; an explicit `false` still wins |
| 9 | A 2xx body carrying a bare error envelope was parsed as data | The tool reported `ok: true` with an empty list — "nothing is monitored" when the truth was "you may not look". Such a body is now refused and raised, classified by the envelope's own code because the status is no evidence |
| 10 | A refused resource read lost its reason | The SDK does `raise UnexpectedResourceError(...) from exc`, keeping the cause server-side, so the caller sees a generic `-32603`. Cannot be fixed without hand-rolling the protocol; now logged as `resource_read_refused` with the category and reason, and documented as a limitation |

### 5.2 In the tests — false greens

These are the most serious findings in this report. Each one was a test that
passed while asserting nothing true.

| # | Defect | Why it mattered |
|---|---|---|
| 11 | `conftest.py`: `_envelope_error(self.api_key_status or 401, …)` with a default `api_key_status` of `200` | `200 or 401` is `200`. An invalid API key was answered with **HTTP 200 carrying an error body**, and the tool reported `ok: true` with an empty dependency list. Every test that relied on "wrong key → refused" was testing nothing. This is what produced defect 9 |
| 12 | `pytest.raises(Exception)` around a traversal-URI resource read | Passed for the wrong reason: the SDK's template matcher rejects `..%2f..%2fadmin` before it reaches `as_slug`, so the validation under test never ran. Now asserts `MCPError` and the specific code, parametrized over five URIs — two that never match the template (`-32602`) and three that reach the handler and are refused (`-32603`) |
| 13 | `assert fake.prompts == [] or True` | A tautology, in the test for the approval fallback — the security-critical path where a client advertises elicitation but has no back channel. It passed whatever the code did. Now asserts the real property: no elicitation was attempted |
| 14 | `test_rejection_body_never_echoes_the_credential` asserted 401 at `initialize` | Contradicted the design it was testing: the edge validates credential *shape* only, and `initialize` makes no API call (a neighbouring test asserts exactly that). A wrong-but-plausible key correctly completes the handshake and is refused on the first tool call. Rewritten to cover both real rejection paths and to assert the credential appears in neither |
| 15 | `test_production_loopback_bind_is_allowed` | Predated the 421 fail-fast and asserted that a misconfiguration was valid — a loopback production bind with no `MCP_HTTP_ALLOWED_HOSTS`, which 421s every request. Now asserts the refusal and the accepted shape |
| 22 | The test written for the new action step asserted `"uses: reliastra-action@v1" in yaml_text` | **Authored during this correction, and it passed.** The plan rendered `uses: reliastra-action@v1`, dropping the owner, because the ref was derived as `repository.rsplit("/", 1)[-1]`. GitHub cannot resolve that action, so the step the plan produced would have failed in the user's CI — and the test was written to match the output instead of the contract. Caught by reading the rendered YAML from a live call, not by any assertion. Fixed by adding a single `uses` value to the registry, deriving it from `owner/repo@ref`, and asserting the derivation rather than a literal. The lesson generalizes: a test written *after* seeing the output encodes the bug |

### 5.3 In the documentation — claims that were not true

| # | Claim | Reality |
|---|---|---|
| 16 | `config.py`: "Setting names are unprefixed-or-`MCP_` … both are accepted for the shared ones" | `MCP_LOG_LEVEL` and `MCP_RELIASTRA_API_URL` were **silently ignored**. Rather than delete the claim, it was made true: `settings_customise_sources` adds an `MCP_`-prefixed source above the plain one, so the prefixed spelling always wins and generic names like `LOG_LEVEL` cannot be set for this server by accident. Four tests, including that bounds are still enforced through the prefixed path and that `mcp_`-named fields take no double prefix |
| 17 | `load_config`: "environment still wins for anything not overridden" | The opposite — pydantic-settings ranks call-site arguments above every environment source. Corrected, and the real behaviour is what makes the suite deterministic on a machine with an ambient environment |

### 5.4 Registry scope error

| # | Finding |
|---|---|
| 18 | `GET /v1/incidents/{id}/evidence` requires **`read:evidence`**, not `read:incidents`. `_infer_scope` matches path substrings in order and `/evidence` is checked before `/incidents`. A scope inferred from the path shape would be wrong, and a key holding only `read:incidents` would get a 403 it could not explain. The contract test now asserts the registry against `_infer_scope` itself rather than against a reading of it |

### 5.5 A denied capability — the most serious defect here

| # | Finding |
|---|---|
| 21 | The registry asserted **"There is no Reliastra GitHub Action."** That is false. `ReliaAstra/reliastra-action` is a public repository, published at tags `v1` and `v1.0.0`, with a `node20` action, 13 inputs, 24 outputs and 8 exit codes. The root README of *this* repository documents it. |

The error came from a verification method that could not have worked. The check
performed was "no workflow in this repository contains `uses: reliastra/`". That
statement is true and irrelevant: the action lives in a **separate repository**, so
no grep of this one can find its definition. An absence of evidence inside the
wrong scope was reported as evidence of absence.

The scaffold in this repository already carried the claim, it was inherited
without being re-derived, and it was then amplified: 9 code sites (registry,
planning tool, capabilities tool, three prompts, two resources), 4 tests that
*asserted the falsehood*, and 4 documents that repeated it. `reliastra_plan_integration`
actively refused to recommend the one CI mechanism that actually ships, and
`reliastra://limitations` told agents it did not exist.

Why this matters as much as a fabricated capability. The governing rule is usually
read one way — do not claim Reliastra can do something it cannot. It binds in both
directions. An agent told the action does not exist will hand-roll a workflow step
with `curl`, a hand-parsed verdict and no `fail-on` semantics, and will get the
exit codes wrong; the published action already encodes them. A confident negative
is a fabricated capability with the sign flipped, and it is harder to catch because
nothing errors.

Corrected by transcribing `action.yml` at tag `v1`, adding `github_action` as a
selectable mechanism, and adding tests that pin the interface structurally: the
declared input and output sets must match exactly, the rendered YAML step may only
pass declared inputs, and the root README's snippet is compared against the
registry so the two documents cannot drift. The transcription immediately caught a
second error of my own — an output written as `observation_points` when
`action.yml` declares `observation-points`. A structural comparison surfaced it;
a prose assertion would have passed.

`LIMITATIONS` now records the true constraint: the action's interface cannot be
verified *from this codebase*, so the registry carries its provenance and a
re-verification date instead of implying it was read from source here.

The correction produced two further defects of its own, both recorded above rather
than left out because they happened late: a mis-transcribed output name
(`observation_points` for `observation-points`, caught by the structural comparison)
and an unresolvable `uses:` line whose test asserted the broken form (defect 22).

## 6. Two findings that changed the design

### Elicitation is not reliably available

The brief's requirement was explicit approval before a state change, and the
obvious mechanism is MCP elicitation — ask the human on the other end. Empirically,
on the modern protocol era (`2026-07-28`) the protocol forbids server-initiated
JSON-RPC requests, and both `_streamable_http_modern` and the stateless HTTP
session manager build contexts with `can_send_request=False`. `ctx.elicit()`
raises `NoBackChannelError`. Relying on elicitation alone made both write tools
permanently unusable on the remote transport — which is the transport that matters
for a hosted deployment.

`ToolContext.request_approval(action, summary, confirm_argument)` now resolves it
with deliberate precedence:

1. Elicit, when the client advertises the capability **and** the session can
   actually send a request. A human *decline* or *cancel* is final — it is not
   retried and `confirm=true` does not override it.
2. Otherwise, an explicit `confirm: true` tool argument. This works on every
   transport and protocol version, and it is what MCP clients gate with their own
   tool-approval UI (the tools are annotated `readOnlyHint=false`).
3. Anything else is a refusal naming the route that would work.

Route 2 is weaker than route 1 — an agent can set the flag itself — and the code,
the tool descriptions and [SECURITY.md](SECURITY.md) all say so rather than
presenting the fallback as equivalent. Route 1 is used whenever it exists.

### 421 Misdirected Request behind a reverse proxy

Not a bug in this server, but a deployment trap that would have produced a total,
silent outage. The SDK enables DNS-rebinding protection automatically for a
loopback bind and allow-lists loopback hosts only; Caddy preserves the public
`Host`. Every request 421s, and the server's own logs show nothing wrong. Now
`MCP_HTTP_ALLOWED_HOSTS` is required in production on a loopback bind, the
entrypoint validates the configuration with the server's own loader before
supervisord starts, and the failure message names the symptom ("421 Misdirected
Request") so it is recognizable.

## 7. Scaffold versus product

The committed scaffold (`13b8f25`) was treated as a claim to verify, not as a
description of reality. Where it disagreed with source, source won.

| Scaffold | Verified reality |
|---|---|
| 15 registry operations, `auth: True` boolean | 33 operations (18 public, 15 authenticated) with the actual scope each requires |
| 7 public endpoints listed | 18 exist and are public (`security: []` in the OpenAPI document): the scaffold omitted `/v1/pricing`, `/v1/billing/terms`, `/v1/checks/health`, `/v1/verify/keys`, `/v1/vendors/categories[/{slug}]`, vendor `/history`, `/incidents`, `/incidents/public`, and public-incident `/evidence[/versions/{n}]` |
| "API-key pass-through auth with **ContextVar** isolation" | Replaced. A credential held in a `ContextVar` set by middleware is a cross-request leak risk on a stateless transport if any reset is missed. It is now read from **that request's** `ctx.headers` on every call, so there is no request state to leak |
| No transport that ran | stdio and Streamable HTTP both work, verified by a real client |
| No resources, prompts, analysis, planning or mutation tools | All present |

The scaffold was **wrong** about one thing that is easy to get wrong, and the error
was inherited before it was caught: it claimed there is no Reliastra GitHub Action.
There is one — `ReliaAstra/reliastra-action@v1`, documented in this repository's own
README, living in a repository this codebase cannot grep. It is corrected in §5.5.
The lesson recorded there is about method, not about this one fact: a negative claim
must be verified in the scope where the thing would live.

Two claims in the scaffold's own docstrings were also checked rather than trusted:
that the credential is never stored on the shared client (true, and now enforced by
a test that asserts each upstream call carries its own key), and that rate limiting
is instance-local (true, and now documented as a limitation rather than a feature).

## 8. Packaging, configuration and deployment

| Change | File |
|---|---|
| Separate dependency file with the reasoning and the co-install evidence | `backend/requirements-mcp.txt` |
| `[project.optional-dependencies] mcp` | `backend/pyproject.toml` |
| Production image installs `.[mcp]` so `ENABLE_MCP` is a runtime switch | `Dockerfile` |
| 36 settings documented with defaults and reasons; contract-tested against `McpServerConfig` in both directions | `backend/.env.example` |
| `[program:mcp]`, `autostart=%(ENV_ENABLE_MCP)s`, priority 35, `stopwaitsecs=35`, measured memory cost | `deploy/supervisord-all.conf` |
| Exports `ENABLE_MCP` (default `false`), points at the in-container API, validates with the server's own loader, warns without blocking | `deploy/entrypoint.sh` |
| `api.{$DOMAIN}/mcp` → `reliastra-api:8765`, public `Host` preserved, `flush_interval -1` for streaming, named matcher so `/mcpanything` cannot reach the port | `deploy/production/Caddyfile` |
| `expose: 8765` on the internal network only | `deploy/production/compose.yml` |
| Six targets: `mcp-install`, `test-mcp`, `smoke-mcp`, `mcp-capabilities`, `mcp-check-config`, `mcp-stdio`; `lint` now covers `mcp_server/ scripts/` | `Makefile` |
| New `mcp` job (suite + contract test in isolation + smoke test + credential-free CLI checks); the `test` job installs `.[dev,mcp]` or it would fail at collection; ruff steps cover the new directories | `.github/workflows/ci.yml` |

Two deliberate choices worth stating:

- **`ENABLE_MCP` defaults to `false`.** Enabling it is an operator decision with a
  memory consequence on a 1.6 GB box whose `api` cgroup is capped at 768M and also
  holds the API, web, Celery and an internal Redis. The measured cost (72.9 MB) is
  documented at the point of decision rather than discovered during an OOM.
- **An invalid MCP configuration does not take the container down.** The entrypoint
  reports it and supervisord keeps the `mcp` program stopped while the API and web
  keep serving. An optional sidecar must not be able to fail the product.

## 9. Limitations

Everything here is also stated in the product-facing registry
(`reliastra://limitations`) where an agent will see it, not only in this report.

**Not verified**

- **No round trip against a live API.** Every upstream interaction in the suite is
  against a routing fake. The contract test reads the real route table and the real
  `_infer_scope`, so path and scope drift is caught — but a live deployment has not
  been exercised, because that needs credentials this repository does not contain.
  This is the single largest remaining gap and the first thing to do with a real key.
- **No third-party MCP client.** The handshakes are against the official Python
  SDK's own client. Compatibility with Claude Desktop, Cursor or Codex is **not
  claimed**. The negotiated protocol version is `2025-11-25` and the surface is
  standard, but no external client was run against it.
- **No load or soak testing.** Concurrency, admission control and the circuit
  breaker are tested for correctness at small scale, not for throughput. The RSS
  figures are one measurement on one machine.
- **The Docker image was not built.** The supervisord program, entrypoint
  validation and Caddy route are reviewed and consistent with the existing
  patterns, and the CI YAML parses, but no container was started.
- **The GitHub Action's interface is a point-in-time transcription.** It was read
  from `action.yml` at tag `v1` on 2026-10-13 and cannot be re-derived from this
  codebase, so upstream drift is invisible to this test suite. The tests pin the
  transcription against the root README's snippet, which catches the two documents
  disagreeing — not the action changing. If `reliastra-action` publishes new
  inputs, re-transcribe and bump `verified_against`.

**Deliberate omissions — 24 real routes that are not registered**

The registry describes what an agent can do, not everything the API has. Every
registered operation was verified to exist (zero fabrications: the contract test
diffs the registry against the real 215-route table). The converse is a scope
decision, and these are the routes left out, with the reason:

| Omitted | Why |
|---|---|
| `PATCH`/`DELETE /v1/dependencies/{id}` | Least privilege. Two writes are exposed — create a dependency, trigger a check. An agent is not given the ability to modify or destroy a monitoring target |
| `PATCH /v1/incidents/{id}`, `POST /v1/incidents/{id}/correlate` | Require `require_admin`, which an API key cannot satisfy. `correlate` *is* registered as a mutation operation with `mcp_tool=None` so an agent can see it exists and that it is not available to it; registering `PATCH` as callable would be a fabricated capability |
| `POST /v1/evidence/{id}/regenerate`, `POST /v1/evidence/publicize`, `GET /v1/evidence/stats`, `POST /v1/evidence/gate` | Writes and internal ingestion outside the two-write scope. `gate` is the observation-ingestion path, not an agent surface |
| `GET /v1/evidence/{report_token}/download` | Returns PDF bytes. MCP text content is the wrong channel for a binary artifact; the tool returns metadata, hashes and a download link with its signature scrubbed instead |
| 11 billing routes (`plan`, `transactions`, `invoice`, `receipt`, `checkout/quote`, `initialize`, `verify`, `cancel`, `resume`, `currency`, `webhook`) | An agent holding an API key should not read billing or initiate payments through this surface. The two public plan-context endpoints that *are* needed — `GET /v1/pricing` and `GET /v1/billing/terms` — are registered |
| `GET /v1/vendors/{name}/developer` | Maintainer-discovery contact information. Handing a person's contact details to an agent is a privacy decision, not a plumbing one, and it was not made here |
| `POST /v1/vendors/{name}/timeline/share`, `GET …/share.png` | The POST is a **public write** that mints a share token. A read-only observatory tool must not create resources nobody asked for — which the brief rules out explicitly |
| `GET /v1/pricing/fx-reference`, `GET /v1/public/referral/{code}`, `POST /v1/billing/webhook` | Not agent-relevant: an internal FX rate, a partner-referral resolver, and an inbound payment webhook |

None of these are hidden: `reliastra://capabilities` and
`reliastra_get_capabilities` describe the surface that *is* available, and
`reliastra://limitations` states what does not exist.

**Inherent**

- A refused resource read reports a generic `-32603`; the reason is in the server
  log, not on the wire (SDK behaviour, §5.1 #10).
- The instance-local rate limiter is not a substitute for gateway limiting.
- `confirm: true` is a weaker gate than a human answering an elicitation (§6).
- Attribution remains a deterministic weighted-signal correlation with a maximum
  reachable score of 55.0 without corroboration. Nothing here strengthens that
  claim, and the tools say so.

## 10. Recommended next steps

In priority order:

1. **Run the smoke test against a live deployment with a real key.** Point
   `RELIASTRA_API_URL` at staging, supply a read-scoped key, and extend
   `scripts/mcp_smoke.py` with an opt-in live mode. This closes the largest gap.
2. **Verify one third-party client.** Claude Desktop over stdio is the cheapest
   real-world check, and it would let the compatibility claim be made rather than
   withheld.
3. **Build the image and start the container with `ENABLE_MCP=true`.** Confirm the
   supervisord program, the entrypoint validation path, and the Caddy route
   end-to-end, and record actual container RSS against the 768M cap.
4. **Decide the production memory budget** before enabling it on the current box.
5. **Consider exposing `/history` and vendor `/incidents`** if agents ask for
   trend context; both are public and cheap to add through the existing pattern.
