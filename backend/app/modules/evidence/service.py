"""SLA evidence generation.

An evidence artifact is the one thing in this product a customer hands to
someone else as proof, so the rules here are stricter than elsewhere:

* **Every figure comes from the incident's own window.** ``check_results``
  inside ``[started_at, resolved_at]`` - the authoritative, synchronously
  written record - reduced by :mod:`app.modules.evidence.metrics`. A rolling
  24-hour aggregate is still computed, but it is labelled as context and never
  presented as the incident measurement.
* **Nothing is fabricated.** The report states the detection rule that
  actually fired (persisted on the incident when it opened) and draws its chart
  from the observations it carries. Where a value cannot be computed it is
  reported as unavailable, with the reason.
* **Two hashes, two meanings.** ``data_hash`` is the SHA-256 of the canonical
  JSON evidence payload - the facts. ``report_checksum`` is the SHA-256 of the
  rendered PDF bytes - the document. They are different values describing
  different things and neither substitutes for the other.
* **A report row means the artifact exists.** The database row is written only
  after both object uploads have been verified in the bucket, so a row whose
  PDF cannot be retrieved cannot come into existence. Failures are recorded on
  the incident (``evidence_status``/``evidence_error``) and are retryable.
* **Generation is idempotent.** The same inputs produce the same ``data_hash``;
  a task retry, a duplicated resolve or a concurrent worker finds the existing
  artifact and returns it instead of minting a second one. Explicit
  regeneration (``force=True``) is the only path that creates a new artifact
  for unchanged inputs.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import logging
import os
import secrets
import uuid
from collections.abc import Sequence
from datetime import datetime, timedelta, timezone
from typing import Any

import jinja2
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.audit_log import AuditLogService
from app.core.exceptions import ForbiddenException, ResourceNotFoundException
from app.infrastructure.storage import StorageError, storage_client
from app.modules.checks.repository import CheckRepository
from app.modules.evidence.chart import render_latency_svg
from app.modules.evidence.constants import (
    DEFAULT_EVIDENCE_EXPIRY_DAYS,
    EVIDENCE_TEMPLATE_PATH,
)
from app.modules.evidence.metrics import (
    IncidentWindowMetrics,
    compute_sla_impact,
    compute_window_metrics,
    summarise,
)
from app.modules.evidence.repository import (
    EvidenceRepository,
    EvidenceSnapshotRepository,
)
from app.modules.evidence.schemas import (
    EvidenceReportDownloadResponse,
    EvidenceReportResponse,
)
from app.modules.incidents.constants import EvidenceStatus
from app.modules.incidents.repository import IncidentRepository

logger = logging.getLogger(__name__)

_TEMPLATE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    EVIDENCE_TEMPLATE_PATH,
)

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


class EvidenceNotEntitledError(ForbiddenException):
    """The organization's plan does not include evidence generation.

    Raised (rather than logged and swallowed) so the *caller* decides what it
    means: the HTTP surface turns it into a 403 with an upgrade message, and
    the background task records ``evidence_status = not_entitled`` and does not
    retry. A permission problem is not a transient failure and must not be
    retried three times.
    """


class EvidenceGenerationError(RuntimeError):
    """Generation failed in a way that is safe to retry."""


def canonical_json_bytes(payload: dict[str, Any]) -> bytes:
    """Serialise the evidence payload deterministically.

    Sorted keys, compact separators and ``ensure_ascii=False`` so the same
    facts always produce the same bytes - and therefore the same
    ``data_hash`` - regardless of insertion order or platform locale. This is
    the only serialisation that may be hashed.
    """
    return json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


class EvidenceService:
    def __init__(
        self,
        repository: EvidenceRepository = EvidenceRepository(),
        inc_repository: IncidentRepository = IncidentRepository(),
        snapshot_repository: EvidenceSnapshotRepository = EvidenceSnapshotRepository(),
    ) -> None:
        self.repository = repository
        self.inc_repository = inc_repository
        self.snapshot_repository = snapshot_repository
        self.jinja_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(os.path.dirname(_TEMPLATE_PATH)),
            autoescape=True,
        )

    # ── rendering ─────────────────────────────────────────────────────────

    def _render_html(self, context: dict[str, Any]) -> str:
        template = self.jinja_env.get_template(os.path.basename(_TEMPLATE_PATH))
        return template.render(**context)

    @staticmethod
    def _pdf_via_xhtml2pdf(html_str: str) -> bytes:
        """Fallback renderer. Runs in a worker thread via ``asyncio.to_thread``."""
        from xhtml2pdf import pisa

        buffer = io.BytesIO()
        status = pisa.CreatePDF(io.StringIO(html_str), dest=buffer)
        if status.err:
            raise EvidenceGenerationError(
                "PDF generation failed via xhtml2pdf"
            )
        data = buffer.getvalue()
        if not data:
            raise EvidenceGenerationError("PDF renderer produced an empty document")
        return data

    async def _html_to_pdf(self, html_str: str) -> bytes:
        """Render HTML to PDF. Playwright first, xhtml2pdf as a fallback.

        Both paths raise on failure: an artifact that cannot be rendered must
        fail the generation attempt rather than produce an empty or partial
        document that still gets a checksum.
        """
        try:
            from playwright.async_api import async_playwright
        except Exception as exc:  # pragma: no cover - optional dependency
            logger.info("Playwright unavailable (%s), using xhtml2pdf", exc)
        else:
            try:
                async with async_playwright() as playwright:
                    browser = await playwright.chromium.launch(headless=True)
                    try:
                        page = await browser.new_page()
                        await page.set_content(html_str)
                        data = await page.pdf(format="A4", print_background=True)
                    finally:
                        await browser.close()
                if not data:
                    raise EvidenceGenerationError(
                        "Playwright produced an empty document"
                    )
                return data
            except Exception as exc:
                logger.info(
                    "Playwright PDF generation unavailable (%s), using "
                    "xhtml2pdf fallback",
                    exc,
                )

        return await asyncio.to_thread(self._pdf_via_xhtml2pdf, html_str)

    # ── payloads ──────────────────────────────────────────────────────────

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

    # ── entitlement ───────────────────────────────────────────────────────

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

    # ── topology wording ──────────────────────────────────────────────────

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

    # ── generation ────────────────────────────────────────────────────────

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
            await self._enforce_evidence_entitlement(session, incident.org_id)
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

        from app.modules.attribution.repository import AttributionRepository

        attribution_result = await AttributionRepository.get_by_incident(
            session, incident.id
        )
        attribution = self._attribution_payload(attribution_result)
        methodology_version = (
            attribution_result.methodology_version
            if attribution_result
            else DEFAULT_METHODOLOGY_VERSION
        )

        detection = self._detection_context(incident)
        topology = self._topology_context(metrics.observation_points)
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
            "observations": [self._observation_payload(row) for row in rows],
            "attribution": attribution,
            "methodology_version": methodology_version,
        }

        # The hash covers the *incident facts* only. A rolling 24-hour
        # aggregate evaluated at generation time is deliberately excluded: it
        # changes between two runs over the same incident, and including it
        # would make every retry produce a new data_hash and mint a duplicate
        # artifact. Context is still published, next to the hash, labelled as
        # what it is.
        data_hash = hashlib.sha256(canonical_json_bytes(evidence_data)).hexdigest()

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

        try:
            html = self._render_html(
                {
                    "incident": incident,
                    "dependency": dependency,
                    "correlations": correlations,
                    "metrics": metrics,
                    "impact": impact,
                    "rolling": rolling,
                    "detection": detection,
                    "topology": topology,
                    "chart_svg": chart_svg,
                    # dict form: the same keys the JSON payload carries, so
                    # what the document states and what the machine-readable
                    # record states cannot drift apart.
                    "chart_facts": chart_facts.as_dict(),
                    "observations_truncated": truncated,
                    "observations_available_in_window": total_in_window,
                    "observation_count": len(rows),
                    "attribution": attribution,
                    "methodology_version": methodology_version,
                    "ai_explanation": ai_explanation,
                    "data_hash": data_hash,
                    "verification_id": verification_id,
                    "generated_at": generated_at.isoformat(),
                    "schema_version": EVIDENCE_SCHEMA_VERSION,
                    "target_uptime_pct": TARGET_UPTIME_PCT,
                }
            )
            pdf_bytes = await self._html_to_pdf(html)
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

        expires_at = generated_at + timedelta(days=DEFAULT_EVIDENCE_EXPIRY_DAYS)
        report = await self.repository.create(
            session=session,
            org_id=incident.org_id,
            incident_id=incident.id,
            file_path=report_path,
            file_size_bytes=len(pdf_bytes),
            checksum=report_checksum,
            expires_at=expires_at,
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
            },
        )

        await self._notify(session, incident, report, verification_id)

        return EvidenceReportResponse.model_validate(report)

    # ── helpers ───────────────────────────────────────────────────────────

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

    # ── read paths ────────────────────────────────────────────────────────

    async def list_reports(
        self, session: AsyncSession, org_id: uuid.UUID, limit: int = 50
    ) -> list[EvidenceReportResponse]:
        reports = await self.repository.list_for_org(session, org_id, limit=limit)
        return [EvidenceReportResponse.model_validate(item) for item in reports]

    async def get_report_download(
        self, session: AsyncSession, org_id: uuid.UUID, report_id: uuid.UUID
    ) -> EvidenceReportDownloadResponse:
        """Issue a signed download URL for a report whose PDF is verified present.

        The stored object is stat'ed first. A record whose artifact has been
        deleted from the bucket is a broken artifact and must be reported as
        one - issuing a link that 404s would be worse than an error.
        """
        from app.infrastructure.storage import StorageObjectMissing

        report = await self.repository.get_by_id(session, report_id)
        if not report or report.org_id != org_id:
            raise ResourceNotFoundException("Evidence report not found")

        try:
            stored = storage_client.stat_object(report.file_path)
        except StorageObjectMissing as exc:
            raise EvidenceGenerationError(
                f"The stored artifact for report {report.id} is missing from "
                "object storage. Regenerate the report to restore it."
            ) from exc

        if int(stored.get("size_bytes") or 0) != int(report.file_size_bytes):
            logger.warning(
                "Stored size for report %s (%s) differs from the recorded %s",
                report.id,
                stored.get("size_bytes"),
                report.file_size_bytes,
            )

        data = EvidenceReportResponse.model_validate(report).model_dump()
        data["download_url"] = storage_client.get_presigned_url(
            report.file_path, expires_seconds=3600
        )
        return EvidenceReportDownloadResponse.model_validate(data)

    async def regenerate_report(
        self, session: AsyncSession, org_id: uuid.UUID, report_id: uuid.UUID
    ) -> EvidenceReportResponse:
        """Produce a fresh artifact for the same incident.

        Explicit regeneration bypasses the idempotency short-circuit: the
        operator asked for a new document, and it gets a new verification id,
        a new object key and a new checksum even when the inputs are unchanged.
        """
        report = await self.repository.get_by_id(session, report_id)
        if not report or report.org_id != org_id:
            raise ResourceNotFoundException("Evidence report not found")
        await self._enforce_evidence_entitlement(session, org_id)
        return await self.generate_for_incident(
            session, report.incident_id, force=True
        )


evidence_service = EvidenceService()
