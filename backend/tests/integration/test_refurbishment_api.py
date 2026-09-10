import hashlib
import hmac
import uuid
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from sqlalchemy import select

from app.config import settings
from app.modules.attribution.repository import AttributionRepository
from app.modules.checks.service import check_service
from app.modules.evidence.repository import EvidenceSnapshotRepository
from app.modules.evidence.service import evidence_service
from app.modules.incidents.repository import IncidentRepository
from app.modules.incidents.service import incident_service
from app.modules.observations.models import Observation


@pytest.mark.asyncio
async def test_agency_ai_and_dashboard_endpoints(
    async_client, auth_data, db_session, mocker
):
    health = await async_client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    headers = auth_data["headers"]
    org_id = auth_data["org_id"]

    # Public vendor endpoints need the seed vendors to exist.
    from app.modules.vendors.service import vendor_service

    await vendor_service.seed_vendors(db_session)
    await db_session.commit()

    # The agency API is mounted again now that the multi-client operations
    # console exists. Creating a client also flips ``has_agency_mode`` on the
    # organization, which is what makes the surface visible in the console.
    client_response = await async_client.post(
        "/v1/clients",
        headers=headers,
        json={"name": "Customer One"},
    )
    assert client_response.status_code == 201, client_response.text
    client_id = client_response.json()["id"]

    listed = await async_client.get("/v1/clients", headers=headers)
    assert listed.status_code == 200, listed.text
    assert any(row["id"] == client_id for row in listed.json())

    app_response = await async_client.post(
        f"/v1/clients/{client_id}/applications",
        headers=headers,
        json={"name": "Production"},
    )
    assert app_response.status_code == 201, app_response.text

    # An application under a client that does not belong to this org is not
    # found, not forbidden-after-the-fact: tenancy is enforced on read.
    foreign = await async_client.post(
        "/v1/clients/00000000-0000-0000-0000-000000000000/applications",
        headers=headers,
        json={"name": "Production"},
    )
    assert foreign.status_code == 404

    portfolio = await async_client.get("/v1/agency/portfolio", headers=headers)
    assert portfolio.status_code == 200, portfolio.text
    body = portfolio.json()
    assert body["totals"]["clients"] >= 1
    assert body["share_token"]

    # The AI explainer is Reliastra-managed: tenants cannot register providers.
    removed_provider_routes = await async_client.post(
        "/v1/ai-providers",
        headers=headers,
        json={"name": "Evidence Explainer", "model_name": "example-model"},
    )
    assert removed_provider_routes.status_code == 404

    # They can only opt out of the AI explanation section.
    opt_out = await async_client.patch(
        "/v1/orgs/current",
        headers=headers,
        json={"ai_explanations_enabled": False},
    )
    assert opt_out.status_code == 200, opt_out.text
    assert opt_out.json()["ai_explanations_enabled"] is False

    opt_in = await async_client.patch(
        "/v1/orgs/current",
        headers=headers,
        json={"ai_explanations_enabled": True},
    )
    assert opt_in.status_code == 200, opt_in.text
    assert opt_in.json()["ai_explanations_enabled"] is True

    latency = await async_client.get(
        "/v1/dashboard/latency", headers=headers
    )
    degradation = await async_client.get(
        "/v1/dashboard/sla-degradation", headers=headers
    )
    assert latency.status_code == 200
    assert degradation.status_code == 200
    assert degradation.json()["period"] == "30d"

    vendor_metrics = await async_client.get(
        "/v1/vendors/stripe/metrics?window=24h"
    )
    vendor_incidents = await async_client.get(
        "/v1/vendors/stripe/incidents"
    )
    assert vendor_metrics.status_code == 200
    assert vendor_metrics.json()["metrics"]["24h"]["total_observations"] == 0
    assert vendor_incidents.status_code == 200

    restricted_key = await async_client.post(
        "/v1/api-keys",
        headers=headers,
        json={"name": "Read only", "scopes": ["read:checks"]},
    )
    assert restricted_key.status_code == 201
    forbidden = await async_client.post(
        "/v1/dependencies",
        headers={"X-API-Key": restricted_key.json()["full_key"]},
        json={"name": "Not allowed", "endpoint_url": "https://example.com"},
    )
    assert forbidden.status_code == 403


