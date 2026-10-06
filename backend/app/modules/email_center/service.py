"""Email Center service - the backend email abstraction.

:class:`EmailService` is the only code path that sends Email Center mail:

* sender eligibility (live Resend domain state + local enable flag)
* recipient/sender validation
* delivery via :mod:`resend_client` (Resend today; provider-swappable)
* audit records for every attempt (:class:`EmailCenterMessage`)
* template storage + safe ``{{variable}}`` rendering (regex substitution
  only - no template engine, no code execution)

Provider failures are normalized to ``(code, friendly message)`` pairs: the
friendly message is safe for the admin UI, the technical detail stays in
server logs and the audit record's ``failure_reason`` (which admins can
see - it never contains credentials).

The service itself is a thin facade: ``EmailService`` keeps its method
signatures, and the work lives in focused collaborators - :mod:`senders`,
:mod:`messages` and :mod:`templates`.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceNotFoundException, ValidationException
from app.modules.attribution.repository import AttributionRepository
from app.modules.checks.repository import CheckRepository
from app.modules.dependencies.repository import DependencyRepository
from app.modules.email_center.compiled import load_catalogue
from app.modules.email_center.messages import (
    STATUS_FAILED,
    STATUS_SENT,
    EmailMessages,
    _validate_attachments,
    normalize_email_list,
)
from app.modules.email_center.models import (
    EmailCenterMessage,
    EmailCenterSender,
    EmailCenterTemplate,
)
from app.modules.email_center.schemas import (
    SendEmailRequest,
)
from app.modules.email_center.senders import EmailSenders, normalize_email
from app.modules.email_center.templates import (
    EmailTemplates,
    extract_variables,
    render_variables,
)


class EmailService:
    """Backend email abstraction for the Admin Email Center."""

    def __init__(self) -> None:
        self._senders = EmailSenders()
        self._templates = EmailTemplates()
        self._messages = EmailMessages(self._senders)

    async def ensure_seed_senders(
        self,
        db: AsyncSession,
    ) -> None:
        return await self._senders.ensure_seed_senders(db)

    async def list_senders(
        self,
        db: AsyncSession,
        *,
        force_refresh: bool = False,
    ) -> tuple[list[dict], str, str, datetime | None]:
        return await self._senders.list_senders(db, force_refresh=force_refresh)

    async def check_sender_eligibility(
        self,
        db: AsyncSession,
        sender_email: str,
        *,
        force_refresh: bool = False,
    ) -> tuple[EmailCenterSender, str]:
        return await self._senders.check_sender_eligibility(
            db, sender_email, force_refresh=force_refresh
        )

    async def add_sender(
        self,
        db: AsyncSession,
        *,
        email: str,
        name: str,
    ) -> EmailCenterSender:
        return await self._senders.add_sender(db, email=email, name=name)

    async def update_sender(
        self,
        db: AsyncSession,
        sender_id: uuid.UUID,
        *,
        name: str | None,
        enabled: bool | None,
    ) -> EmailCenterSender:
        return await self._senders.update_sender(db, sender_id, name=name, enabled=enabled)

    async def delete_sender(
        self,
        db: AsyncSession,
        sender_id: uuid.UUID,
    ) -> None:
        return await self._senders.delete_sender(db, sender_id)

    async def resend_status(
        self,
        db: AsyncSession,
        *,
        force_refresh: bool = False,
    ) -> dict:
        return await self._senders.resend_status(db, force_refresh=force_refresh)

    async def send(
        self,
        db: AsyncSession,
        *,
        admin_user_id: uuid.UUID | None,
        admin_email: str | None,
        payload: SendEmailRequest,
        is_test: bool = False,
    ) -> tuple[EmailCenterMessage, str]:
        return await self._messages.send(
            db,
            admin_user_id=admin_user_id,
            admin_email=admin_email,
            payload=payload,
            is_test=is_test,
        )

    async def list_messages(
        self,
        db: AsyncSession,
        *,
        page: int = 1,
        page_size: int = 25,
        status: str | None = None,
        search: str | None = None,
    ) -> tuple[list[EmailCenterMessage], int]:
        return await self._messages.list_messages(
            db, page=page, page_size=page_size, status=status, search=search
        )

    async def get_message(
        self,
        db: AsyncSession,
        message_id: uuid.UUID,
    ) -> EmailCenterMessage:
        return await self._messages.get_message(db, message_id)

    async def ensure_seed_templates(
        self,
        db: AsyncSession,
    ) -> None:
        return await self._templates.ensure_seed_templates(db)

    async def list_templates(
        self,
        db: AsyncSession,
    ) -> list[EmailCenterTemplate]:
        return await self._templates.list_templates(db)

    async def get_template(
        self,
        db: AsyncSession,
        template_id: uuid.UUID,
    ) -> EmailCenterTemplate:
        return await self._templates.get_template(db, template_id)

    async def create_template(
        self,
        db: AsyncSession,
        *,
        name: str,
        description: str | None,
        subject: str,
        text_body: str,
        html_body: str,
        created_by_admin_id: uuid.UUID | None,
    ) -> EmailCenterTemplate:
        return await self._templates.create_template(
            db,
            name=name,
            description=description,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            created_by_admin_id=created_by_admin_id,
        )

    async def update_template(
        self,
        db: AsyncSession,
        template_id: uuid.UUID,
        *,
        name: str | None,
        description: str | None,
        subject: str | None,
        text_body: str | None,
        html_body: str | None,
    ) -> EmailCenterTemplate:
        return await self._templates.update_template(
            db,
            template_id,
            name=name,
            description=description,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
        )

    async def delete_template(
        self,
        db: AsyncSession,
        template_id: uuid.UUID,
    ) -> None:
        return await self._templates.delete_template(db, template_id)

    async def duplicate_template(
        self,
        db: AsyncSession,
        template_id: uuid.UUID,
        *,
        created_by_admin_id: uuid.UUID | None,
    ) -> EmailCenterTemplate:
        return await self._templates.duplicate_template(
            db, template_id, created_by_admin_id=created_by_admin_id
        )

    async def bind_class_variables(
        self,
        db: AsyncSession,
        *,
        class_id: str,
        incident_id: uuid.UUID | None = None,
        evidence_id: uuid.UUID | None = None,
    ) -> dict:
        """Bind live incident/evidence records onto a class's variables.

        The operator references records by id; this resolves them
        (system-admin scope, explicit ids only) and runs them through the
        provenance binding layer. Anything no record supplies is reported in
        ``missing`` rather than invented - the compose UI fills exactly those
        fields by hand.

        Classes with no record-backed fields (billing, support, partner,
        security, internal) return every required variable as missing: their
        values are operator-authored by nature.
        """
        import os
        from datetime import timezone

        from app.modules.email_center.provenance import (
            bind_evidence,
            bind_incident,
            missing_required,
        )
        from app.modules.evidence.repository import EvidenceRepository
        from app.modules.incidents.repository import IncidentRepository

        item = load_catalogue().by_id(class_id)
        if item is None:
            raise ResourceNotFoundException("Unknown message class")
        if incident_id is None and evidence_id is None:
            raise ValidationException("Provide incident_id and/or evidence_id.")

        incident = None
        if incident_id is not None:
            incident = await IncidentRepository.get_by_id(db, incident_id)
            if incident is None:
                raise ResourceNotFoundException("Incident not found")

        evidence_row = None
        if evidence_id is not None:
            evidence_row = await EvidenceRepository.get_by_id(db, evidence_id)
            if evidence_row is None:
                raise ResourceNotFoundException("Evidence report not found")
        elif incident is not None and getattr(incident, "evidence_report_id", None):
            evidence_row = await EvidenceRepository.get_by_id(
                db, incident.evidence_report_id
            )

        dependency = None
        dep_id = getattr(incident, "dependency_id", None)
        if dep_id is not None:
            dependency = await DependencyRepository.get_by_id(db, dep_id)

        attribution = None
        if incident is not None:
            attribution = await AttributionRepository.get_by_incident(
                db, incident.id
            )

        observation_count: int | None = None
        interval_seconds: int | None = None
        if dependency is not None and incident is not None and incident.started_at:
            end = incident.resolved_at or datetime.now(timezone.utc)
            try:
                observation_count = await CheckRepository.count_for_dependency_window(
                    db, dependency.id, incident.started_at, end
                )
            except Exception:
                observation_count = None
            interval_seconds = getattr(dependency, "check_interval_seconds", None)

        inc_map = (
            {
                "id": str(incident.id),
                "severity": getattr(incident, "severity", None),
                "status": getattr(incident, "status", None),
                "started_at": getattr(incident, "started_at", None),
                "resolved_at": getattr(incident, "resolved_at", None),
                "updated_at": getattr(incident, "updated_at", None),
            }
            if incident is not None
            else {}
        )
        dep_map = (
            {
                "name": getattr(dependency, "name", None),
                "endpoint": getattr(dependency, "endpoint_url", None),
                "vendor": getattr(dependency, "vendor", None)
                or getattr(dependency, "vendor_name", None),
                "interval_seconds": interval_seconds,
            }
            if dependency is not None
            else {}
        )
        att_map = (
            {
                "classification": getattr(attribution, "classification", None),
                "confidence_score": getattr(attribution, "confidence_score", None),
                "signal_breakdown": getattr(attribution, "signal_breakdown", None),
                "methodology_version": getattr(
                    attribution, "methodology_version", None
                ),
            }
            if attribution is not None
            else {}
        )
        ev_map: dict = {}
        if evidence_row is not None:
            ev_map = {
                "id": str(evidence_row.id),
                "incident_id": str(
                    getattr(evidence_row, "incident_id", "") or ""
                ),
                "file_name": os.path.basename(
                    getattr(evidence_row, "file_path", "") or ""
                ),
                "file_size_bytes": getattr(evidence_row, "file_size_bytes", None),
                "checksum": getattr(evidence_row, "checksum", None),
                "data_hash": getattr(evidence_row, "data_hash", None),
                "methodology_version": getattr(
                    evidence_row, "methodology_version", None
                ),
                "signed": getattr(evidence_row, "signed", None),
                "signature_alg": getattr(evidence_row, "signature_alg", None),
                "verification_url": getattr(
                    evidence_row, "verification_url", None
                ),
                "verification_id": getattr(
                    evidence_row, "verification_id", None
                ),
                "generated_at": getattr(evidence_row, "generated_at", None),
                "expires_at": getattr(evidence_row, "expires_at", None),
            }

        required = list(item.required_variables)
        bound_from: dict[str, str] = {}
        if incident is not None:
            bound_from["incident_id"] = str(incident.id)
        if evidence_row is not None:
            bound_from["evidence_id"] = str(evidence_row.id)

        uses_records = any(
            (spec.bound or "").split(".")[0]
            in ("incident", "attribution", "observations", "dependency", "evidence")
            for spec in item.variable_specs
        )
        if not uses_records:
            return {
                "class_id": item.id,
                "variables": {},
                "missing": list(
                    missing_required(required=required, variables={})
                ),
                "bound_from": bound_from,
            }

        if item.id == "evidence_delivery":
            binding = bind_evidence(
                evidence=ev_map,
                incident=inc_map,
                dependency=dep_map,
                required=required,
            )
        else:
            binding = bind_incident(
                incident=inc_map,
                attribution=att_map,
                dependency=dep_map,
                evidence=ev_map,
                observation_count=observation_count,
                interval_seconds=interval_seconds,
                required=required,
            )
        return {
            "class_id": item.id,
            "variables": dict(binding.variables),
            "missing": list(binding.missing),
            "bound_from": bound_from,
        }


email_service = EmailService()
# Re-exported so existing importers keep working: the router and tests
# import statuses, helpers, and the singleton from here.
__all__ = [
    "STATUS_FAILED",
    "STATUS_SENT",
    "EmailService",
    "_validate_attachments",
    "email_service",
    "extract_variables",
    "normalize_email",
    "normalize_email_list",
    "render_variables",
]
