import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.agencies.models import Application, Client


class AgencyRepository:
    @staticmethod
    async def get_client(session: AsyncSession, client_id: uuid.UUID) -> Client | None:
        result = await session.execute(select(Client).where(Client.id == client_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def list_clients(session: AsyncSession, org_id: uuid.UUID) -> list[Client]:
        result = await session.execute(
            select(Client).where(Client.org_id == org_id).order_by(Client.name.asc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def create_client(
        session: AsyncSession,
        org_id: uuid.UUID,
        name: str,
        description: str | None = None,
    ) -> Client:
        client = Client(org_id=org_id, name=name, description=description)
        session.add(client)
        await session.flush()
        return client

    @staticmethod
    async def get_application(
        session: AsyncSession, application_id: uuid.UUID
    ) -> Application | None:
        result = await session.execute(
            select(Application).where(Application.id == application_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_default_application(
        session: AsyncSession, org_id: uuid.UUID
    ) -> Application | None:
        result = await session.execute(
            select(Application)
            .where(
                Application.org_id == org_id,
                Application.client_id.is_(None),
                Application.name == "Default",
            )
            .order_by(Application.created_at.asc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_applications(
        session: AsyncSession,
        org_id: uuid.UUID,
        client_id: uuid.UUID,
    ) -> list[Application]:
        result = await session.execute(
            select(Application)
            .where(
                Application.org_id == org_id,
                Application.client_id == client_id,
            )
            .order_by(Application.name.asc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def create_application(
        session: AsyncSession,
        org_id: uuid.UUID,
        name: str,
        client_id: uuid.UUID | None = None,
        description: str | None = None,
    ) -> Application:
        application = Application(
            org_id=org_id,
            client_id=client_id,
            name=name,
            description=description,
        )
        session.add(application)
        await session.flush()
        return application

    # ── Agency portfolio (client-facing SLA portal) ──────────────────────

    @staticmethod
    async def list_applications_for_org(
        session: AsyncSession, org_id: uuid.UUID
    ) -> list[Application]:
        result = await session.execute(
            select(Application)
            .where(Application.org_id == org_id)
            .order_by(Application.name.asc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def dependency_counts_by_application(
        session: AsyncSession, org_id: uuid.UUID
    ) -> dict[uuid.UUID, int]:
        """Active dependency count per application id (single query)."""
        from app.modules.dependencies.models import Dependency

        query = (
            select(Dependency.application_id, func.count(Dependency.id))
            .where(
                Dependency.org_id == org_id,
                Dependency.is_active == True,  # noqa: E712
                Dependency.is_deleted == False,  # noqa: E712
                Dependency.application_id.is_not(None),
            )
            .group_by(Dependency.application_id)
        )
        result = await session.execute(query)
        return {row[0]: int(row[1]) for row in result}

    @staticmethod
    async def open_incidents_by_client(
        session: AsyncSession, org_id: uuid.UUID
    ) -> dict[uuid.UUID | None, dict[str, int]]:
        """Open incident counts per application id, bucketed by severity.

        Returns ``{application_id: {"critical": n, "major": n, "minor": n}}``.
        Incidents whose dependency has no application land under key None.
        """
        from app.modules.dependencies.models import Dependency
        from app.modules.incidents.models import Incident

        query = (
            select(
                Dependency.application_id,
                Incident.severity,
                func.count(Incident.id),
            )
            .join(Dependency, Incident.dependency_id == Dependency.id)
            .where(
                Incident.org_id == org_id,
                Incident.status == "open",
            )
            .group_by(Dependency.application_id, Incident.severity)
        )
        result = await session.execute(query)
        buckets: dict[uuid.UUID | None, dict[str, int]] = {}
        for application_id, severity, count in result:
            bucket = buckets.setdefault(application_id, {})
            bucket[str(severity).lower()] = int(count)
        return buckets

    @staticmethod
    async def latest_incident_at_by_client(
        session: AsyncSession, org_id: uuid.UUID
    ) -> dict[uuid.UUID | None, "datetime | None"]:
        """Most recent incident start per application id (any status)."""
        from app.modules.dependencies.models import Dependency
        from app.modules.incidents.models import Incident

        query = (
            select(
                Dependency.application_id,
                func.max(Incident.started_at),
            )
            .join(Dependency, Incident.dependency_id == Dependency.id)
            .where(Incident.org_id == org_id)
            .group_by(Dependency.application_id)
        )
        result = await session.execute(query)
        return {row[0]: row[1] for row in result}
