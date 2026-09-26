"""Public dataset publisher: builder determinism and publish decisions.

Unit layer. The builder is pure (same rows, same tree, same hash); the
service's decisions are table-tested with the GitHub boundary mocked - the
integration suite runs the same flow against real Postgres. Records are
fully specified throughout.
"""

import hashlib
import json
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import SecretStr

from app.modules.dataset import service as dataset_service
from app.modules.dataset.builder import (
    DATASET_GENERATOR,
    DATASET_SCHEMA_VERSION,
    build_dataset_tree,
    dataset_content_hash,
    dataset_readme,
    file_hash,
    incident_summary,
)
from app.modules.dataset.github import dataset_github_config
from app.modules.dataset.models import DatasetPublication
from app.modules.dataset.service import (
    EVENT_TYPE,
    TRIGGER_OUTBOX,
    TRIGGER_SCHEDULED,
    DatasetPublicationService,
    enqueue_dataset_refresh,
    handle_dataset_refresh,
)
from app.modules.observations.models import OutboxEvent

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

VENDOR_ID = uuid.uuid4()
INCIDENT_ID = uuid.uuid4()


def vendor_row(**overrides):
    row = {
        "vendor_name": "example",
        "display_name": "Example",
        "category": "payments",
        "official_name": "Example Inc",
        "website_url": "https://example.com",
        "endpoint_url": "https://status.example.com",
    }
    row.update(overrides)
    return row


def incident_row(**overrides):
    row = {
        "incident_id": str(INCIDENT_ID),
        "vendor_name": "example",
        "vendor_display_name": "Example",
        "category": "payments",
        "target_name": "Official status page",
        "endpoint_url": "https://status.example.com",
        "region": "us-east",
        "status": "resolved",
        "severity": "major",
        "failure_kind": "http_5xx",
        "started_at": "2026-09-25T12:05:00+00:00",
        "detected_at": "2026-09-25T12:10:00+00:00",
        "resolved_at": "2026-09-25T12:25:00+00:00",
        "duration_seconds": 1200.0,
        "observation_count": 6,
        "failure_count": 4,
        "methodology_version": "v1.0",
        "attribution_status": "observed",
        "status_codes": [503],
        "first_observation_id": "a",
        "last_observation_id": "f",
        "detection_rule": "consecutive_failures",
        "detection_metadata": {"threshold": 2},
        "description": "RELIASTRA probes recorded 4 consecutive failed observations.",
        "evidence": {
            "version": 1,
            "incident_status": "resolved",
            "artifact_schema_version": "1.0",
            "methodology_version": "v1.0",
            "data_hash": "c" * 64,
            "byte_size": 2048,
            "observation_count": 6,
            "observations_truncated": False,
            "generated_at": "2026-09-25T12:26:00+00:00",
        },
    }
    row.update(overrides)
    return row


EVIDENCE_BYTES = json.dumps(
    {"verification": {"payload_sha256": "c" * 64}, "incident": {"id": str(INCIDENT_ID)}},
    sort_keys=True,
    separators=(",", ":"),
)


# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------


def _tree(**kwargs):
    return build_dataset_tree(
        vendors=kwargs.get("vendors", [vendor_row()]),
        incidents=kwargs.get("incidents", [incident_row()]),
        evidence=kwargs.get("evidence", {str(INCIDENT_ID): EVIDENCE_BYTES}),
        methodology_version=kwargs.get("methodology_version", "v1.0"),
        generator_version=kwargs.get("generator_version", "1.0"),
    )


