"""Verification must be *performed*, not reported.

The verification endpoint used to echo the stored ``data_hash`` and ``signature``
columns. That is circular: a row tampered with in place stays internally
consistent, so a verifier who trusted that endpoint learned nothing they could
not have learned by trusting the party they were checking.

These tests pin the property that fixes it - the verdict is re-derived from the
stored artifact, and a check that cannot run is never reported as a pass.
"""

import base64
import hashlib
import json
import os
from types import SimpleNamespace

import pytest

from app.config import settings
from app.modules.evidence import signing
from app.modules.evidence.canonical import (
    EVIDENCE_ENVELOPE_KEYS,
    canonical_json_bytes,
    payload_from_document,
)
from app.modules.verification import service as verify_service


FACTS = {
    "dependency": "payments-api",
    "measured_availability": 83.3333,
    "notes": "café — naïve",
}


def _install_key(monkeypatch, *, key_id: str = "", keyring: str = "", seed=None):
    material = base64.urlsafe_b64encode(seed or os.urandom(32)).decode()
    monkeypatch.setattr(settings, "EVIDENCE_SIGNING_PRIVATE_KEY", material, raising=False)
    monkeypatch.setattr(settings, "EVIDENCE_KEY_ID", key_id, raising=False)
    monkeypatch.setattr(settings, "EVIDENCE_SIGNING_KEYRING", keyring, raising=False)
    return signing.signing_state()


def _issue(monkeypatch, facts=None, *, sign=True, envelope_overrides=None):
    """Produce a payload document exactly as ``generation`` would, plus its record."""
    facts = FACTS if facts is None else facts
    payload_bytes = canonical_json_bytes(facts)
    data_hash = hashlib.sha256(payload_bytes).hexdigest()
    signature = signing.sign_payload(payload_bytes) if sign else None

    document = {
        **facts,
        "context_metrics": {},
        "data_hash": data_hash,
        "verification_id": "tok123",
        "report_checksum": "b" * 64,
        "generated_at": "2026-09-11T12:00:00+00:00",
        "authenticity": {"signed": signature is not None},
    }
    document.update(envelope_overrides or {})

    snapshot = SimpleNamespace(
        signature=(signature or {}).get("value"),
        signature_alg="Ed25519" if signature else None,
        signing_key_id=(signature or {}).get("key_id"),
        data_hash=data_hash,
        json_evidence_path="evidence/o/i/k.json",
    )

    def _storage():
        blob = json.dumps(document).encode("utf-8")

        class _S:
            @staticmethod
            def download_bytes(_path):
                return blob

        return _S()

    monkeypatch.setattr(verify_service, "_storage", _storage)
    return snapshot, document


def _check(outcome, name):
    return next(c for c in outcome.checks if c.name == name)


class TestVerdictIsDerived:
    def test_a_clean_signed_record_verifies(self, monkeypatch):
        _install_key(monkeypatch)
        snapshot, _ = _issue(monkeypatch)

        outcome = verify_service.verify_snapshot(snapshot)

        assert outcome.verified is True
        assert outcome.reason is None
        assert _check(outcome, "data_hash_matches").ok
        assert _check(outcome, "signature_valid").ok

    def test_altered_facts_fail_even_though_the_hash_still_looks_right(self, monkeypatch):
        """The row can be made self-consistent; the artifact cannot match it."""
        _install_key(monkeypatch)
        snapshot, _ = _issue(monkeypatch)

        # Rewrite the served document's measurements, leaving data_hash alone.
        original = verify_service._storage

        def _bad_storage():
            doc = json.loads(original().download_bytes("").decode("utf-8"))
            doc["measured_availability"] = 99.99
            blob = json.dumps(doc).encode("utf-8")

            class _S:
                @staticmethod
                def download_bytes(_path):
                    return blob

            return _S()

        monkeypatch.setattr(verify_service, "_storage", _bad_storage)

        outcome = verify_service.verify_snapshot(snapshot)
        assert outcome.verified is False
        assert not _check(outcome, "data_hash_matches").ok

    def test_a_tampered_row_is_caught_by_recomputing_not_comparing(self, monkeypatch):
        _install_key(monkeypatch)
        snapshot, _ = _issue(monkeypatch)

        # An attacker with write access to the snapshot row.
        tampered = {"availability": 99.99, "vendor": "not-the-vendor"}
        payload_bytes = canonical_json_bytes(tampered)
        snapshot.data_hash = hashlib.sha256(payload_bytes).hexdigest()
        snapshot.signature = signing.sign_payload(payload_bytes)["value"]
        snapshot.signing_key_id = signing.signing_state().key_id

        outcome = verify_service.verify_snapshot(snapshot)

        # Either the served artifact disagrees with the row, or the signature no
        # longer covers the served bytes. Both are failures; none of them is a
        # silent pass, which is the whole defect being fixed.
        assert outcome.verified is False
        assert any(c.status == "fail" for c in outcome.checks)

    def test_unicode_payload_round_trips(self, monkeypatch):
        """A verifier using json.dumps defaults would compute a different digest."""
        _install_key(monkeypatch)
        snapshot, _ = _issue(monkeypatch)

        outcome = verify_service.verify_snapshot(snapshot)
        assert outcome.verified is True

        naive = json.dumps(payload_from_document(FACTS), sort_keys=True, separators=(",", ":"))
        assert hashlib.sha256(naive.encode()).hexdigest() != snapshot.data_hash


