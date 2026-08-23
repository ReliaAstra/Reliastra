import hashlib
import hmac
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import ResourceNotFoundException
from app.modules.agencies.repository import AgencyRepository
from app.modules.agencies.schemas import (
    ApplicationCreateRequest,
    ApplicationResponse,
    ClientCreateRequest,
    ClientResponse,
    PortfolioClient,
    PortfolioResponse,
    PortfolioTotals,
)
from app.modules.organizations.repository import OrganizationRepository


class AgencyService:
    def __init__(self, repository: AgencyRepository = AgencyRepository()) -> None:
        self.repository = repository

    @staticmethod
    async def _require_org(session: AsyncSession, org_id: uuid.UUID):
        org = await OrganizationRepository.get_by_id(session, org_id)
        if not org:
            raise ResourceNotFoundException("Organization not found")
        return org

    async def list_clients(
        self, session: AsyncSession, org_id: uuid.UUID
    ) -> list[ClientResponse]:
        await self._require_org(session, org_id)
        rows = await self.repository.list_clients(session, org_id)
        return [ClientResponse.model_validate(row) for row in rows]

    async def create_client(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        request: ClientCreateRequest,
    ) -> ClientResponse:
        org = await self._require_org(session, org_id)
        client = await self.repository.create_client(
            session, org_id, request.name, request.description
        )
        if not org.has_agency_mode:
            await OrganizationRepository.update(session, org, has_agency_mode=True)
        return ClientResponse.model_validate(client)

    async def list_applications(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        client_id: uuid.UUID,
    ) -> list[ApplicationResponse]:
        await self._require_client(session, org_id, client_id)
        rows = await self.repository.list_applications(session, org_id, client_id)
        return [ApplicationResponse.model_validate(row) for row in rows]

    async def create_application(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        client_id: uuid.UUID,
        request: ApplicationCreateRequest,
    ) -> ApplicationResponse:
        await self._require_client(session, org_id, client_id)
        application = await self.repository.create_application(
            session,
            org_id=org_id,
            client_id=client_id,
            name=request.name,
            description=request.description,
        )
        return ApplicationResponse.model_validate(application)

    async def _require_client(
        self,
        session: AsyncSession,
        org_id: uuid.UUID,
        client_id: uuid.UUID,
    ):
        client = await self.repository.get_client(session, client_id)
        if not client or client.org_id != org_id:
            raise ResourceNotFoundException("Client not found")
        return client

    # ── Agency portfolio (client-facing SLA portal) ──────────────────────

    @staticmethod
    def portfolio_share_token(org_id: uuid.UUID) -> str:
        """Stable, unguessable share token for an organization's portal.

        Format: ``{org_id}.{hmac_sha256(SECRET_KEY, "agency-portfolio:"+org_id)[:32]}``.
        Stateless (no DB round-trip); rotating SECRET_KEY revokes every
        portal link at once.
        """
        mac = hmac.new(
            settings.SECRET_KEY.encode("utf-8"),
            f"agency-portfolio:{org_id}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()[:32]
        return f"{org_id}.{mac}"

    @staticmethod
    def verify_portfolio_share_token(token: str) -> uuid.UUID:
        """Return the org id for a valid token; raise otherwise."""
        try:
            org_id_raw, _, signature = str(token).partition(".")
            org_id = uuid.UUID(org_id_raw)
        except ValueError as exc:
            raise ResourceNotFoundException("Report link is invalid") from exc
        expected = AgencyService.portfolio_share_token(org_id).partition(".")[2]
        if not hmac.compare_digest(signature, expected):
            raise ResourceNotFoundException("Report link is invalid")
        return org_id

    @staticmethod
    def _rollup_status(
        uptime: float, open_incidents: int, critical_incidents: int
    ) -> str:
        if critical_incidents > 0:
            return "critical"
        if open_incidents > 0 or uptime < 99.0:
            return "degraded"
        return "operational"

    async def get_portfolio(
        self, session: AsyncSession, org_id: uuid.UUID
    ) -> PortfolioResponse:
        """Roll up every client's SLA posture for the agency portal.

        Efficiency: exactly five queries regardless of client count —
        clients, applications, dependency counts per app, one BULK check-stats
        aggregation across all dependencies, and two grouped incident queries.
        """
        from app.modules.checks.repository import CheckRepository
        from app.modules.dependencies.models import Dependency

        org = await self._require_org(session, org_id)

        clients = await self.repository.list_clients(session, org_id)
        applications = await self.repository.list_applications_for_org(session, org_id)
        dep_counts = await self.repository.dependency_counts_by_application(
            session, org_id
        )
        incident_buckets = await self.repository.open_incidents_by_client(
            session, org_id
        )
        last_incidents = await self.repository.latest_incident_at_by_client(
            session, org_id
        )

        # All active dependencies of the org, mapped to their application.
        deps_result = await session.execute(
            select(Dependency.id, Dependency.application_id).where(
                Dependency.org_id == org_id,
                Dependency.is_active == True,  # noqa: E712
                Dependency.is_deleted == False,  # noqa: E712
            )
        )
        rows = [(row[0], row[1]) for row in deps_result]
        stats_map = await CheckRepository.get_aggregated_stats_bulk(
            session, [dep_id for dep_id, _ in rows], window_hours=24
        )

        # Per-application rollups (uptime/latency averaged across monitors).
        app_stats: dict[uuid.UUID, dict[str, float]] = {}
        unassigned_monitors = 0
        for dep_id, application_id in rows:
            stats = stats_map.get(dep_id, {})
            bucket = app_stats.setdefault(
                application_id or uuid.UUID(int=0), {"uptime": [], "latency": []}
            )
            bucket["uptime"].append(float(stats.get("uptime_percentage", 100.0)))
            bucket["latency"].append(float(stats.get("avg_latency_ms", 0.0)))
            if application_id is None:
                unassigned_monitors += 1

        zero = uuid.UUID(int=0)
        apps_by_client: dict[uuid.UUID | None, int] = {}
        for application in applications:
            key = application.client_id or zero
            apps_by_client[key] = apps_by_client.get(key, 0) + 1

        portfolio_clients: list[PortfolioClient] = []
        totals_open = 0
        attention = 0
        all_uptimes: list[float] = []
        total_deps = 0

        for client in clients:
            key = client.id
            app_count = apps_by_client.get(key, 0)
            dep_count = sum(
                count
                for application_id, count in dep_counts.items()
                if any(
                    a.id == application_id and a.client_id == key for a in applications
                )
            )
            uptimes: list[float] = []
            latencies: list[float] = []
            open_count = 0
            critical_count = 0
            last_at = None
            for application in applications:
                if (application.client_id or zero) != key:
                    continue
                s = app_stats.get(application.id)
                if s and s["uptime"]:
                    uptimes.extend(s["uptime"])
                    latencies.extend(s["latency"])
                sev = incident_buckets.get(application.id, {})
                open_count += sum(sev.values())
                critical_count += sev.get("critical", 0)
                candidate = last_incidents.get(application.id)
                if candidate and (last_at is None or candidate > last_at):
                    last_at = candidate

            uptime = round(sum(uptimes) / len(uptimes), 3) if uptimes else 100.0
            latency = round(sum(latencies) / len(latencies), 1) if latencies else 0.0
            status = self._rollup_status(uptime, open_count, critical_count)
            totals_open += open_count
            total_deps += dep_count
            all_uptimes.extend(uptimes)
            if status != "operational":
                attention += 1

            portfolio_clients.append(
                PortfolioClient(
                    id=client.id,
                    name=client.name,
                    description=client.description,
                    application_count=app_count,
                    dependency_count=dep_count,
                    uptime_24h=uptime,
                    avg_latency_ms=latency,
                    open_incidents=open_count,
                    critical_incidents=critical_count,
                    last_incident_at=last_at,
                    status=status,
                )
            )

        avg_uptime = (
            round(sum(all_uptimes) / len(all_uptimes), 3) if all_uptimes else 100.0
        )
        return PortfolioResponse(
            org_name=org.name,
            generated_at=datetime.now(timezone.utc),
            share_token=self.portfolio_share_token(org.id),
            clients=portfolio_clients,
            totals=PortfolioTotals(
                clients=len(portfolio_clients),
                dependencies=total_deps,
                avg_uptime_24h=avg_uptime,
                open_incidents=totals_open,
                clients_needing_attention=attention,
            ),
            unassigned_monitors=unassigned_monitors,
        )


agency_service = AgencyService()