class TestBuilder:
    def test_tree_is_deterministic(self):
        one = dataset_content_hash(_tree())
        two = dataset_content_hash(_tree())
        assert one == two

    def test_expected_paths(self):
        tree = _tree()
        assert set(tree) == {
            "README.md",
            "catalog.json",
            "incidents/index.jsonl",
            f"incidents/{INCIDENT_ID}.json",
            f"evidence/{INCIDENT_ID}.json",
        }

    def test_index_is_jsonl_sorted_oldest_first_with_api_field_names(self):
        older = incident_row(
            incident_id=str(uuid.uuid4()),
            started_at="2026-09-24T00:00:00+00:00",
        )
        tree = _tree(incidents=[incident_row(), older])
        lines = tree["incidents/index.jsonl"].decode("utf-8").splitlines()
        assert len(lines) == 2
        first = json.loads(lines[0])
        second = json.loads(lines[1])
        assert first["started_at"] < second["started_at"]
        # API's own field names, summary scope only.
        assert first["incident_id"] == older["incident_id"]
        assert first["attribution_status"] == "observed"
        assert "description" not in first
        assert "detection_metadata" not in first

    def test_evidence_bytes_are_verbatim(self):
        tree = _tree()
        assert tree[f"evidence/{INCIDENT_ID}.json"] == EVIDENCE_BYTES.encode("utf-8")

    def test_incident_file_is_the_canonical_detail_object(self):
        tree = _tree()
        document = json.loads(tree[f"incidents/{INCIDENT_ID}.json"])
        assert document == incident_row()

    def test_catalog_is_sorted_by_vendor_name(self):
        tree = _tree(
            vendors=[vendor_row(vendor_name="zebra"), vendor_row(vendor_name="alpha")]
        )
        catalog = json.loads(tree["catalog.json"])
        names = [v["vendor_name"] for v in catalog["vendors"]]
        assert names == sorted(names)
        assert catalog["schema_version"] == DATASET_SCHEMA_VERSION

    def test_readme_states_provenance_without_wall_clock_values(self):
        readme = dataset_readme(methodology_version="v1.0", generator_version="1.0")
        assert "v1.0" in readme
        assert DATASET_GENERATOR in readme
        assert "verification" in readme
        # Reproducibility: no timestamp may enter the prose.
        for banned in ("generated at", "published at", "last updated", "2026"):
            assert banned.lower() not in readme.lower()

    def test_empty_state_is_a_valid_tree(self):
        tree = build_dataset_tree(
            vendors=[], incidents=[], evidence={},
            methodology_version="v1.0", generator_version="1.0",
        )
        assert set(tree) == {"README.md", "catalog.json", "incidents/index.jsonl"}
        assert tree["incidents/index.jsonl"] == b""

    def test_content_hash_moves_with_any_byte_anywhere(self):
        base = dataset_content_hash(_tree())
        changed_incident = dataset_content_hash(
            _tree(incidents=[incident_row(status="open")])
        )
        changed_evidence = dataset_content_hash(
            _tree(evidence={str(INCIDENT_ID): EVIDENCE_BYTES + " "})
        )
        assert base != changed_incident
        assert base != changed_evidence

    def test_file_hash_is_sha256(self):
        assert file_hash(b"x") == hashlib.sha256(b"x").hexdigest()

    def test_summary_projection_keys(self):
        summary = incident_summary(incident_row())
        assert summary["incident_id"] == str(INCIDENT_ID)
        assert set(summary) == {
            "incident_id", "vendor_name", "vendor_display_name", "category",
            "target_name", "endpoint_url", "region", "status", "severity",
            "failure_kind", "started_at", "detected_at", "resolved_at",
            "duration_seconds", "observation_count", "failure_count",
            "methodology_version", "attribution_status",
        }


# ---------------------------------------------------------------------------
# GitHub configuration: optional and disclosed
# ---------------------------------------------------------------------------


