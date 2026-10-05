"""Provenance binding must never invent a fact.

The email templates print a checksum, a signature status, an observation window
and an attribution score, then invite the recipient to verify them. Every one of
those values has to come from a record that exists. This module asserts the
binding layer is a faithful copy and that the methodology constants it
duplicates have not drifted from the attribution engine's own.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone

import pytest

from app.modules.attribution.service import AttributionEngine
from app.modules.email_center import provenance as prov
from app.modules.email_center.compiled import load_catalogue

catalogue = load_catalogue()


# ── Constants must agree with the attribution engine ───────────────────────


def test_signal_weights_match_the_engine() -> None:
    """The binding layer duplicates the weights. They must not diverge.

    If these drift, the email prints a ledger whose arithmetic does not produce
    the score beside it - a verifiable claim that is internally inconsistent.
    """
    assert prov.SIGNAL_WEIGHTS == AttributionEngine.WEIGHTS


def test_corroboration_signals_match_the_engine() -> None:
    assert prov.CORROBORATION_SIGNALS == frozenset(
        AttributionEngine.CORROBORATION_SIGNALS
    )


def test_weights_sum_to_one() -> None:
    assert math.isclose(sum(prov.SIGNAL_WEIGHTS.values()), 1.0, rel_tol=1e-9)


@pytest.mark.parametrize(
    ("confidence", "observer_ok", "expected"),
    [
        (75.0, True, "vendor_failure"),
        (99.9, True, "vendor_failure"),
        (74.99, True, "multi_cause"),
        (50.0, True, "multi_cause"),
        (49.99, True, "unknown"),
        (0.0, True, "unknown"),
        # A healthy score is not knowledge when the observer is broken.
        (20.0, False, "infrastructure_issue"),
        (49.99, False, "infrastructure_issue"),
    ],
)
def test_classification_thresholds(
    confidence: float, observer_ok: bool, expected: str
) -> None:
    assert prov.classify(confidence, observer_ok=observer_ok) == expected


def test_ceiling_excludes_corroborating_signals() -> None:
    """55.00 is the honest maximum for a single observation point."""
    assert prov.max_achievable({}) == 55.0
    # All signals perfect, single point: still capped, because the two
    # corroborating signals are structurally unreachable.
    perfect = {name: 1.0 for name in prov.SIGNAL_WEIGHTS}
    assert prov.max_achievable(perfect) == 55.0


# ── Timestamps ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (datetime(2026, 3, 11, 4, 12, 7, tzinfo=timezone.utc), "2026-03-11 04:12:07 UTC"),
        (
            datetime(2026, 3, 11, 4, 12, 7, 500000, tzinfo=timezone.utc),
            "2026-03-11 04:12:07 UTC",
        ),
        ("2026-03-11T04:12:07Z", "2026-03-11 04:12:07 UTC"),
        ("2026-03-11T04:12:07+00:00", "2026-03-11 04:12:07 UTC"),
        (None, None),
        ("", None),
    ],
)
def test_stamp_normalises_to_explicit_utc(value: object, expected: str | None) -> None:
    assert prov.stamp(value) == expected


def test_stamp_of_an_absent_time_is_absent_not_placeholder() -> None:
    """An absent time is a fact about the record, so it must not become a date."""
    assert prov.stamp(None) is None


# ── Binding ────────────────────────────────────────────────────────────────

INCIDENT = {
    "id": "5d2e8a71-4c93-4f60-b2a7-91e0c34d8f52",
    "started_at": datetime(2026, 3, 11, 4, 12, 7, tzinfo=timezone.utc),
    "severity": "critical",
    "status": "open",
}
ATTRIBUTION = {
    "classification": "unknown",
    "confidence_score": 29.5,
    "signal_breakdown": {
        "temporal": 0.0,
        "endpoint_overlap": 0.0,
        "latency_correlation": 0.31,
        "error_pattern": 0.45,
        "infrastructure_baseline": 1.0,
    },
    "methodology_version": "v1.1",
}
DEPENDENCY = {
    "name": "Auth0 /api/v2/token",
    "vendor": "Auth0",
    "endpoint": "https://meridian.auth0.com/oauth/token",
}
EVIDENCE = {
    "id": "b41f9c02-7ae4-4d19-9c3f-2f8a6e15d7b0",
    "checksum": "a" * 64,
    "data_hash": "b" * 64,
    "verification_url": "https://reliastra.com/evidence/verify/9f2c41a7",
    "verification_id": "EV-9F2C41A7",
    "methodology_version": "v1.0",
    "signed": True,
    "signature_alg": "Ed25519",
    "generated_at": datetime(2026, 3, 11, 4, 44, 19, tzinfo=timezone.utc),
}


def test_bind_incident_copies_only_real_values() -> None:
    binding = prov.bind_incident(
        incident=INCIDENT,
        attribution=ATTRIBUTION,
        dependency=DEPENDENCY,
        evidence=EVIDENCE,
        observation_count=30,
        interval_seconds=60,
    )
    v = binding.variables
    assert v["dependency_name"] == "Auth0 /api/v2/token"
    assert v["endpoint"] == "https://meridian.auth0.com/oauth/token"
    assert v["confidence_score"] == "29.50"
    assert v["confidence_ceiling"] == "55.00"
    assert v["state_word"] == "Indeterminate"
    assert v["severity"] == "Critical"
    assert v["signed"] == "true"
    assert v["window_start"] == "2026-03-11 04:12:07 UTC"


def test_bind_incident_reports_what_it_lacks() -> None:
    """A deployment with no evidence artefact must not acquire a fake one."""
    binding = prov.bind_incident(
        incident=INCIDENT,
        attribution=ATTRIBUTION,
        dependency=DEPENDENCY,
        evidence=None,
        required=("verification_url", "document_checksum", "data_hash"),
    )
    assert "verification_url" not in binding.variables
    assert "document_checksum" not in binding.variables
    assert set(binding.missing) == {"verification_url", "document_checksum", "data_hash"}


def test_unsigned_deployment_is_stated_not_omitted() -> None:
    """`signed=false` is a fact about the deployment and must survive."""
    unsigned = {**EVIDENCE, "signed": False, "signature_alg": None}
    binding = prov.bind_evidence(evidence=unsigned)
    assert binding.variables["signed"] == "false"
    assert "signature_alg" not in binding.variables


def test_bind_evidence_reports_missing_payload_hash_rather_than_zero() -> None:
    binding = prov.bind_evidence(evidence={k: v for k, v in EVIDENCE.items() if k != "data_hash"})
    assert "data_hash" not in binding.variables


def test_missing_required_treats_blank_as_missing() -> None:
    assert prov.missing_required(
        required=("a", "b", "c"),
        variables={"a": "set", "b": "   ", "c": ""},
    ) == ("b", "c")


def test_missing_required_accepts_a_hand_supplied_value() -> None:
    """Manual entry is a legitimate path; the check catches blanks, not typing."""
    assert (
        prov.missing_required(
            required=("checksum",),
            variables={},
            provided=("checksum",),
        )
        == ()
    )


def test_every_verifiable_class_binds_its_declared_provenance() -> None:
    """Binding must be able to satisfy the contracts the catalogue declares.

    If a class declares a required variable that nothing in the binding layer
    can ever produce, the class is unsendable - and the operator finds out from
    a 422 rather than from the admin UI.
    """
    producible = set(
        prov.bind_incident(
            incident=INCIDENT,
            attribution=ATTRIBUTION,
            dependency=DEPENDENCY,
            evidence=EVIDENCE,
            observation_count=30,
            interval_seconds=60,
        ).variables
    ) | set(prov.bind_evidence(evidence=EVIDENCE, incident=INCIDENT, dependency=DEPENDENCY).variables)

    for item in catalogue.classes:
        if item.audience in {"customer", "vendor"} and item.verifiable:
            unproducible = {
                name
                for name in item.required_variables
                if name.startswith(("verification_", "document_checksum", "data_hash"))
            } - producible
            assert not unproducible, f"{item.id}: unbound {unproducible}"


def test_state_words_never_leak_engine_vocabulary() -> None:
    """The reader-facing word must not be the engine's own label.

    Printing both "Indeterminate" and "unknown" for the same classification
    invites the reader to wonder which one is authoritative.

    Distinctness is not the invariant and is deliberately not asserted:
    ``multi_cause`` and ``infrastructure_issue`` both render as "Degraded",
    because from the recipient's side a partial degradation and a broken
    observer look the same - you call the vendor.
    """
    for classification, word in prov.STATE_WORD.items():
        assert word.lower() != classification.lower(), (classification, word)
        assert "_" not in word, (classification, word)
    assert prov.STATE_WORD == {
        "vendor_failure": "Failed",
        "multi_cause": "Degraded",
        "infrastructure_issue": "Degraded",
        "unknown": "Indeterminate",
    }


def test_every_classification_has_a_state_word() -> None:
    """A classification without a word would render an empty banner."""
    known = {"vendor_failure", "multi_cause", "infrastructure_issue", "unknown"}
    assert set(prov.STATE_WORD) == known
