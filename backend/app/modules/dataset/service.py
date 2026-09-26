"""The public dataset publisher: canonical rows to a public Git mirror.

Pipeline shape (why it can never lose data or block a probe):

1. **Derive** - the tree is a pure function (``dataset.builder``) of rows
   this codebase already treats as canonical: public incident detail
   objects, frozen evidence bytes, vendor identity rows. The publisher owns
   no second copy of any fact.
2. **Decide** - SHA-256 content hash of the tree, compared against the
   newest ``DatasetPublication`` row for the same target+branch. Equal
   hash = no-op. This is what makes every trigger idempotent: the schedule,
   the outbox fast path, and a manual rerun all collapse to at most one
   commit per actual content change.
3. **Publish** - one atomic GitHub commit via the Git Data API.
4. **Record** - one append-only row per publication (commit sha, tree
   digest, counts, trigger). A GitHub failure raises: no row, and the
   retrying task tries again later. Probes never wait on any of this.

Fast path and reconciliation: a successful evidence freeze enqueues a
``public_dataset_refresh_requested`` outbox event in the same transaction
(the pattern the evidence freeze itself uses), and a daily beat task is the
guaranteed path for anything the fast path missed. Both call this service;
the content-hash decision is what keeps them from fighting.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.dataset.builder import (
    build_dataset_tree,
    dataset_content_hash,
)
from app.modules.dataset.github import (
    commit_tree,
    dataset_github_config,
)
from app.modules.dataset.models import DatasetPublication
from app.modules.incidents.public_evidence import (
    PublicIncidentEvidenceRepository,
)
from app.modules.incidents.public_models import PublicIncident
from app.modules.incidents.public_schemas import (
    PublicIncidentDetailResponse,
)
from app.modules.vendors.models import VendorTracking

logger = logging.getLogger(__name__)

#: Outbox event type. Payload is ``{"reason": "freeze"}`` - content-free,
#: because the publisher re-derives everything from the database; the event
#: only means "something changed, go look".
EVENT_TYPE = "public_dataset_refresh_requested"

TRIGGER_OUTBOX = "outbox"
TRIGGER_SCHEDULED = "scheduled"

#: Published with every commit message; a human-readable pointer, not an id.
COMMIT_MESSAGE = "Publish public intelligence dataset (automated)"


@dataclass(frozen=True)
class PublicationOutcome:
    outcome: str  # "published" | "current" | "disabled"
    commit_sha: str | None = None
    content_hash: str | None = None
    file_count: int = 0


def enqueue_dataset_refresh(session: AsyncSession) -> None:
    """Request a dataset refresh in the caller's transaction.

    Called when an evidence freeze lands (the dataset's inputs changed).
    Content-free payload on purpose: the publisher re-derives the world
    from the database, so a redelivered or racing event is a no-op by
    content hash, not by event bookkeeping.
    """
    from app.modules.observations.models import OutboxEvent

    session.add(
        OutboxEvent(event_type=EVENT_TYPE, payload=json_reason("freeze"))
    )


def json_reason(reason: str) -> str:
    import json

    return json.dumps({"reason": reason})


async def handle_dataset_refresh(session: AsyncSession, payload: str) -> str:
    """Outbox handler for ``public_dataset_refresh_requested``.

    Returns the outcome string; transient GitHub/network failures raise so
    the event stays pending for the next outbox cycle, which is the retry
    semantics the at-least-once contract promises. A publisher that is not
    configured consumes the event as ``disabled`` - retrying cannot
    configure it.
    """
    outcome = await DatasetPublicationService().publish(session, TRIGGER_OUTBOX)
    if outcome.outcome == "disabled":
        return "disabled"
    return outcome.outcome


class DatasetPublicationRepository:
    @staticmethod
    async def latest_for_target(
        session: AsyncSession, target: str, branch: str
    ) -> DatasetPublication | None:
        result = await session.execute(
            select(DatasetPublication)
            .where(
                DatasetPublication.target == target,
                DatasetPublication.branch == branch,
            )
            .order_by(DatasetPublication.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def create(
        session: AsyncSession, publication: DatasetPublication
    ) -> DatasetPublication:
        session.add(publication)
        await session.flush()
        return publication


class DatasetPublicationService:
    def __init__(
        self,
        repository: DatasetPublicationRepository | None = None,
    ) -> None:
        self.repository = repository or DatasetPublicationRepository()

    # ------------------------------------------------------------------
    # Derivation
    # ------------------------------------------------------------------

    async def _collect_incidents(
        self, session: AsyncSession
    ) -> list[PublicIncidentDetailResponse]:
        """Every public incident as its canonical detail object.

        Read through the same service the API serves detail with, so the
        dataset cannot drift from the API's own answer about a record
        (including the evidence descriptor and the public-vendor gate).
        """
        from app.modules.incidents.public_service import PublicIncidentService

        rows = (
            await session.execute(
                select(PublicIncident).order_by(PublicIncident.started_at.asc())
            )
        ).scalars().all()
        details: list[PublicIncidentDetailResponse] = []
        service = PublicIncidentService()
        for row in rows:
            vendor = await session.get(VendorTracking, row.vendor_id)
            if vendor is None or not vendor.is_public:
                continue
            evidence = await PublicIncidentEvidenceRepository.latest_for_incident(
                session, row.id
            )
            details.append(
                service._to_detail(row, vendor, evidence=evidence)
            )
        return details

    async def _collect_vendors(
        self, session: AsyncSession
    ) -> list[dict]:
        """Catalog identity for every public vendor (registry fields only)."""
        rows = (
            await session.execute(
                select(VendorTracking)
                .where(VendorTracking.is_public.is_(True))
                .order_by(VendorTracking.vendor_name.asc())
            )
        ).scalars().all()
        return [
            {
                "vendor_name": v.vendor_name,
                "display_name": v.display_name,
                "category": v.category,
                "official_name": v.official_name,
                "website_url": v.website_url,
                "endpoint_url": v.endpoint_url,
            }
            for v in rows
        ]

    # ------------------------------------------------------------------
    # Publish
    # ------------------------------------------------------------------

    async def publish(
        self, session: AsyncSession, trigger: str
    ) -> PublicationOutcome:
        """Build, decide, publish, record. Idempotent per content state."""
        config = dataset_github_config()
        if config is None:
            return PublicationOutcome(outcome="disabled")

        incidents = await self._collect_incidents(session)
        vendors = await self._collect_vendors(session)

        evidence: dict[str, str] = {}
        for detail in incidents:
            artifact = await PublicIncidentEvidenceRepository.latest_for_incident(
                session, detail.incident_id
            )
            if artifact is not None:
                evidence[str(detail.incident_id)] = artifact.payload

        methodology = incidents[0].methodology_version if incidents else "v1.0"
        tree = build_dataset_tree(
            vendors=vendors,
            incidents=[i.model_dump(mode="json") for i in incidents],
            evidence=evidence,
            methodology_version=methodology,
            generator_version="1.0",
        )
        content_hash = dataset_content_hash(tree)

        latest = await self.repository.latest_for_target(
            session, config.target, config.branch
        )
        if latest is not None and latest.content_hash == content_hash:
            return PublicationOutcome(
                outcome="current",
                content_hash=content_hash,
                commit_sha=latest.commit_sha,
                file_count=len(tree),
            )

        # GitHubError propagates: no row is recorded, the next attempt
        # re-derives and re-decides. The task layer retries with backoff;
        # probes are never involved.
        commit_sha, tree_sha = await commit_tree(tree, COMMIT_MESSAGE, config=config)

        try:
            await self.repository.create(
                session,
                DatasetPublication(
                    target=config.target,
                    branch=config.branch,
                    content_hash=content_hash,
                    tree_sha=tree_sha,
                    commit_sha=commit_sha,
                    file_count=len(tree),
                    incident_count=len(incidents),
                    evidence_count=len(evidence),
                    vendor_count=len(vendors),
                    trigger=trigger,
                ),
            )
        except IntegrityError:
            # A concurrent publisher recorded this exact content state
            # first; the commit race on GitHub is the same outcome. The
            # winner's row is the answer.
            logger.info(
                "Dataset publication for %s@%s raced a concurrent publication",
                config.target,
                config.branch,
            )
            return PublicationOutcome(
                outcome="current",
                content_hash=content_hash,
                file_count=len(tree),
            )

        logger.info(
            "Published public dataset to %s@%s: commit=%s files=%s incidents=%s "
            "evidence=%s vendors=%s trigger=%s",
            config.target,
            config.branch,
            commit_sha,
            len(tree),
            len(incidents),
            len(evidence),
            len(vendors),
            trigger,
        )
        return PublicationOutcome(
            outcome="published",
            commit_sha=commit_sha,
            content_hash=content_hash,
            file_count=len(tree),
        )


dataset_publication_service = DatasetPublicationService()
