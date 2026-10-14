"""Evidence tools — the frozen artifact and its independent verification.

Two different things, kept strictly apart because confusing them is how a false
claim gets made:

``reliastra_get_incident_evidence``
    The frozen evidence document for a public incident. Immutable once written,
    content-hashed, version-pinnable. This is the artifact a third party audits.

``reliastra_verify_evidence``
    The public verification record for an artifact, addressed by an unguessable
    id. ``GET /v1/verify/{id}`` **re-derives** the verdict from the stored payload
    on every request rather than echoing stored columns, so a tampered row cannot
    pass. A check that could not run is reported as ``null``, never as a pass.

Byte-fidelity caveat, stated in every response: this server returns a parsed JSON
*view* of an artifact. The authoritative bytes live at the artifact URL and are
what ``data_hash`` covers. Re-serialising a parsed document need not reproduce
those bytes, so a caller who wants to check a hash must fetch the URL — and this
tool says so rather than letting a hash mismatch look like tampering.
"""

from typing import Any

from .. import errors as err
from ..sanitization import as_uuid, as_verification_id
from . import _base as base

#: Above this, the parsed artifact view is omitted rather than truncated: cutting
#: a hash-covered document in half produces something that neither hashes nor
#: reads correctly, and silently doing that would be worse than not returning it.
MAX_ARTIFACT_BYTES = 512 * 1024

_HASH_FIDELITY_NOTE = (
    "This is a parsed JSON view of the artifact, for reasoning. The authoritative "
    "bytes are served at the artifact URL and are what data_hash covers; "
    "re-serialising this view need not reproduce them. To check a hash, fetch the "
    "URL directly or use reliastra_verify_evidence, which re-derives the verdict "
    "server-side."
)


async def get_incident_evidence(
    ctx: base.ToolContext,
    incident_id: str,
    version: int | None = None,
) -> dict[str, Any]:
    """The frozen evidence artifact for one public incident."""
    record_id = as_uuid(incident_id, field_name="incident_id")
    if version is not None:
        if isinstance(version, bool) or not isinstance(version, int) or version < 1:
            raise err.invalid_input("version must be a positive integer.")
        path = f"/v1/public/incidents/{record_id}/evidence/versions/{version}"
        source = f"GET {path}"
    else:
        path = f"/v1/public/incidents/{record_id}/evidence"
        source = f"GET {path}"

    body, freshness, absent = await _fetch_artifact(ctx, path)
    headers = freshness.get("upstream_headers", {})
    provenance = {
        "data_hash": headers.get("etag", "").strip('"') or None,
        "version": _int_or_none(headers.get("x-reliastra-evidence-version")),
        "artifact_schema_version": headers.get("x-reliastra-artifact-schema-version"),
        "methodology_version": headers.get("x-reliastra-methodology-version"),
        "cache_control": headers.get("cache-control"),
        "pinned": version is not None,
    }

    notes = [
        _HASH_FIDELITY_NOTE,
        "A frozen artifact never changes. Pin a version to cite exact bytes; the "
        "unpinned 'latest' URL moves when a new freeze is written.",
        "Absence of an artifact (404) means the freeze processor has not produced "
        "one - not that the incident is unverifiable, and not that the incident "
        "did not happen. The detection record stands on its own.",
    ]

    if absent:
        # Reported as a successful answer whose content is "there is no artifact
        # yet". Raising not_found here would be technically right and practically
        # misleading: an agent would read a tool error as "this evidence does not
        # exist / cannot be verified", which is not what a 404 on this route means.
        return base.envelope(
            "reliastra_get_incident_evidence",
            {
                "artifact": None,
                "available": False,
                "reason": (
                    "No frozen evidence artifact exists for this incident yet. The "
                    "freeze processor writes one shortly after an incident "
                    "transitions; absence here is timing, not unverifiability."
                ),
                "provenance": provenance,
                "incident_record_available_via": "reliastra_get_public_incident",
            },
            ctx,
            source=source,
            freshness=freshness,
            notes=notes,
        )

    raw = _serialize(body)
    oversized = len(raw) > MAX_ARTIFACT_BYTES
    data: dict[str, Any] = {"available": True, "provenance": provenance}
    if oversized:
        data["artifact"] = None
        data["artifact_omitted"] = {
            "reason": (
                f"The artifact is {len(raw)} bytes, above this server's "
                f"{MAX_ARTIFACT_BYTES}-byte view limit."
            ),
            "authoritative_url": _artifact_url(ctx, path),
            "how_to_read_it": (
                "Fetch the URL directly. It was deliberately not truncated: a "
                "partial hash-covered document verifies as corrupt and reads as "
                "if Reliastra had tampered with it."
            ),
        }
        notes.append("Artifact too large to return as a view; the URL is given instead.")
    else:
        data["artifact"] = body
        data["artifact_bytes_approx"] = len(raw)
    return base.envelope(
        "reliastra_get_incident_evidence", data, ctx, source=source,
        freshness=freshness, notes=notes,
    )


async def _fetch_artifact(ctx: base.ToolContext, path: str) -> tuple[Any, dict[str, Any], bool]:
    """Fetch a frozen artifact. Returns ``(body, freshness, absent)``.

    A 404 on this route means "no artifact has been frozen yet", which is an
    answer rather than an error, so it is converted here instead of propagating as
    a tool failure.
    """
    try:
        body, freshness = await ctx.client.get_public(
            path, request_id=ctx.request_id, cacheable=False
        )
    except err.ToolFailure as failure:
        if failure.category == "not_found":
            return None, {"cached": False}, True
        raise
    if not isinstance(body, (dict, list)) or not body:
        return None, freshness, True
    return body, freshness, False


