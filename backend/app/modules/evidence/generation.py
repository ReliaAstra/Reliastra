"""Evidence generation: idempotent artifact production for an incident.

Resolves the incident, computes metrics, renders, uploads, and records -
or returns the existing artifact when the inputs are unchanged. Failures
land on the incident as retryable state, never as half-written rows.
"""

from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_log import AuditLogService
from app.core.exceptions import ResourceNotFoundException
from app.infrastructure.storage import StorageError, storage_client
from app.modules.checks.repository import CheckRepository
from app.modules.evidence import design, signing
from app.modules.evidence.chart import render_latency_svg
from app.modules.evidence.constants import (
    DEFAULT_EVIDENCE_EXPIRY_DAYS,
)
from app.modules.evidence.context import EvidenceContext
from app.modules.evidence.errors import (
    EvidenceGenerationError,
    EvidenceNotEntitledError,
)
from app.modules.evidence.metrics import (
    IncidentWindowMetrics,
    compute_sla_impact,
    compute_window_metrics,
    summarise,
)
from app.modules.evidence.rendering import RENDERER_CHROMIUM, EvidenceRenderer
from app.modules.evidence.repository import (
    EvidenceRepository,
    EvidenceSnapshotRepository,
)
from app.modules.evidence.schemas import (
    EvidenceReportResponse,
)
from app.modules.incidents.constants import EvidenceStatus
from app.modules.incidents.repository import IncidentRepository

logger = logging.getLogger(__name__)


#: Payload shape version. Bumped when the canonical evidence document changes
#: meaningfully, so a verifier can tell which contract a hash was made under.
EVIDENCE_SCHEMA_VERSION = "2.0"


#: Attribution methodology is versioned separately: it describes how blame was
#: computed, not how the document is shaped.
DEFAULT_METHODOLOGY_VERSION = "v1.0"


#: Hard cap on observations carried in the document. The *metrics* are computed
#: from this set, so hitting the cap is disclosed in the artifact rather than
#: silently narrowing the window.
MAX_DOCUMENTED_OBSERVATIONS = 5000


#: SLA target the artifact measures against. 100% is the contractual promise
#: ("0s allowable outage"); it is stated in the document, not implied.
TARGET_UPTIME_PCT = 100.0


# The canonical serialisation moved to ``evidence.canonical`` so the public
# incident evidence artifacts hash their documents with the exact same
# function (one definition of "the bytes" for both artifact planes). The name
# stays importable from here - existing readers (and the service re-export)
# keep working unchanged.
from app.modules.evidence.canonical import canonical_json_bytes


