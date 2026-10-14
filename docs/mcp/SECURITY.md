# MCP server security

Threat model and controls for [`backend/mcp_server/`](../../backend/mcp_server/).
Every claim here is asserted by a test in
[`backend/tests/unit/mcp/`](../../backend/tests/unit/mcp/); the mapping is in
[TESTING.md](TESTING.md).

## Trust model

Three parties, none of which trusts the others:

| Party | Trusted to | Not trusted to |
|---|---|---|
| **The agent / MCP client** | Ask questions | Decide authorization, see another tenant's data, write without approval |
| **This server** | Translate MCP calls into API calls, refuse malformed input, report honestly | Decide scope, plan entitlement or tenant membership |
| **The Reliastra API** | Be the sole authority on data, authz, scope, plan, org | — |

The consequence that shapes everything else: **this server makes no authorization
decision of its own.** It has no database, so it cannot look up a role; it has no
scope table, so it cannot invent one. It forwards a credential and reports what
the API says. A tool that "worked" is a tool the API authorized.

Untrusted data flows the other way too. Provider descriptions, incident notes and
evidence payloads are third-party text. They are labelled as untrusted in every
result (`meta.untrusted_content`) and every prompt carries the rule that such text
cannot authorize an action, change a policy, or request another tool call.

## Threat model

| # | Threat | Control | Test |
|---|---|---|---|
| 1 | Unauthenticated remote access | Transport gate refuses before the protocol layer: 401 + spec-shaped `WWW-Authenticate: Bearer`. No bypass path, no flag to disable it | `test_missing_credential_is_rejected_at_the_edge`, `test_malformed_credentials_are_rejected` (7 shapes) |
| 2 | Cross-tenant read | Credential is read from **that request's** `Authorization` header (`ctx.headers`), never stored on the shared client or in a module global. Stateless HTTP means consecutive requests belong to different tenants | `test_each_request_uses_its_own_bearer_credential`, `test_no_credential_leaks_between_sequential_requests` |
| 3 | Cross-tenant write via an id parameter | Tools accept no organization parameter — cross-tenant access is not expressible. Another tenant's record id is reported as `not_found`, indistinguishable from missing | `test_security.py` tenant-isolation section |
| 4 | Privilege escalation by querying internal tables | Structurally impossible: no DB driver, no ORM import, no DSN in the config schema | `test_capability_contract.py` (registry vs. real route table) |
| 5 | Credential leakage into logs | Substring-based deny-list with `-`/`_` normalization, so `report_token` and `X-API-Key` are caught, not just exact names. Plus value-level scrubbing for credentials in a URL query | `test_json_log_formatter_redacts_secret_keys` (13 names), `test_secret_values_are_redacted_by_substring_not_exact_key_match` |
| 6 | Credential leakage into tool output | Presigned download URLs have signature-bearing query parameters stripped, keeping the base URL useful and the secret gone | `test_presigned_url_signature_is_scrubbed_from_a_value` |
| 7 | Credential leakage into errors | Upstream 401/403 bodies are never echoed; the caller gets a fixed safe sentence plus the API's public error code. The rejection response never contains the credential | `test_auth_failure_does_not_echo_the_credential_or_detail`, `test_rejection_body_never_echoes_the_credential` |
| 8 | SSRF via a monitoring target | `preflight_endpoint_url` refuses non-HTTP schemes, embedded credentials, whitespace, over-long values, `localhost`/`.local`/`.internal`/`.lan`/`.corp`/`.home`, cloud metadata names, and private/loopback/link-local/reserved/multicast/unspecified addresses. Same boundary the real probe enforces, applied early | `test_security.py` SSRF section |
| 9 | Path traversal / host substitution via a URI segment | `as_slug`, `as_uuid`, `as_verification_id` accept only the shapes the API itself uses; `/`, `?`, `#`, `:`, `..` and whitespace are refused | `test_provider_resource_refuses_a_traversal_slug` (5 URIs) |
| 10 | Prompt injection via retrieved content | Untrusted-content notice on every result; the rule encoded in all 4 prompts; no tool acts on retrieved text | `test_prompts_encode_the_untrusted_content_rule` |
| 11 | Unauthorized state change | Approval gate, fail-closed (below). `MCP_ALLOW_MUTATIONS=false` removes the tools from `list_tools` entirely | `test_mutations.py` (29 tests) |
| 12 | Duplicate write from an agent retry | Deterministic `Idempotency-Key` derived from the caller fingerprint + canonical payload; the API additionally scopes its idempotency cache to the credential | `test_mutations.py` idempotency tests |
| 13 | DNS rebinding against the HTTP listener | The SDK's Host/Origin validation is configured explicitly via `MCP_HTTP_ALLOWED_HOSTS` / `MCP_HTTP_ALLOWED_ORIGINS` | `test_dns_rebinding_protection_rejects_a_foreign_host` (421) |
| 14 | Plaintext credential hop | Production + non-loopback bind without `MCP_ALLOW_INSECURE_BIND` exits at startup | `test_production_non_loopback_bind_is_refused` |
| 15 | Unbounded resource use | Body-size cap, response-size cap, result-item cap, per-call timeout, concurrency semaphore with a bounded queue, instance-local rate limiter, bounded cache | `test_reliability.py`, `test_transport_http.py` |
| 16 | Poisoned cache serving stale safety claims | `PublicCache` structurally refuses any non-public path; liveness, verification and evidence reads bypass it even when public | `test_cache_refuses_to_store_a_non_public_path`, `test_liveness_endpoints_are_never_cached` |
| 17 | Open redirect / metadata publication | No `/.well-known/oauth-protected-resource` is served: Reliastra operates no MCP authorization server, and publishing one would send clients to endpoints that do not exist | `test_security.py` auth section |