async def verify_evidence(
    ctx: base.ToolContext,
    verification_id: str,
) -> dict[str, Any]:
    """The independent verification verdict for one evidence artifact."""
    token = as_verification_id(verification_id)
    body, freshness = await ctx.client.get_public(
        f"/v1/verify/{token}",
        request_id=ctx.request_id,
        cacheable=False,
        # 503 here is a *finding*: "we could not check" is a different answer from
        # "there is nothing there", and flattening it to an error would hide that
        # the record may exist. 404 is likewise data: found=false.
        accept_statuses=frozenset({404, 503}),
    )
    if not isinstance(body, dict):
        raise err.upstream("upstream_invalid", "Reliastra returned an unexpected verification record.")

    found = body.get("found") is True
    degraded = body.get("service_degraded") is True
    verified = body.get("verified")

    notes = [
        "verified is RE-DERIVED from the stored payload on every request, not read "
        "from a stored column, so a tampered row cannot pass by being self-consistent.",
        "verified=null means the check could not run (no signature, or the payload "
        "was unreadable). It is never a pass, and it is not the same as verified=false.",
        "The payload itself is deliberately not returned: this endpoint proves what "
        "the payload must hash to, which is all a verifier needs.",
    ]
    if degraded:
        notes.insert(
            0,
            "SERVICE DEGRADED: Reliastra could not read the record. This is NOT "
            "evidence that the artifact is invalid or absent - the correct "
            "conclusion is 'verification could not be performed'. Retry later.",
        )
    elif found is False:
        notes.insert(
            0,
            "No record exists for this verification id. Ids are unguessable and "
            "delivered with the document, so a wrong or expired id looks identical "
            "to a nonexistent one. No suggestion is offered, by design.",
        )
    elif verified is True:
        notes.append(
            "The stored payload hashes and (where signed) verifies as claimed. "
            "This authenticates the ARTIFACT; it does not establish that the "
            "underlying incident affected your application.",
        )

    return base.envelope(
        "reliastra_verify_evidence",
        {
            **body,
            "verdict_summary": {
                "found": found,
                "verified": verified,
                "service_degraded": degraded,
                "usable_as_proof_of_authenticity": bool(found and verified is True),
                "usable_as_proof_of_impact": False,
            },
        },
        ctx,
        source=f"GET /v1/verify/{token}",
        freshness=freshness,
        notes=notes,
    )


def _int_or_none(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _serialize(body: Any) -> str:
    import json

    try:
        return json.dumps(body, default=str)
    except (TypeError, ValueError):
        return ""


def _artifact_url(ctx: base.ToolContext, path: str) -> str:
    return f"{ctx.config.reliastra_api_url}{path}"


_DESCRIPTIONS = {
    "artifact": """Retrieve the frozen evidence artifact for a public incident.

Reliastra freezes an incident's observations into an immutable, content-hashed
document when the incident transitions. This returns that document plus its
provenance: data_hash (the ETag), version, artifact_schema_version and
methodology_version. Read-only, no credential needed.

Pass `version` to pin an exact frozen version - frozen artifacts never change, so
a pinned version is what you cite when a claim must be checkable later. Without
it you get the newest freeze, and that URL moves when a new one is written.

WHAT THE OUTPUT PROVES: what Reliastra recorded and froze for this incident, and
the hash that identifies those exact bytes.

WHAT IT DOES NOT PROVE: that your application was affected. An evidence artifact
is about the provider, over a window, from one observation point.

Two honesty rules this tool follows: the artifact is never truncated - if it is
too large to return, you get the authoritative URL and the reason, because half a
hash-covered document looks like tampering; and the returned JSON is a parsed
view, so re-serialising it may not reproduce data_hash. Fetch the URL to check a
hash.

A 404 means no artifact has been frozen yet, not that the incident is
unverifiable and not that it did not happen.

NEXT: reliastra_verify_evidence to have the verdict re-derived independently.""",
    "verify": """Independently verify a Reliastra evidence artifact by its verification id.

This is the endpoint a customer's counterparty calls: no account, no consent, no
credential. The id is an unguessable token delivered with the document. Read-only.

`verification_id` is printed in the artifact footer and encoded in its QR code.
Returns the verdict, the payload hash, signing details (algorithm, key id,
signature), the individual verification checks, retention/expiry, and the
procedure for checking the bytes yourself.

WHAT THE OUTPUT PROVES: that the stored payload hashes - and, where signed,
cryptographically verifies - as claimed. `verified` is RE-DERIVED from the stored
payload on every request rather than read from a column, so a tampered row cannot
pass by being self-consistent.

Read the three states distinctly: verified=true means the check passed;
verified=false means it FAILED; verified=null means the check COULD NOT RUN (no
signature, or an unreadable payload) - never a pass. Likewise service_degraded=true
means Reliastra could not read the record, so the correct conclusion is
"verification could not be performed", not "the artifact is invalid".

WHAT IT DOES NOT PROVE: that the underlying incident affected your application.
Authenticity of a document is not evidence of impact. `verdict_summary` states both
explicitly.

The payload itself is deliberately not returned - this endpoint proves what the
payload must hash to, which is all a verifier needs.

WHEN NOT TO USE: to read the incident facts - use reliastra_get_public_incident or
reliastra_get_incident_evidence."""
}


def register(server: Any, deps: base.ServerDeps) -> None:
    base.register_tool(
        server, deps, get_incident_evidence,
        name="reliastra_get_incident_evidence",
        title="Frozen evidence artifact for a public incident",
        description=_DESCRIPTIONS["artifact"],
        read_only=True,
    )
    base.register_tool(
        server, deps, verify_evidence,
        name="reliastra_verify_evidence",
        title="Independently verify an evidence artifact",
        description=_DESCRIPTIONS["verify"],
        read_only=True,
    )