@pytest.mark.asyncio
async def test_observation_attribution_snapshot_and_verification(
    async_client, auth_data, db_session, mocker, evidence_storage
):
    headers = auth_data["headers"]
    org_id = auth_data["org_id"]
    dependency_response = await async_client.post(
        "/v1/dependencies",
        headers=headers,
        json={
            "name": "Failing Vendor",
            "endpoint_url": "https://example.com/health",
            "regions": ["us-east", "eu-west"],
        },
    )
    assert dependency_response.status_code == 201, dependency_response.text
    dependency_id = uuid.UUID(dependency_response.json()["id"])

    mocker.patch(
        "app.modules.checks.http_probe.resolve_pinned_target_async",
        new=AsyncMock(return_value=MagicMock(
            url="https://example.com/health",
            hostname="example.com",
            port=443,
            ips=["93.184.216.34"],
        )),
    )

    class _FakePinnedTransport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request):
            return httpx.Response(status_code=500, request=request)

    mocker.patch(
        "app.modules.checks.http_probe.pinned_transport_for",
        return_value=_FakePinnedTransport(),
    )

    await check_service.execute_check(db_session, dependency_id, "us-east")
    await check_service.execute_check(db_session, dependency_id, "eu-west")

    # FIX 9: observations are delivered via the transactional outbox.
    from app.modules.observations.outbox import process_outbox_batch

    processed = await process_outbox_batch(db_session)
    await db_session.commit()
    assert processed == 2

    observations = list(
        (
            await db_session.execute(
                select(Observation).where(
                    Observation.source_id == dependency_id
                )
            )
        ).scalars()
    )
    assert len(observations) == 2
    assert {item.region for item in observations} == {"us-east", "eu-west"}

    incident = await IncidentRepository.get_open_for_dependency(
        db_session, dependency_id
    )
    assert incident is not None
    # Evidence generation is dispatched on commit (after_commit), not inline
    # and not after a sleep: the worker must be able to see the resolved
    # incident, so the publish cannot happen before the row exists.
    await incident_service.resolve_incident(
        db_session, incident.id, org_id=uuid.UUID(org_id)
    )
    attribution = await AttributionRepository.get_by_incident(
        db_session, incident.id
    )
    assert attribution is not None
    assert attribution.methodology_version == "v1.0"

    mocker.patch.object(
        evidence_service,
        "_html_to_pdf",
        new=AsyncMock(return_value=b"immutable-pdf"),
    )
    # Storage is the in-memory bucket from the ``evidence_storage`` fixture.
    # It reports back the bytes it was given, which is what lets the service
    # verify the upload before it writes a report row.
    await evidence_service.generate_for_incident(db_session, incident.id)
    snapshot = await EvidenceSnapshotRepository.get_latest_for_incident(
        db_session, incident.id
    )
    assert snapshot is not None
    assert len(snapshot.data_hash) == 64
    verification_id = snapshot.verification_id
    await db_session.commit()

    verification = await async_client.get(f"/v1/verify/{verification_id}")
    assert verification.status_code == 200
    assert verification.json()["found"] is True
    assert verification.json()["data_hash"] == snapshot.data_hash


@pytest.mark.asyncio
async def test_paystack_webhook_hmac(async_client, monkeypatch):
    secret = "paystack-test-secret"
    monkeypatch.setattr(settings, "PAYSTACK_SECRET_KEY", secret)
    raw_body = b'{"event":"unhandled.test","data":{}}'
    signature = hmac.new(
        secret.encode(), raw_body, hashlib.sha512
    ).hexdigest()

    response = await async_client.post(
        "/v1/billing/webhook",
        content=raw_body,
        headers={
            "content-type": "application/json",
            "x-paystack-signature": signature,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json() == {
        "received": True,
        "event_type": "unhandled.test",
    }

    rejected = await async_client.post(
        "/v1/billing/webhook",
        content=raw_body,
        headers={
            "content-type": "application/json",
            "x-paystack-signature": "invalid",
        },
    )
    assert rejected.status_code == 401