class TestGitHubConfig:
    def test_unconfigured_is_none(self, monkeypatch):
        from app.config import settings

        monkeypatch.setattr(settings, "DATASET_GITHUB_TOKEN", None)
        monkeypatch.setattr(settings, "DATASET_GITHUB_REPO", None)
        assert dataset_github_config() is None

    def test_partial_configuration_is_none(self, monkeypatch):
        from app.config import settings

        monkeypatch.setattr(settings, "DATASET_GITHUB_TOKEN", SecretStr("tok"))
        monkeypatch.setattr(settings, "DATASET_GITHUB_REPO", None)
        assert dataset_github_config() is None

        monkeypatch.setattr(settings, "DATASET_GITHUB_TOKEN", None)
        monkeypatch.setattr(settings, "DATASET_GITHUB_REPO", "owner/repo")
        assert dataset_github_config() is None

    def test_full_configuration_parses_owner_and_repo(self, monkeypatch):
        from app.config import settings

        monkeypatch.setattr(settings, "DATASET_GITHUB_TOKEN", SecretStr("tok"))
        monkeypatch.setattr(settings, "DATASET_GITHUB_REPO", "owner/repo")
        config = dataset_github_config()
        assert config is not None
        assert config.target == "owner/repo"
        assert config.owner == "owner"
        assert config.repo == "repo"
        assert config.branch == "main"

    def test_malformed_repo_is_none(self, monkeypatch):
        from app.config import settings

        monkeypatch.setattr(settings, "DATASET_GITHUB_TOKEN", SecretStr("tok"))
        monkeypatch.setattr(settings, "DATASET_GITHUB_REPO", "just-a-name")
        assert dataset_github_config() is None


# ---------------------------------------------------------------------------
# Service decisions
# ---------------------------------------------------------------------------


def _configured(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "DATASET_GITHUB_TOKEN", SecretStr("tok"))
    monkeypatch.setattr(settings, "DATASET_GITHUB_REPO", "owner/dataset")
    monkeypatch.setattr(settings, "DATASET_GITHUB_BRANCH", "main")


def _service_with(latest):
    repository = MagicMock()
    repository.latest_for_target = AsyncMock(return_value=latest)
    repository.create = AsyncMock(side_effect=lambda session, row: row)
    return DatasetPublicationService(repository=repository)


def _derivation(monkeypatch, incidents=None, vendors=None, evidence=None):
    """Patch the derivation layer to return canonical rows.

    The publish *decisions* (hash compare, commit, record) are what these
    tests pin; the derivation-from-DB is covered by the integration suite
    against real Postgres. The evidence lookup returns the frozen bytes
    verbatim, exactly as the repository would.
    """
    from app.modules.evidence import canonical  # noqa: F401  (import hygiene)
    from app.modules.incidents.public_evidence import PublicIncidentEvidenceRepository
    from app.modules.incidents.public_schemas import PublicIncidentDetailResponse

    async def _incidents(self, session):
        # Real canonical objects (pydantic models), exactly as the incident
        # service's detail mapping returns them.
        return [PublicIncidentDetailResponse(**row) for row in (incidents or [])]

    async def _vendors(self, session):
        return list(vendors or [])

    async def _latest(session, incident_id):
        return SimpleNamespace(payload=evidence.get(str(incident_id), ""))

    monkeypatch.setattr(
        DatasetPublicationService, "_collect_incidents", _incidents
    )
    monkeypatch.setattr(
        DatasetPublicationService, "_collect_vendors", _vendors
    )
    monkeypatch.setattr(
        PublicIncidentEvidenceRepository, "latest_for_incident", _latest
    )


def _session():
    return AsyncMock()


@pytest.mark.asyncio
async def test_disabled_publisher_is_a_reported_noop(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "DATASET_GITHUB_TOKEN", None)
    monkeypatch.setattr(settings, "DATASET_GITHUB_REPO", None)
    service = _service_with(latest=None)

    outcome = await service.publish(AsyncMock(), TRIGGER_OUTBOX)

    assert outcome.outcome == "disabled"
    service.repository.create.assert_not_called()


@pytest.mark.asyncio
async def test_unchanged_content_is_a_noop_without_a_commit(monkeypatch):
    _configured(monkeypatch)
    commits = []

    async def _commit(files, message, *, config):
        commits.append((files, message))
        return "c" * 40, "t" * 40

    monkeypatch.setattr(dataset_service, "commit_tree", _commit)
    _derivation(
        monkeypatch,
        incidents=[incident_row()],
        vendors=[vendor_row()],
        evidence={str(INCIDENT_ID): EVIDENCE_BYTES},
    )

    # Publish once to learn the content hash, then answer the lookup with a
    # row carrying that same hash.
    service = _service_with(latest=None)
    outcome = await service.publish(_session(), TRIGGER_OUTBOX)
    assert outcome.outcome == "published"
    first_hash = outcome.content_hash
    assert len(commits) == 1

    latest = SimpleNamespace(
        content_hash=first_hash, commit_sha="c" * 40, target="owner/dataset",
        branch="main",
    )
    service2 = _service_with(latest=latest)
    outcome2 = await service2.publish(_session(), TRIGGER_OUTBOX)
    assert outcome2.outcome == "current"
    assert outcome2.commit_sha == "c" * 40
    assert len(commits) == 1  # no second commit
    service2.repository.create.assert_not_called()