class TestNonPasses:
    def test_an_unsigned_record_is_not_verified(self, monkeypatch):
        _install_key(monkeypatch)
        snapshot, _ = _issue(monkeypatch, sign=False)

        outcome = verify_service.verify_snapshot(snapshot)

        assert outcome.verified is None
        assert outcome.reason == "unsigned"

    def test_an_unreadable_payload_is_not_a_pass(self, monkeypatch):
        _install_key(monkeypatch)
        snapshot, _ = _issue(monkeypatch)

        class _S:
            @staticmethod
            def download_bytes(_path):
                raise RuntimeError("bucket unreachable")

        monkeypatch.setattr(verify_service, "_storage", lambda: _S())

        outcome = verify_service.verify_snapshot(snapshot)
        assert outcome.verified is None
        assert outcome.reason == "payload_unavailable"

    def test_a_record_signed_by_an_unpublished_key_fails(self, monkeypatch):
        _install_key(monkeypatch)
        snapshot, _ = _issue(monkeypatch)

        # A different deployment's key: not ours, not published by us.
        monkeypatch.setattr(
            settings, "EVIDENCE_SIGNING_PRIVATE_KEY",
            base64.urlsafe_b64encode(os.urandom(32)).decode(), raising=False,
        )
        monkeypatch.setattr(settings, "EVIDENCE_SIGNING_KEYRING", "", raising=False)

        outcome = verify_service.verify_snapshot(snapshot)
        assert outcome.verified is False
        assert outcome.reason == "unknown_signing_key"

    def test_a_record_with_no_payload_is_reported_not_silently_ok(self, monkeypatch):
        _install_key(monkeypatch)
        snapshot, _ = _issue(monkeypatch)
        snapshot.json_evidence_path = None

        outcome = verify_service.verify_snapshot(snapshot)
        assert outcome.verified is False
        assert outcome.reason == "payload_not_retained"


class TestKeyRotation:
    def test_rotation_without_a_keyring_destroys_verifiability_loudly(self, monkeypatch):
        first_seed = os.urandom(32)
        _install_key(monkeypatch, key_id="reliastra-2026", seed=first_seed)
        snapshot, _ = _issue(monkeypatch)
        old_public = signing.signing_state().public_key
        old_kid = signing.signing_state().key_id

        # Rotate the key material but keep the id, as the old docs recommended.
        _install_key(monkeypatch, key_id="reliastra-2026", keyring="", seed=os.urandom(32))

        outcome = verify_service.verify_snapshot(snapshot)
        # Before the fix this endpoint answered found:true / signed:true forever.
        assert outcome.verified is False

        # Registering the superseded key restores verifiability.
        _install_key(
            monkeypatch,
            key_id="reliastra-2026",
            keyring=json.dumps({old_kid: old_public}),
            seed=None,
        )
        assert verify_service.verify_snapshot(snapshot).verified is True

    def test_both_keys_are_published_when_an_id_is_reused(self, monkeypatch):
        first_seed = os.urandom(32)
        _install_key(monkeypatch, key_id="shared-id", seed=first_seed)
        old = signing.signing_state()
        _install_key(
            monkeypatch,
            key_id="shared-id",
            keyring=json.dumps({old.key_id: old.public_key}),
            seed=None,
        )

        keys = signing.public_jwks()
        assert len(keys) == 2
        assert {k["status"] for k in keys} == {"current", "historical"}
        # Same id, different key material: exactly the substitution a pinned
        # verifier is entitled to be suspicious of, and now detectable.
        assert len({k["key_fingerprint"] for k in keys}) == 2


class TestEnvelopeBoundary:
    def test_envelope_keys_are_exactly_the_issuance_metadata(self):
        assert EVIDENCE_ENVELOPE_KEYS == {
            "context_metrics",
            "data_hash",
            "verification_id",
            "report_checksum",
            "generated_at",
            "authenticity",
        }

    def test_published_procedure_names_the_keys_to_strip(self):
        procedure = " ".join(
            __import__(
                "app.modules.evidence.canonical", fromlist=["verification_procedure"]
            ).verification_procedure()
        )
        for key in EVIDENCE_ENVELOPE_KEYS:
            assert key in procedure
        # The two serialiser options a naive verifier gets wrong.
        assert "ensure_ascii=False" in procedure
        assert "sort_keys=True" in procedure
        assert "separators=" in procedure
        assert ".encode('utf-8')" in procedure
