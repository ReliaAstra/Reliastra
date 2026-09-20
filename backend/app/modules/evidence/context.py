"""Evidence context: the facts a report is built from.

Pure builders over incident data - organization, correlations, documented
observations, attribution, topology and detection wording - plus the
entitlement gate. No rendering, no storage, no side effects.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import ResourceNotFoundException
from app.modules.evidence import design
from app.modules.evidence.chart import HEIGHT as CHART_HEIGHT
from app.modules.evidence.chart import WIDTH as CHART_WIDTH
from app.modules.evidence.constants import (
    DEFAULT_EVIDENCE_EXPIRY_DAYS,
)
from app.modules.evidence.errors import EvidenceNotEntitledError
from app.modules.evidence.metrics import (
    IncidentWindowMetrics,
)
from app.modules.evidence.qr import render_qr_svg

logger = logging.getLogger(__name__)


#: How many individual checks are reproduced inside the PDF itself. The metrics
#: are computed from the whole documented window either way; this is the size of
#: the *appendix*, chosen so a typical incident prints in full while a
#: pathological one stays printable. Anything withheld is counted on the page
#: and present in the machine-readable payload.
DOCUMENTED_OBSERVATION_ROWS = 60
DOCUMENTED_OBSERVATION_HEAD = 40
DOCUMENTED_OBSERVATION_TAIL = 20


class EvidenceContext:
    """Stateless builders for report facts plus the entitlement gate."""

    @staticmethod
    async def _organization_for(
        session: AsyncSession, org_id: uuid.UUID
    ) -> Any | None:
        """The organization row, or ``None``. Never a reason to refuse an artifact.

        The name is what a recipient reads as the addressee; the identifier is
        what a support agent resolves. If the name cannot be read, the document
        falls back to the identifier it has always printed rather than inventing
        an addressee.
        """
        from app.modules.organizations.repository import OrganizationRepository

        try:
            return await OrganizationRepository.get_by_id(session, org_id)
        except Exception:  # pragma: no cover - defensive against a read failure
            logger.warning(
                "evidence: organization name could not be read for %s",
                org_id,
                exc_info=True,
            )
            return None

    @staticmethod
    def _addressee(organization: Any | None, org_id: uuid.UUID) -> tuple[str, str]:
        """``(prepared_for, org_ref)``. Only a real string counts as a name.

        ``getattr`` on a half-populated object can yield anything; the document
        prints a name or it prints the identifier, so the type is checked rather
        than trusted.
        """
        name = getattr(organization, "name", None)
        if isinstance(name, str) and name.strip():
            return name.strip(), str(org_id)
        return f"Organization {org_id}", str(org_id)

    @staticmethod
    async def _correlation_view(
        session: AsyncSession, rows: Sequence[Any]
    ) -> list[dict[str, Any]]:
        """Correlated dependencies, named - in one batched query.

        The document must read "Payments Webhook", not ``dep_01J8\u2026``: a
        reader who cannot name the second dependency cannot use the correlation.
        An id that no longer resolves is stated as unresolved instead of being
        dropped, because a silently shrinking table is how a record becomes
        unreliable.
        """
        if not rows:
            return []
        from app.modules.dependencies.repository import DependencyRepository

        ids = {row.correlated_dependency_id for row in rows}
        try:
            found = await DependencyRepository.get_names_by_ids(session, ids)
        except Exception:  # pragma: no cover - defensive against a read failure
            logger.warning(
                "evidence: correlated dependency names could not be read",
                exc_info=True,
            )
            found = {}
        return [
            {
                "name": (found.get(row.correlated_dependency_id) or {}).get("name")
                or f"unresolved dependency {str(row.correlated_dependency_id)[:8]}",
                "endpoint_url": (
                    found.get(row.correlated_dependency_id) or {}
                ).get("endpoint_url") or "endpoint not recorded",
                "correlation_method": row.correlation_method,
                "time_window_seconds": row.time_window_seconds,
                "correlation_confidence": row.correlation_confidence,
            }
            for row in rows
        ]

    @staticmethod
    def _documented_observations(
        rows: Sequence[Any], *, limit: int = DOCUMENTED_OBSERVATION_ROWS
    ) -> tuple[list[Any], str]:
        """The checks reproduced in the appendix, oldest first, with a caption.

        The caption is part of the return value on purpose: an appendix that
        does not state its own coverage is the failure this template used to
        have, when it promised "the first N are documented here" and documented
        nothing. When the window is longer than the appendix it shows the opening
        and the end, because first-failure and recovery are the two rows a
        reader looks for.
        """
        ordered = sorted(rows, key=lambda row: (row.executed_at, str(row.id)))
        if len(ordered) <= limit:
            return ordered, f"All {len(ordered)} documented check(s)"
        head = ordered[:DOCUMENTED_OBSERVATION_HEAD]
        tail = ordered[-DOCUMENTED_OBSERVATION_TAIL:]
        withheld = len(ordered) - len(head) - len(tail)
        return (
            [*head, *tail],
            (
                f"First {len(head)} and last {len(tail)} of {len(ordered)} documented "
                f"check(s); {withheld} withheld from print, present in the payload"
            ),
        )

    def _presentation_context(
        self,
        *,
        incident: Any,
        dependency: Any,
        organization: Any | None,
        metrics: IncidentWindowMetrics,
        impact: Any,
        detection: dict[str, Any],
        topology: dict[str, Any],
        attribution: dict[str, Any] | None,
        methodology_version: str,
        correlations: list[dict[str, Any]],
        documented_rows: list[Any],
        observation_caption: str,
        total_in_window: int,
        verification_id: str,
        generated_at: datetime,
        expires_at: datetime,
        signature: dict[str, str] | None,
        renderer: dict[str, Any],
    ) -> dict[str, Any]:
        """Everything the document shows that the payload does not carry.

        Built in Python rather than in markup on purpose: a report of record
        needs its wording derived from the same objects the JSON artifact is
        built from, and a function is testable in a way a template is not. The
        finding block, the four figures, the limitations sentence and the
        appendix caption all come from here, and each restates a figure printed
        below it - nothing in the finding is a fact the record does not already
        carry.
        """
        prepared_for, org_ref = self._addressee(organization, incident.org_id)
        base_url = design.verification_base_url()
        metrics_view = metrics.as_dict()
        impact_view = impact.as_dict()

        limitations: list[str] = []
        if not topology.get("independent_confirmation"):
            limitations.append(
                "every observation was issued from "
                f"{topology.get('observation_point_count', 1)} RELIASTRA observation "
                "point(s), so no agreement between independent points exists"
            )
        if metrics_view["availability_pct"] is None:
            limitations.append(
                "no check inside the window reached the endpoint, so no availability "
                "figure is stated and none is implied"
            )
        if metrics.blocked_checks:
            limitations.append(
                f"{metrics.blocked_checks} scheduled check(s) were refused by outbound "
                "security policy and are excluded from every figure"
            )
        if total_in_window > len(documented_rows):
            limitations.append(
                f"{total_in_window - len(documented_rows)} check(s) in the window are "
                "retained in the payload but not reprinted here"
            )
        limitations.append(
            "nothing here was measured by the dependency provider, whose own telemetry "
            "may describe the same interval differently"
        )

        return {
            "document": {
                "reference": design.report_reference(
                    dependency.name, incident.started_at, str(incident.id)
                ),
                "class_line": (
                    "Independently measured \u00b7 signed record"
                    if signature
                    else "Independently measured \u00b7 unsigned by this deployment"
                ),
                "prepared_for": prepared_for,
                "org_ref": org_ref,
                "issued_stamp": design.utc_stamp(generated_at),
                "issued_date": design.utc_date(generated_at),
                "expires_date": design.utc_date(expires_at),
                "retention_days": DEFAULT_EVIDENCE_EXPIRY_DAYS,
                "expired": False,
                "window": design.window_phrase(
                    metrics.window_start, metrics.window_end
                ),
                "record_state": (
                    "Final \u00b7 incident resolved"
                    if incident.resolved_at
                    else "Provisional \u00b7 incident still open"
                ),
                "observation_caption": observation_caption,
                "verification_url": design.verification_url(verification_id),
                "qr_svg": render_qr_svg(design.verification_url(verification_id)),
                "jwks_url": design.keys_api_url(),
                "site_url": base_url,
                "support_email": str(getattr(settings, "SUPPORT_EMAIL", "") or ""),
                "chart_note": (
                    f"{CHART_WIDTH}\u00d7{CHART_HEIGHT} unit drawing, scaled to page width"
                ),
                "renderer": (
                    "unknown renderer \u00b7 provenance is recorded with the artifact only"
                    if renderer is None
                    else (
                        f"{renderer.get('renderer')}"
                        + (
                            f" {renderer.get('renderer_version')}"
                            if renderer.get("renderer_version")
                            else ""
                        )
                        + f" \u00b7 {renderer.get('pagination')}"
                    )
                ),
                "limitations": limitations,
            },
            "verdict": {
                "headline": design.headline(
                    incident={"severity": incident.severity, "status": incident.status},
                    metrics=metrics_view,
                    dependency_name=dependency.name,
                ),
                "sentences": design.verdict_sentences(
                    dependency_name=dependency.name,
                    endpoint_url=dependency.endpoint_url,
                    metrics=metrics_view,
                    impact=impact_view,
                    attribution=attribution,
                    detection=detection,
                    topology=topology,
                    incident={"severity": incident.severity, "status": incident.status},
                ),
            },
            "figures": [
                {"label": tile.label, "value": tile.value, "note": tile.note}
                for tile in design.metric_tiles(metrics_view, impact_view, attribution)
            ],
            "correlations": correlations,
            "observations": [
                self._observation_payload(row) for row in documented_rows
            ],
        }

    @staticmethod
    def _attribution_payload(result: Any | None) -> dict[str, Any] | None:
        if result is None:
            return None
        return {
            "id": str(result.id),
            "classification": result.classification,
            "confidence_score": result.confidence_score,
            "signal_breakdown": result.signal_breakdown,
            "supporting_evidence": result.supporting_evidence,
            "contradicting_evidence": result.contradicting_evidence,
            "methodology_version": result.methodology_version,
        }

    @staticmethod
    def _observation_payload(row: Any) -> dict[str, Any]:
        """One check result, as it appears in the evidence document.

        Sourced from ``check_results`` (synchronous, authoritative) rather than
        the asynchronously drained ``observations`` table, so the document
        cannot miss the checks that closed the incident.
        """
        return {
            "id": str(row.id),
            "executed_at": row.executed_at.isoformat(),
            "source": "check_result",
            "observation_point": row.region,
            "endpoint_url": None,
            "latency_ms": row.latency_ms,
            "status_code": row.status_code,
            "is_up": bool(row.is_up),
            "error_message": row.error_message,
            "detector_confirmed": bool(row.quorum_confirmed),
        }

    async def _enforce_evidence_entitlement(
        self, session: AsyncSession, org_id: uuid.UUID
    ) -> None:
        """Raise unless the organization's effective plan includes evidence.

        Pro-unlocked evaluation is authoritative: a Free org inside its
        evaluation window has Pro features, so generation succeeds; once the
        window expires the effective plan falls back to Free and this gate
        correctly blocks. Client state is never trusted.
        """
        from app.core.permissions import plan_allows_feature
        from app.modules.organizations.repository import OrganizationRepository

        org = await OrganizationRepository.get_by_id(session, org_id)
        if org is None:
            raise ResourceNotFoundException("Organization not found")
        if not plan_allows_feature(org, "evidence_generation"):
            raise EvidenceNotEntitledError(
                "Evidence reports are not available on your current plan. "
                "Upgrade to Pro or higher to generate SLA evidence."
            )

    @staticmethod
    def _topology_context(observation_points: Sequence[str]) -> dict[str, Any]:
        """Wording that matches the configured observation topology.

        The artifact must never claim independent confirmation it does not
        have. Under a single observation point the document says so, and the
        detection rule is described as persistence rather than agreement.
        """
        topology = str(getattr(settings, "OBSERVATION_TOPOLOGY", "single"))
        single = topology != "multi"
        return {
            "topology": topology,
            "topology_label": (
                "Single observation point"
                if single
                else "Multiple independent observation points"
            ),
            "topology_statement": (
                "Every check in this report was issued from one RELIASTRA "
                "observation point. Confirmation is by persistence of failure, "
                "not by agreement between independent points."
                if single
                else "Checks in this report were issued from independent "
                "RELIASTRA observation points and confirmed by agreement "
                "between them."
            ),
            "observation_point_count": len(set(observation_points)),
            "independent_confirmation": not single,
        }

    @staticmethod
    def _detection_context(incident: Any) -> dict[str, Any]:
        """The rule that opened this incident, as recorded when it opened.

        Legacy incidents opened before detection provenance was persisted have
        no rule on the row; the document says "not recorded" rather than
        guessing, which is the difference between an artifact and a story.
        """
        metadata = getattr(incident, "detection_metadata", None) or {}
        rule = getattr(incident, "detection_rule", None)
        return {
            "rule": rule or None,
            "rule_label": (
                "Consecutive failed checks (single observation point)"
                if rule == "single.consecutive_failures"
                else "Observation-point quorum"
                if rule == "multi.observation_quorum"
                else rule or "not recorded"
            ),
            "reason": metadata.get("reason"),
            "confirmed": bool(metadata.get("confirmed", False)) if metadata else None,
            "consecutive_failures": metadata.get("consecutive_failures"),
            "agreeing_observation_points": metadata.get(
                "agreeing_observation_points"
            ),
            "required": metadata.get("required"),
            "recorded": bool(rule),
        }