@pytest.mark.asyncio
async def test_changed_content_commits_and_records(monkeypatch):
    _configured(monkeypatch)
    commits = []

    async def _commit(files, message, *, config):
        commits.append((files, message, config))
        return "d" * 40, "t" * 40

    monkeypatch.setattr(dataset_service, "commit_tree", _commit)
    _derivation(
        monkeypatch,
        incidents=[incident_row()],
        vendors=[vendor_row()],
        evidence={str(INCIDENT_ID): EVIDENCE_BYTES},
    )

    latest = SimpleNamespace(
        content_hash="0" * 64, commit_sha="c" * 40, target="owner/dataset",
        branch="main",
    )
    service = _service_with(latest=latest)
    outcome = await service.publish(_session(), TRIGGER_SCHEDULED)

    assert outcome.outcome == "published"
    assert outcome.commit_sha == "d" * 40
    assert len(commits) == 1
    row = service.repository.create.call_args.args[1]
    assert isinstance(row, DatasetPublication)
    assert row.content_hash == outcome.content_hash
    assert row.commit_sha == "d" * 40
    assert row.tree_sha == "t" * 40
    assert row.incident_count == 1
    assert row.evidence_count == 1
    assert row.vendor_count == 1
    assert row.trigger == TRIGGER_SCHEDULED
    # The commit carries the whole tree.
    files, message, config = commits[0]
    assert config.target == "owner/dataset"
    assert f"incidents/{INCIDENT_ID}.json" in files
    assert message


@pytest.mark.asyncio
async def test_github_failure_raises_and_records_nothing(monkeypatch):
    from app.modules.dataset.github import GitHubError

    _configured(monkeypatch)

    async def _commit(files, message, *, config):
        raise GitHubError("boom")

    monkeypatch.setattr(dataset_service, "commit_tree", _commit)
    _derivation(
        monkeypatch,
        incidents=[incident_row()],
        vendors=[vendor_row()],
        evidence={str(INCIDENT_ID): EVIDENCE_BYTES},
    )
    service = _service_with(latest=None)

    with pytest.raises(GitHubError):
        await service.publish(_session(), TRIGGER_OUTBOX)

    service.repository.create.assert_not_called()


# ---------------------------------------------------------------------------
# Outbox wiring
# ---------------------------------------------------------------------------


def test_enqueue_dataset_refresh_writes_the_event():
    session = MagicMock()
    enqueue_dataset_refresh(session)
    event = session.add.call_args.args[0]
    assert isinstance(event, OutboxEvent)
    assert event.event_type == EVENT_TYPE


@pytest.mark.asyncio
async def test_dataset_outbox_handler_publishes(monkeypatch):
    recorded = {}

    async def _publish(self, session, trigger):
        recorded["trigger"] = trigger
        return SimpleNamespace(outcome="current")

    monkeypatch.setattr(
        DatasetPublicationService, "publish", _publish
    )
    assert await handle_dataset_refresh(AsyncMock(), "{}") == "current"
    assert recorded["trigger"] == "outbox"


@pytest.mark.asyncio
async def test_dataset_outbox_handler_consumes_disabled_state(monkeypatch):
    async def _publish(self, session, trigger):
        return SimpleNamespace(outcome="disabled")

    monkeypatch.setattr(DatasetPublicationService, "publish", _publish)
    # Retrying cannot configure a disabled publisher: the event is consumed.
    assert await handle_dataset_refresh(AsyncMock(), "{}") == "disabled"


def test_dataset_event_registered_in_the_dispatcher():
    from app.modules.observations.outbox import HANDLERS

    assert EVENT_TYPE in HANDLERS
