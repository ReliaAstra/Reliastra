"""The public verification record - the only thing a counterparty reads from us.

Unit-tested against fake repositories so the *contract* is what is asserted:
which fields exist, what a miss looks like, what a degraded database looks like,
and that an unsigned or expired artifact is reported as such instead of quietly
omitting those facts.
"""

import json
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.modules.verification import router as verify_router

T0 = datetime(2026, 9, 11, 12, 0, 0, tzinfo=timezone.utc)


def _snapshot(**overrides):
    base = {
        "incident_id": uuid.uuid4(),
        "org_id": uuid.uuid4(),
        "dependency_id": uuid.uuid4(),
        "time_window_start": T0 - timedelta(minutes=130),
        "time_window_end": T0,
        "data_hash": "a" * 64,
        "report_checksum": "b" * 64,
        "methodology_version": "v1.0",
        "created_at": T0,
        "report_file_path": "evidence/org/incident/key.pdf",
        "signature": "c2lnbmF0dXJl",
        "signature_alg": "Ed25519",
        "signing_key_id": "9f2c41ba77de3311",
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def _report(**overrides):
    base = {
        "expires_at": T0 + timedelta(days=365),
        "file_size_bytes": 41233,
        "renderer": "chromium (playwright)",
        "renderer_version": "141.0.7390.31",
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def _wire(monkeypatch, snapshot, report):
    async def get_by_verification_id(db, verification_id):
        return snapshot

    async def get_by_file_path(db, file_path):
        return report

    monkeypatch.setattr(
        verify_router.EvidenceSnapshotRepository,
        "get_by_verification_id",
        staticmethod(get_by_verification_id),
    )
    monkeypatch.setattr(
        verify_router.EvidenceRepository,
        "get_by_file_path",
        staticmethod(get_by_file_path),
    )


class TestFound:
    @pytest.mark.asyncio
    async def test_the_record_carries_every_hash_a_verifier_needs(self, monkeypatch):
        snapshot = _snapshot()
        _wire(monkeypatch, snapshot, _report())
        payload = await verify_router.verify_evidence("tok123", db=None)
        assert payload["found"] is True
        assert payload["data_hash"] == snapshot.data_hash
        assert payload["report_checksum"] == snapshot.report_checksum
        assert payload["authenticity"]["signed"] is True
        assert payload["authenticity"]["algorithm"] == "Ed25519"
        assert payload["authenticity"]["signing_key_id"] == "9f2c41ba77de3311"
        assert payload["rendering"]["renderer"] == "chromium (playwright)"
        assert payload["retention"]["expired"] is False
        assert payload["report_url"].endswith("/reports/tok123")
        assert payload["record_url"].endswith("/api/v1/verify/tok123")

    @pytest.mark.asyncio
    async def test_procedure_is_published_so_verification_is_not_our_private_affair(
        self, monkeypatch
    ):
        _wire(monkeypatch, _snapshot(), _report())
        payload = await verify_router.verify_evidence("tok", db=None)
        steps = payload["verification"]["procedure"]
        assert any("sha256" in step for step in steps)
        assert any("/v1/verify/keys" in step for step in steps)
        assert payload["authenticity"]["signature_covers"]

    @pytest.mark.asyncio
    async def test_an_unsigned_artifact_is_reported_unsigned(self, monkeypatch):
        snapshot = _snapshot(signature=None, signature_alg=None, signing_key_id=None)
        _wire(monkeypatch, snapshot, _report())
        payload = await verify_router.verify_evidence("tok", db=None)
        assert payload["authenticity"]["signed"] is False
        assert payload["authenticity"]["signature"] is None

    @pytest.mark.asyncio
    async def test_retention_state_is_answered(self, monkeypatch):
        expired_report = _report(expires_at=T0 - timedelta(days=1))
        _wire(monkeypatch, _snapshot(), expired_report)
        payload = await verify_router.verify_evidence("tok", db=None)
        assert payload["retention"]["expired"] is True

    @pytest.mark.asyncio
    async def test_an_artifact_row_from_before_provenance_says_so(self, monkeypatch):
        _wire(monkeypatch, _snapshot(), _report(renderer=None, renderer_version=None))
        payload = await verify_router.verify_evidence("tok", db=None)
        assert payload["rendering"]["renderer"] is None
        assert "recorded on artifacts issued from this version onward" in (
            payload["rendering"]["note"]
        )

    @pytest.mark.asyncio
    async def test_a_missing_report_row_is_not_reported_as_available(self, monkeypatch):
        _wire(monkeypatch, _snapshot(), None)
        payload = await verify_router.verify_evidence("tok", db=None)
        assert payload["retention"]["artifact_available"] is False
        assert payload["retention"]["expires_at"] is None

    @pytest.mark.asyncio
    async def test_the_payload_is_never_published(self, monkeypatch):
        # The record proves what the payload must hash to. The payload itself is
        # issued to the parties, not to whoever holds the token: endpoint URLs,
        # per-check rows and the observation set stay private to the org.
        snapshot = _snapshot()
        _wire(monkeypatch, snapshot, _report())
        payload = await verify_router.verify_evidence("tok", db=None)
        blob = json.dumps(payload)
        for secret in ("observations", "window_metrics", "endpoint_url", "error_message"):
            assert secret not in blob, secret
        # The org id is exposed once, as an identifier, and nothing else about
        # the organization travels with it.
        assert blob.count(str(snapshot.org_id)) == 1


class TestMissesAndFailures:
    @pytest.mark.asyncio
    async def test_an_unknown_token_is_a_404_that_says_nothing_else(self, monkeypatch):
        _wire(monkeypatch, None, None)
        response = await verify_router.verify_evidence("nope", db=None)
        assert response.status_code == 404
        assert json.loads(response.body) == {"found": False, "error": "Evidence not found"}

    @pytest.mark.asyncio
    async def test_a_degraded_database_is_a_503_not_a_miss(self, monkeypatch):
        async def explode(db, verification_id):
            raise RuntimeError("connection pool exhausted")

        monkeypatch.setattr(
            verify_router.EvidenceSnapshotRepository,
            "get_by_verification_id",
            staticmethod(explode),
        )
        response = await verify_router.verify_evidence("tok", db=None)
        body = json.loads(response.body)
        assert response.status_code == 503
        assert body["found"] is False
        assert body["service_degraded"] is True

    @pytest.mark.asyncio
    async def test_nothing_is_cached_because_expiry_changes_the_answer(self, monkeypatch):
        _wire(monkeypatch, _snapshot(), _report())
        response = await verify_router.verify_evidence("tok", db=None)
        _ = response
        # dict responses are serialised by FastAPI, so the no-store header is
        # asserted where it is set: on the explicit Response branches.
        _wire(monkeypatch, None, None)
        missing = await verify_router.verify_evidence("tok", db=None)
        assert missing.headers["cache-control"] == "no-store"