class EvidenceGeneration:
    """Idempotent artifact production; delegates render + context."""

    def __init__(
        self,
        repository: EvidenceRepository,
        inc_repository: IncidentRepository,
        snapshot_repository: EvidenceSnapshotRepository,
        renderer: EvidenceRenderer,
        context: EvidenceContext,
    ) -> None:
        self.repository = repository
        self.inc_repository = inc_repository
        self.snapshot_repository = snapshot_repository
        self._renderer = renderer
        self._context = context

    async def generate_for_incident(
        self,
        session: AsyncSession,
        incident_id: uuid.UUID,
        *,
        force: bool = False,
    ) -> EvidenceReportResponse:
        """Generate (or return the existing) evidence artifact for an incident.

        Raises :class:`EvidenceNotEntitledError` when the plan excludes
        evidence, :class:`EvidenceGenerationError` for retryable failures, and
        records the outcome on the incident either way.
        """
        incident = await self.inc_repository.get_by_id(session, incident_id)
        if not incident:
            raise ResourceNotFoundException("Incident not found")
        try:
            await self._context._enforce_evidence_entitlement(session, incident.org_id)
        except EvidenceNotEntitledError as exc:
            # Not a failure and not silence: the incident carries a state the
            # console can render ("evidence not included in your plan"), and
            # the background task can return without burning retries on a
            # decision that will not change.
            await self._record_not_entitled(session, incident, str(exc))
            raise

        from app.modules.dependencies.repository import DependencyRepository

        dependency = await DependencyRepository.get_by_id(
            session, incident.dependency_id
        )
        if not dependency:
            raise ResourceNotFoundException("Dependency not found")

        # The addressee. The party reading this document is often somebody at
        # the provider who has never seen Reliastra, and the only identification
        # of the customer used to be an organization UUID - which tells the
        # vendor nothing while exposing a primary key to anyone holding the PDF.
        organization = await self._context._organization_for(session, incident.org_id)

        generated_at = datetime.now(timezone.utc)
        window_start = incident.started_at
        window_end = incident.resolved_at or generated_at

        rows = await CheckRepository.list_for_dependency_window(
            session,
            dependency.id,
            window_start,
            window_end,
            limit=MAX_DOCUMENTED_OBSERVATIONS,
        )
        total_in_window = await CheckRepository.count_for_dependency_window(
            session, dependency.id, window_start, window_end
        )
        truncated = total_in_window > len(rows)

        metrics: IncidentWindowMetrics = compute_window_metrics(
            rows, window_start=window_start, window_end=window_end
        )
        impact = compute_sla_impact(metrics, target_uptime_pct=TARGET_UPTIME_PCT)

        # Context metric, clearly separate from the incident measurement. A
        # dependency with no history has no rolling figure either - it is not
        # reported as 100%.
        rolling = await CheckRepository.get_aggregated_stats(
            session, dependency.id, window_hours=24
        )

        correlations = await self.inc_repository.get_correlations(session, incident_id)
        correlation_view = await self._context._correlation_view(session, correlations)

        from app.modules.attribution.repository import AttributionRepository

        attribution_result = await AttributionRepository.get_by_incident(
            session, incident.id
        )
        attribution = self._context._attribution_payload(attribution_result)
        methodology_version = (
            attribution_result.methodology_version
            if attribution_result
            else DEFAULT_METHODOLOGY_VERSION
        )

        detection = self._context._detection_context(incident)
        topology = self._context._topology_context(metrics.observation_points)
        observation_points = list(metrics.observation_points)

        chart_svg, chart_facts = render_latency_svg(
            [summarise(row) for row in rows],
            window_start=metrics.window_start,
            window_end=metrics.window_end,
            threshold_ms=(
                float(dependency.alert_threshold_ms)
                if getattr(dependency, "alert_threshold_ms", None)
                else None
            ),
        )

        evidence_data: dict[str, Any] = {
            "schema_version": EVIDENCE_SCHEMA_VERSION,
            "incident": {
                "id": str(incident.id),
                "org_id": str(incident.org_id),
                "dependency_id": str(incident.dependency_id),
                "started_at": incident.started_at.isoformat(),
                "resolved_at": (
                    incident.resolved_at.isoformat()
                    if incident.resolved_at
                    else None
                ),
                "severity": incident.severity,
                "status": incident.status,
                "root_cause": incident.root_cause,
            },
            "dependency": {
                "id": str(dependency.id),
                "name": dependency.name,
                "endpoint_url": dependency.endpoint_url,
                "configured_observation_points": list(dependency.regions or []),
            },
            "time_window": {
                "start": metrics.window_start.isoformat(),
                "end": metrics.window_end.isoformat(),
                "seconds": metrics.window_seconds,
            },
            "observation_topology": {
                "configured": topology["topology"],
                "label": topology["topology_label"],
                "observation_point_count": topology["observation_point_count"],
                "observation_points": observation_points,
                "independent_confirmation": topology["independent_confirmation"],
            },
            "detection": {
                "rule": detection["rule"],
                "reason": detection["reason"],
                "confirmed": detection["confirmed"],
                "consecutive_failures": detection["consecutive_failures"],
                "agreeing_observation_points": detection[
                    "agreeing_observation_points"
                ],
                "required": detection["required"],
            },
            "window_metrics": metrics.as_dict(),
            "sla_impact": impact.as_dict(),
            "chart": chart_facts.as_dict(),
            "observations_truncated": truncated,
            "observations_available_in_window": total_in_window,
            "observations": [self._context._observation_payload(row) for row in rows],
            "attribution": attribution,
            "methodology_version": methodology_version,
        }

        # The hash covers the *incident facts* only. A rolling 24-hour
        # aggregate evaluated at generation time is deliberately excluded: it
        # changes between two runs over the same incident, and including it
        # would make every retry produce a new data_hash and mint a duplicate
        # artifact. Context is still published, next to the hash, labelled as
        # what it is.
        payload_bytes = canonical_json_bytes(evidence_data)
        data_hash = hashlib.sha256(payload_bytes).hexdigest()
        # The signature covers the payload bytes, not the PDF: the payload is
        # the facts, this document is an arrangement of them. With no key
        # configured this is None, and the artifact prints "Unsigned" out loud
        # rather than omitting the row - a missing section reads as an
        # oversight, a stated absence reads as a fact about the deployment.
        signature = signing.sign_payload(payload_bytes)

        context_metrics = {
            "rolling_24h_uptime_pct": rolling.get("uptime_percentage"),
            "rolling_24h_avg_latency_ms": rolling.get("avg_latency_ms"),
            "rolling_24h_total_checks": rolling.get("total_checks"),
            "note": (
                "Rolling 24-hour health at generation time. Context only - it "
                "is not the incident measurement, it covers a different "
                "window, and it is not covered by data_hash."
            ),
        }

        # ── idempotency ───────────────────────────────────────────────────
        # Same facts => same data_hash => same artifact. A task retry, a
        # duplicated resolve or two workers racing all land here and return
        # the artifact that already exists instead of minting another.
        if not force and incident.resolved_at is None:
            # The incident is still open, so the window end is "now" and every
            # attempt would hash differently and mint a new artifact. There is
            # no final evidence for an incident that has not ended: return the
            # latest snapshot of it instead, and let an explicit regeneration
            # be the only way to take another. Once the incident resolves the
            # window is fixed and the normal data_hash idempotency applies.
            latest = await self.repository.get_by_incident(session, incident.id)
            if latest is not None:
                if incident.evidence_report_id != latest.id:
                    await self.inc_repository.set_evidence_state(
                        session,
                        incident,
                        status=EvidenceStatus.AVAILABLE.value,
                        error=None,
                        report_id=latest.id,
                    )
                logger.info(
                    "Incident %s is still open; returning existing evidence %s "
                    "instead of snapshotting the moving window again",
                    incident.id,
                    latest.id,
                )
                return EvidenceReportResponse.model_validate(latest)

        if not force:
            existing = await self.snapshot_repository.get_latest_for_incident(
                session, incident.id
            )
            if (
                existing is not None
                and existing.data_hash == data_hash
                and existing.report_file_path
            ):
                report = await self.repository.get_by_file_path(
                    session, existing.report_file_path
                )
                if report is not None:
                    if incident.evidence_report_id != report.id:
                        await self.inc_repository.set_evidence_state(
                            session,
                            incident,
                            status=EvidenceStatus.AVAILABLE.value,
                            error=None,
                            report_id=report.id,
                        )
                    logger.info(
                        "Evidence for incident %s already generated (data_hash "
                        "%s); returning existing report %s",
                        incident.id,
                        data_hash[:12],
                        report.id,
                    )
                    return EvidenceReportResponse.model_validate(report)

        verification_id = secrets.token_urlsafe(24).rstrip("=")

        ai_explanation = await self._maybe_explain(
            session=session,
            org_id=incident.org_id,
            attribution=attribution,
            metrics=metrics,
            impact=impact,
            observation_count=len(rows),
        )

        documented_rows, observation_caption = self._context._documented_observations(rows)
        expires_at = generated_at + timedelta(days=DEFAULT_EVIDENCE_EXPIRY_DAYS)

        def build_context(
            renderer_info: dict[str, Any] | None,
        ) -> tuple[dict[str, Any], str]:
            """Assemble the template context, and the footer text for the page.

            ``renderer_info`` is ``None`` on the first pass: which renderer
            produced a PDF is knowable only after it was produced, and a file
            cannot contain a fact about its own making - the same reason the
            document checksum is published beside it rather than inside it. If
            the fallback renderer is what actually ran, the document is rendered
            again with that stated on the page. A degraded artifact should cost
            one extra render and should say so where a reader will see it.
            """
            presentation = self._context._presentation_context(
                incident=incident,
                dependency=dependency,
                organization=organization,
                metrics=metrics,
                impact=impact,
                detection=detection,
                topology=topology,
                attribution=attribution,
                methodology_version=methodology_version,
                correlations=correlation_view,
                documented_rows=documented_rows,
                observation_caption=observation_caption,
                total_in_window=total_in_window,
                verification_id=verification_id,
                generated_at=generated_at,
                expires_at=expires_at,
                signature=signature,
                renderer=renderer_info,
            )
            context = {
                "incident": incident,
                "dependency": dependency,
                "metrics": metrics,
                "impact": impact,
                "rolling": rolling,
                "detection": detection,
                "topology": topology,
                "chart_svg": chart_svg,
                # dict form: the same keys the JSON payload carries, so what the
                # document states and what the machine-readable record states
                # cannot drift apart.
                "chart_facts": chart_facts.as_dict(),
                "observations_truncated": truncated,
                "observations_available_in_window": total_in_window,
                "observation_count": len(rows),
                "attribution": attribution,
                "methodology_version": methodology_version,
                "ai_explanation": ai_explanation,
                "data_hash": data_hash,
                "signature": signature,
                "verification_id": verification_id,
                "generated_at": generated_at.isoformat(),
                "schema_version": EVIDENCE_SCHEMA_VERSION,
                "target_uptime_pct": TARGET_UPTIME_PCT,
                **presentation,
            }
            return context, presentation["document"]["reference"]

        try:
            context, reference = build_context(None)
            html = self._renderer._render_html(context)
            pdf_bytes, renderer = await self._renderer._html_to_pdf(html, footer_note=reference)
            if renderer.get("renderer") != RENDERER_CHROMIUM:
                context, reference = build_context(renderer)
                html = self._renderer._render_html(context)
                pdf_bytes, renderer = await self._renderer._html_to_pdf(
                    html, footer_note=reference
                )
        except EvidenceNotEntitledError:
            raise
        except Exception as exc:
            await self._record_failure(
                session, incident, f"render failed: {exc}", event="EVIDENCE_RENDER_FAILED"
            )
            raise EvidenceGenerationError(f"Evidence render failed: {exc}") from exc

        report_checksum = hashlib.sha256(pdf_bytes).hexdigest()

        generation_key = uuid.uuid4().hex
        base_path = f"evidence/{incident.org_id}/{incident.id}/{generation_key}"
        report_path = f"{base_path}.pdf"
        json_path = f"{base_path}.json"
        json_document = {
            **evidence_data,
            "context_metrics": context_metrics,
            "data_hash": data_hash,
            "verification_id": verification_id,
            "report_checksum": report_checksum,
            "generated_at": generated_at.isoformat(),
            # Authenticity of the pair. Kept out of ``evidence_data`` because
            # that object is the hashed facts: these fields describe how the
            # document was issued, not what was measured.
            "authenticity": {
                "signed": signature is not None,
                "algorithm": (signature or {}).get("alg"),
                "encoding": (signature or {}).get("encoding"),
                "signing_key_id": (signature or {}).get("key_id"),
                "signature": (signature or {}).get("value"),
                "signature_covers": "canonical payload bytes (data_hash)",
                "public_keys": design.keys_api_url(),
                "verification_url": design.verification_url(verification_id),
                "renderer": renderer.get("renderer"),
                "renderer_version": renderer.get("renderer_version"),
                "pagination": renderer.get("pagination"),
            },
        }

        # ── persist, then verify, then record ─────────────────────────────
        # The order matters. A report row is a claim that the artifact exists,
        # so it is written only after both objects are in the bucket and have
        # been stat'ed back. A failure before that point leaves no row and no
        # stale reference - the incident simply carries `failed` and a reason.
        try:
            storage_client.upload_bytes(pdf_bytes, report_path, "application/pdf")
            storage_client.upload_bytes(
                canonical_json_bytes(json_document), json_path, "application/json"
            )
            stored = storage_client.stat_object(report_path)
            if int(stored.get("size_bytes") or 0) != len(pdf_bytes):
                raise EvidenceGenerationError(
                    "Stored PDF size "
                    f"{stored.get('size_bytes')} does not match the rendered "
                    f"{len(pdf_bytes)} bytes"
                )
        except (StorageError, EvidenceGenerationError) as exc:
            # Both arms mean the artifact is not safely in the bucket: the
            # upload failed, or it "succeeded" and the object that came back
            # was not what was written. Either way the incident must say so,
            # and no report row may be created.
            await self._record_failure(
                session, incident, f"storage failed: {exc}", event="EVIDENCE_STORAGE_FAILED"
            )
            raise EvidenceGenerationError(f"Evidence upload failed: {exc}") from exc

        report = await self.repository.create(
            session=session,
            org_id=incident.org_id,
            incident_id=incident.id,
            file_path=report_path,
            file_size_bytes=len(pdf_bytes),
            checksum=report_checksum,
            expires_at=expires_at,
            renderer=renderer.get("renderer"),
            renderer_version=renderer.get("renderer_version"),
        )

        # Link the artifact to the incident in the same transaction, so the
        # console never has to guess whether a report exists.
        await self.inc_repository.set_evidence_state(
            session,
            incident,
            status=EvidenceStatus.AVAILABLE.value,
            error=None,
            report_id=report.id,
        )

        await self.snapshot_repository.create(
            session,
            incident_id=incident.id,
            org_id=incident.org_id,
            dependency_id=dependency.id,
            time_window_start=metrics.window_start,
            time_window_end=metrics.window_end,
            observation_ids=[str(row.id) for row in rows],
            attribution_result=attribution,
            methodology_version=methodology_version,
            data_hash=data_hash,
            verification_id=verification_id,
            report_file_path=report_path,
            report_checksum=report_checksum,
            json_evidence_path=json_path,
            signature=(signature or {}).get("value"),
            signature_alg=(signature or {}).get("alg"),
            signing_key_id=(signature or {}).get("key_id"),
        )

        await AuditLogService.log_event(
            session=session,
            event_type="EVIDENCE_GENERATED",
            org_id=incident.org_id,
            resource_type="evidence_snapshot",
            resource_id=str(report.id),
            payload={
                "incident_id": str(incident.id),
                "report_id": str(report.id),
                "data_hash": data_hash,
                "report_checksum": report_checksum,
                "verification_id": verification_id,
                "schema_version": EVIDENCE_SCHEMA_VERSION,
                "window_start": metrics.window_start.isoformat(),
                "window_end": metrics.window_end.isoformat(),
                "measured_checks": metrics.measured_checks,
                "availability_pct": metrics.availability_pct,
                "impact_pct": impact.impact_pct,
                "detection_rule": detection["rule"],
                "observation_point_count": topology["observation_point_count"],
                "observations_truncated": truncated,
                "signed": signature is not None,
                "signing_key_id": (signature or {}).get("key_id"),
                "renderer": renderer.get("renderer"),
                "renderer_version": renderer.get("renderer_version"),
            },
        )

        await self._notify(session, incident, report, verification_id)

        return EvidenceReportResponse.model_validate(report)

    async def _record_not_entitled(
        self, session: AsyncSession, incident: Any, message: str
    ) -> None:
        """Persist the deliberate "plan does not include this" state.

        Committed for the same reason as :meth:`_record_failure`: the caller is
        about to propagate the exception, and a state that is rolled back is
        indistinguishable from one that was never set.
        """
        reason = message.split(": ", 1)[-1][:2000]
        logger.info(
            "Evidence generation not entitled for incident %s (org %s): %s",
            incident.id,
            incident.org_id,
            reason,
        )
        try:
            await self.inc_repository.set_evidence_state(
                session,
                incident,
                status=EvidenceStatus.NOT_ENTITLED.value,
                error=reason,
            )
            await AuditLogService.log_event(
                session=session,
                event_type="EVIDENCE_SKIPPED_NOT_ENTITLED",
                org_id=incident.org_id,
                resource_type="incident",
                resource_id=str(incident.id),
                payload={"reason": reason},
            )
            await session.commit()
        except Exception:  # pragma: no cover - never mask the original outcome
            logger.exception(
                "Could not persist evidence not-entitled state for incident %s",
                incident.id,
            )

    async def _record_failure(
        self,
        session: AsyncSession,
        incident: Any,
        message: str,
        *,
        event: str,
    ) -> None:
        """Persist a failed attempt on the incident and in the audit log.

        The incident is preserved; only the evidence state changes. The console
        reads ``evidence_status``/``evidence_error`` and can offer a retry, so
        a failure is never an unexplained "none".

        This commits. Every caller of this method is about to re-raise: a Celery
        task re-raises into ``autoretry_for`` and ``async_task_body`` rolls the
        session back, and an HTTP caller turns the exception into an error
        response. Writing the failure state through the session without
        committing would roll it back with everything else, and the incident
        would be left looking like evidence was never attempted. A failure that
        is not durable is indistinguishable from a bug, so it is committed here
        and the caller's rollback then has nothing to undo.
        """
        logger.exception(
            "Evidence generation failed for incident %s: %s", incident.id, message
        )
        try:
            await self.inc_repository.set_evidence_state(
                session,
                incident,
                status=EvidenceStatus.FAILED.value,
                error=message[:2000],
            )
            await AuditLogService.log_event(
                session=session,
                event_type=event,
                org_id=incident.org_id,
                resource_type="incident",
                resource_id=str(incident.id),
                payload={"error": message[:2000]},
            )
            await session.commit()
        except Exception:  # pragma: no cover - never mask the original failure
            logger.exception(
                "Could not persist evidence failure state for incident %s",
                incident.id,
            )

    async def _maybe_explain(
        self,
        *,
        session: AsyncSession,
        org_id: uuid.UUID,
        attribution: dict[str, Any] | None,
        metrics: IncidentWindowMetrics,
        impact: Any,
        observation_count: int,
    ) -> str | None:
        """Optional narrative. AI failure can never block factual evidence."""
        try:
            from app.modules.ai_integration.service import ai_service

            return await ai_service.generate_explanation(
                context={
                    "attribution": attribution,
                    "window_availability_pct": metrics.availability_pct,
                    "measured_checks": metrics.measured_checks,
                    "down_checks": metrics.down_checks,
                    "sla_impact_pct": impact.impact_pct,
                    "observation_count": observation_count,
                    "observation_point_count": len(metrics.observation_points),
                },
                instruction=(
                    "Explain the measured incident window and the recorded "
                    "detection rule in language suitable for an SLA evidence "
                    "report. Do not state figures that are not in the context."
                ),
                session=session,
                org_id=org_id,
            )
        except Exception as exc:
            logger.warning("AI explanation unavailable: %s", exc)
            return None

    async def _notify(
        self, session: AsyncSession, incident: Any, report: Any, verification_id: str
    ) -> None:
        try:
            from app.modules.notifications.schemas import AlertPayload
            from app.modules.notifications.service import notification_service

            await notification_service.dispatch_alert(
                session,
                AlertPayload(
                    org_id=incident.org_id,
                    incident_id=incident.id,
                    severity=incident.severity,
                    title="SLA Evidence Report Generated",
                    body=(
                        f"Evidence report generated for incident {incident.id}. "
                        f"Verification ID: {verification_id}"
                    ),
                    metadata={
                        "report_id": str(report.id),
                        "verification_id": verification_id,
                        "checksum": report.checksum,
                        "download_url": storage_client.get_presigned_url(
                            report.file_path, 3600
                        ),
                    },
                ),
            )
        except Exception as exc:
            logger.warning(
                "Could not dispatch alert for evidence report %s: %s",
                report.id,
                exc,
            )

        # The artifact is retrievable from this moment, so `evidence.ready` is
        # sent here rather than when generation was requested: a subscriber that
        # acts on the event can immediately call the API for it. Non-fatal, like
        # the alert above - an unreachable subscriber must not fail generation.
        from app.modules.webhooks.dispatch import dispatch_event_after_commit

        dispatch_event_after_commit(
            session,
            incident.org_id,
            "evidence.ready",
            {
                "report_id": str(report.id),
                "incident_id": str(incident.id),
                "dependency_id": str(incident.dependency_id),
                "verification_id": verification_id,
                "checksum": report.checksum,
                "generated_at": (
                    report.generated_at.isoformat() if report.generated_at else None
                ),
                "expires_at": (
                    report.expires_at.isoformat() if report.expires_at else None
                ),
            },
        )