## Authentication

### Remote (Streamable HTTP)

Every request must carry `Authorization: Bearer rel_...`. The gate runs as
Starlette middleware **before** the MCP protocol layer, so an unauthenticated
caller receives a plain HTTP 401 rather than a JSON-RPC error:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token", error_description="Provide a Reliastra API key: Authorization: Bearer rel_..."
```

Accepted shapes are exactly the ones `app/api/deps.py::extract_api_key` accepts
(`Bearer rel_...`, `ApiKey rel_...`, bare `rel_...`). `X-API-Key` is deliberately
**not** accepted on the transport: the MCP authorization model is bearer, and
supporting a second shape widens the edge for no benefit — the key is forwarded to
the API as `X-API-Key` regardless of how it arrived.

The edge validates **shape only** (`rel_` prefix, 12–256 chars, alphanumeric plus
`-`/`_`, no whitespace or newlines). That is a cheap filter, not an authorization
decision. Validity, scopes, plan entitlement and organization membership are the
API's call, made on every request — so a revoked key stops working immediately and
nothing about a key's validity is ever cached.

A header that is present but malformed is reported as *unauthenticated*, and the
raw value is never echoed back.

`token_verifier` is the documented seam for a deployment that has an authoritative
validator (an introspection endpoint, a JWT with JWKS). It is called at the edge
and can reject before any tool runs. If it raises, the request is **refused** — a
broken validator must not become an open door.

### Local (stdio)

The key comes from `RELIASTRA_API_KEY` in the process environment, which is the
protocol's environment-based credential guidance for a locally-spawned server.
Without it, public tools work and authenticated tools fail closed with
`unauthenticated`.

## State changes

Two tools change state: `reliastra_register_dependency` and
`reliastra_trigger_check`. They are registered in a separate module, are annotated
`readOnlyHint=false`, and are removed from `list_tools` entirely when
`MCP_ALLOW_MUTATIONS=false` — an agent cannot discover a tool that is not there.

`ToolContext.request_approval` is fail-closed, with deliberate precedence:

1. **Elicitation**, when the client advertises the capability *and* the session
   can actually send a server-initiated request. A human *decline* or *cancel* is
   **final**: it is not retried, and `confirm=true` does not override it.
2. Otherwise, an explicit `confirm: true` tool argument. This is the route that
   works on every transport and protocol version, and it is what MCP clients gate
   with their own tool-approval UI.
3. Anything else is a refusal whose message names the route that would work.

Route 2 is weaker than route 1 — an agent could set the flag itself — which is why
the tool descriptions state what the flag means and why route 1 is preferred
whenever it exists. This is not a theoretical concern: see the back-channel
finding in [ENGINEERING_REPORT.md](ENGINEERING_REPORT.md). On the modern protocol
era, the stateless HTTP transport builds contexts with `can_send_request=False`,
so elicitation is **unavailable** there and route 2 is the one that runs.

Every attempt is audited — successes, declines and failures alike, because a log
that only shows writes that landed cannot answer "did anything try?". The audit
record carries identifiers and outcome, never a payload.

Writes are never retried by this server. A safe repeat is the API's
`Idempotency-Key` mechanism, not a second attempt at a side effect.

## Multi-tenancy

`app/api/deps.py::get_current_org` pins the organization to `api_key.org_id`; a
mismatched `X-Organization-ID` header is a 403. This server therefore exposes no
organization parameter at all — there is no way to express "someone else's data".
`_infer_scope` is deny-by-default by path, so surfaces it does not recognize are
unreachable with an API key (webhooks, feed, admin, identity). The registry
reproduces that mapping and the contract test asserts it against the real
function, including the ordering subtlety that
`/v1/incidents/{id}/evidence` requires `read:evidence`, not `read:incidents`.

## Rate limiting and admission

Two layers, both instance-local by design:

- **Edge limiter** — sliding window per credential fingerprint (`HMAC-SHA256`
  with a per-process salt, truncated; not reversible, does not survive restart,
  and cannot be used as a key oracle from a leaked log line). Unauthenticated
  public reads are bucketed per client IP. 429 + `Retry-After`.
- **Admission control** — bounded concurrency (`MCP_MAX_INFLIGHT_REQUESTS`,
  default 32) with a bounded waiting queue. Past the queue a call is refused with
  a retryable `concurrency` failure rather than queued behind work that may never
  finish.

A fleet needs gateway-level limiting in front; the API applies its own limits
(`rl_apikey` 1000/min, `rl_vendor` 300/min) regardless. Note that the API's
limiter is **fail-open** by design (`app/platform/web/rate_limit.py`) — this one
is not.

## Input and output hygiene

- Tool arguments are validated by Pydantic schemas generated from the function
  signatures; path segments go through `as_slug` / `as_uuid` / `as_verification_id`
  / `as_positive_int` before they reach a URL.
- Lists are capped (`MCP_MAX_RESULT_ITEMS`, default 50) so one call cannot put
  megabytes into an agent's context window. Truncation is reported, never silent.
- Upstream response bodies are never echoed. Only the backend's public
  `{"error": {"code", "message"}}` fields pass through; everything else is
  replaced by a category.
- A response larger than `MCP_UPSTREAM_MAX_RESPONSE_BYTES` is **refused, not
  truncated**.
- A 2xx carrying a bare error envelope is treated as a failure, not parsed as an
  empty result (see the fixture bug in
  [ENGINEERING_REPORT.md](ENGINEERING_REPORT.md)).
- Provenance headers are allow-listed (`etag`, `x-reliastra-*`, `x-request-id`,
  `cache-control`, `retry-after`); anything else is dropped.

## What this does not defend against

Stated plainly, because an unstated gap is worse than a known one:

- **A caller's own credential misuse.** If an agent holds a valid `write:*` key,
  it can write. The approval gate and the audit trail exist to make that visible
  and reversible, not to prevent it. Give agents read-scoped keys
  (`read:checks,read:incidents,read:evidence,read:dependencies` — the CLI's
  default) unless a write is genuinely needed.
- **Compromise of the host running the server.** stdio inherits the environment;
  a compromised host has the key.
- **Denial of service at fleet scale.** Instance-local limiting slows one caller
  per instance; it is not a substitute for a gateway.
- **A malicious upstream.** If the Reliastra API itself were compromised, this
  server would faithfully report what it returned. Evidence artifacts are signed
  (Ed25519 when configured) and `reliastra_verify_evidence` exists so a consumer
  can check independently rather than trust this server.
