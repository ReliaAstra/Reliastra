"""Provenance binding: turn live RELIASTRA records into template variables.

Every message in the compiled design system that makes a falsifiable claim has
to carry the facts that back it. Doing that by hand in the admin UI would mean
an operator copying a 64-character SHA-256 out of one screen and pasting it into
another, which is exactly the workflow that produces a wrong checksum in an
outbound email.

So this module is the only sanctioned path from an evidence artefact to an
email's ``{{variables}}``:

* :func:`bind_incident` maps an incident, its attribution result and its
  observation series onto the variables the incident-bearing classes declare.
* :func:`bind_evidence` maps an evidence artefact onto the variables the
  evidence-bearing classes declare.
* :func:`missing_required` reports what a class still needs before it may send.

Two rules are enforced here rather than left to the caller:

1. **No invention.** Every value is copied from a record that exists. A field
   the deployment does not hold is reported as absent, and the email prints an
   explicit statement of absence ("unsigned deployment", "not issued") rather
   than a plausible-looking placeholder. A checksum that was made up is
   indistinguishable from a real one until someone checks it, which is the whole
   failure mode an evidence product exists to prevent.
2. **No silent rounding of a claim.** The attribution score is carried as the
   engine produced it. The ceiling is recomputed from the observed signal set
   using the engine's own rule, so the disclosure in the email cannot drift from
   the methodology version it names.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

# Mirrors ``app.modules.attribution.service.AttributionEngine``. Duplicated
# rather than imported so this module stays importable from the Email Center
# without pulling the attribution engine and its session dependencies into the
# email path; ``test_provenance_binding.py`` asserts the two agree.
SIGNAL_WEIGHTS: dict[str, float] = {
    "temporal": 0.20,
    "endpoint_overlap": 0.25,
    "latency_correlation": 0.25,
    "error_pattern": 0.15,
    "infrastructure_baseline": 0.15,
}

#: These two require a second, independent source of evidence. With one
#: observation point watching one dependency they are structurally 0.0, which
#: caps the reachable score below the 75 that ``vendor_failure`` requires.
CORROBORATION_SIGNALS: frozenset[str] = frozenset(
    {"temporal", "endpoint_overlap"}
)

CLASSIFICATION_VENDOR_FAILURE = 75.0
CLASSIFICATION_MULTI_CAUSE = 50.0

#: The audience-facing word for each classification. Deliberately not the
#: engine's own vocabulary: "unknown" is the engine's, "Indeterminate" is what
#: a reader needs, and printing both invites the question of which is
#: authoritative.
STATE_WORD: dict[str, str] = {
    "vendor_failure": "Failed",
    "multi_cause": "Degraded",
    "infrastructure_issue": "Degraded",
    "unknown": "Indeterminate",
}

SEVERITY_WORD: dict[str, str] = {
    "critical": "Critical",
    "major": "Major",
    "minor": "Minor",
    "info": "Informational",
}


def max_achievable(scores: Mapping[str, float]) -> float:
    """Highest score the observed signal set could have produced.

    The corroborating signals are excluded because they cannot be satisfied from
    a single observation point - not because they scored badly. Publishing this
    next to the score is what stops a reader interpreting a sub-threshold score
    as an engine that failed to converge rather than the honest maximum.
    """
    return round(
        sum(
            SIGNAL_WEIGHTS[name]
            for name in SIGNAL_WEIGHTS
            if name not in CORROBORATION_SIGNALS
        )
        * 100,
        2,
    )


def classify(confidence: float, *, observer_ok: bool) -> str:
    """The classification the methodology produces for a score.

    Mirrors ``AttributionEngine.compute_attribution``'s threshold order, where
    ``infrastructure_issue`` is reached by observer state rather than by score
    alone - a broken observer can score highly and still not know anything.
    """
    if confidence >= CLASSIFICATION_VENDOR_FAILURE:
        return "vendor_failure"
    if confidence >= CLASSIFICATION_MULTI_CAUSE:
        return "multi_cause"
    if not observer_ok:
        return "infrastructure_issue"
    return "unknown"


def stamp(value: Any) -> str | None:
    """Format a timestamp the way the product prints it: UTC, explicit, sortable.

    Returns ``None`` for a missing value rather than a placeholder - an absent
    observation time is a fact about the record, and the email template renders
    "not recorded" for it.
    """
    if value is None:
        return None
    iso = getattr(value, "isoformat", None)
    text = iso() if callable(iso) else str(value)
    if not text:
        return None
    if text.endswith("+00:00"):
        text = f"{text[:-6]}Z"
    text = text.replace("T", " ")
    if "." in text:
        text = text.split(".", 1)[0]
    if text.endswith("Z"):
        text = text[:-1]
    return f"{text} UTC"


@dataclass(frozen=True)
class Binding:
    """Bound variables plus what is still missing."""

    variables: dict[str, str]
    missing: tuple[str, ...] = ()

    def as_payload(self) -> dict[str, str]:
        return dict(self.variables)


def missing_required(
    *,
    required: Iterable[str],
    variables: Mapping[str, str],
    provided: Iterable[str] = (),
) -> tuple[str, ...]:
    """Required class variables that no record supplied a value for.

    ``provided`` names fields the operator supplied by hand. A field that is
    bound to an API path but which the operator typed is still a value, and
    refusing it would make the manual path impossible - the point of the check
    is to catch a *blank*, not to insist on automation.
    """
    have = {k for k, v in variables.items() if str(v).strip()}
    have.update(str(k) for k in provided)
    return tuple(name for name in required if name not in have)


def _as_mapping(value: Any) -> Mapping[str, Any]:
    """Coerce an ORM row, a dataclass or a dict into a mapping.

    Accepting all three keeps this callable from the Celery task, the admin
    router and the tests without three near-identical adapters.
    """
    if value is None:
        return {}
    if isinstance(value, Mapping):
        return value
    if hasattr(value, "signal_breakdown"):
        return {
            "classification": value.classification,
            "confidence_score": value.confidence_score,
            "signal_breakdown": value.signal_breakdown,
            "methodology_version": value.methodology_version,
        }
    return {
        key: getattr(value, key)
        for key in (
            "id",
            "incident_id",
            "dependency_id",
            "started_at",
            "resolved_at",
            "severity",
            "status",
            "classification",
            "confidence_score",
            "signal_breakdown",
            "methodology_version",
            "checksum",
            "data_hash",
            "verification_id",
            "verification_url",
            "signed",
            "signature_alg",
            "generated_at",
            "expires_at",
            "file_size_bytes",
            "renderer",
            "renderer_version",
        )
        if hasattr(value, key)
    }


def bind_incident(
    *,
    incident: Any,
    attribution: Any = None,
    dependency: Any = None,
    evidence: Any = None,
    observation_count: int | None = None,
    interval_seconds: int | None = None,
    confirm_threshold: int = 2,
    dropped_probes: int = 0,
    required: Sequence[str] = (),
) -> Binding:
    """Bind an incident, its attribution and its evidence onto class variables.

    Covers ``dependency_failure``, ``customer_dependency_alert`` and
    ``vendor_ops``. Any field the caller does not hold is simply absent, and the
    binding reports it rather than filling it with a plausible value.
    """
    inc = _as_mapping(incident)
    att = _as_mapping(attribution)
    dep = _as_mapping(dependency)
    ev = _as_mapping(evidence)

    signals = att.get("signal_breakdown") or {}
    observer_ok = bool(
        signals.get("infrastructure_baseline", 1.0)
        if isinstance(signals, Mapping)
        else 1
    )

    score = att.get("confidence_score")
    classification = att.get("classification") or classify(
        float(score) if score is not None else 0.0,
        observer_ok=observer_ok,
    )
    ceiling = max_achievable(signals) if isinstance(signals, Mapping) else max_achievable(SIGNAL_WEIGHTS)
    methodology = ev.get("methodology_version") or att.get("methodology_version")

    started = stamp(inc.get("started_at"))
    ended = stamp(inc.get("resolved_at")) or stamp(inc.get("updated_at"))
    endpoint = dep.get("endpoint") or dep.get("url") or dep.get("target")
    vendor = dep.get("vendor") or dep.get("vendor_name") or dep.get("provider")

    variables: dict[str, str] = {}

    def put(name: str, value: Any) -> None:
        if value is None:
            return
        text = str(value).strip()
        if text:
            variables[name] = text

    put("state_word", STATE_WORD.get(str(classification), "Indeterminate"))
    put("severity", SEVERITY_WORD.get(str(inc.get("severity", "")), inc.get("severity")))
    put("classification", str(classification))
    if score is not None:
        put("confidence_score", f"{float(score):.2f}")
    put("confidence_ceiling", f"{ceiling:.2f}")

    put("dependency_name", dep.get("name") or dep.get("label"))
    put("vendor_name", vendor)
    put("endpoint", endpoint)
    put("window_start", started)
    put("window_end", ended)
    if observation_count is not None:
        put("observation_count", str(int(observation_count)))
    if interval_seconds is not None:
        put("interval_seconds", str(int(interval_seconds)))
    put("confirm_threshold", str(int(confirm_threshold)))
    put("dropped_probes", str(int(dropped_probes)))
    if inc.get("id"):
        put("incident_id", str(inc["id"]))

    put("methodology_version", methodology)
    put("attribution_version", att.get("methodology_version"))
    put("document_checksum", ev.get("checksum"))
    put("data_hash", ev.get("data_hash"))
    put("signature_alg", ev.get("signature_alg"))
    put("signed", "true" if ev.get("signed") else "false")
    put("verification_url", ev.get("verification_url"))
    put("verification_id", ev.get("verification_id"))
    put("generated_at", stamp(ev.get("generated_at")))

    return Binding(
        variables=variables,
        missing=missing_required(required=required, variables=variables),
    )


def bind_evidence(*, evidence: Any, incident: Any = None, dependency: Any = None,
                  required: Sequence[str] = ()) -> Binding:
    """Bind an evidence artefact onto the ``evidence_delivery`` variables."""
    ev = _as_mapping(evidence)
    inc = _as_mapping(incident)
    dep = _as_mapping(dependency)

    variables: dict[str, str] = {}

    def put(name: str, value: Any) -> None:
        if value is None:
            return
        text = str(value).strip()
        if text:
            variables[name] = text

    if ev.get("id"):
        put("report_id", str(ev["id"]))
    if ev.get("incident_id"):
        put("incident_id", str(ev["incident_id"]))
    put("dependency_name", dep.get("name") or dep.get("label"))
    put("generated_at", stamp(ev.get("generated_at")))
    put("expires_at", stamp(ev.get("expires_at")))

    size = ev.get("file_size_bytes")
    if size is not None:
        put("file_size_bytes", str(int(size)))
        put("file_size_kb", f"{max(1, round(int(size) / 1024)):,}")

    put("methodology_version", ev.get("methodology_version"))
    put("document_checksum", ev.get("checksum"))
    put("data_hash", ev.get("data_hash"))
    put("signature_alg", ev.get("signature_alg"))
    put("signed", "true" if ev.get("signed") else "false")
    put("verification_url", ev.get("verification_url"))
    put("verification_id", ev.get("verification_id"))
    put("status", inc.get("status"))

    return Binding(
        variables=variables,
        missing=missing_required(required=required, variables=variables),
    )


__all__ = [
    "CLASSIFICATION_MULTI_CAUSE",
    "CLASSIFICATION_VENDOR_FAILURE",
    "CORROBORATION_SIGNALS",
    "SEVERITY_WORD",
    "SIGNAL_WEIGHTS",
    "STATE_WORD",
    "Binding",
    "bind_evidence",
    "bind_incident",
    "classify",
    "max_achievable",
    "missing_required",
    "stamp",
]
