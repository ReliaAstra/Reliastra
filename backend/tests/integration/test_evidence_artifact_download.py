"""The owner-addressed artifact download.

`GET /v1/evidence/{report_id}` returns metadata plus a presigned URL, which is
the right answer for a browser. It is the wrong answer for a CLI or a script:
the URL points at object storage, expires, and means the machine interface hands
a caller a redirect into a third party's infrastructure to fetch a file this API
already owns.

So the artifact is served directly, and these tests hold the two properties that
make the route safe to expose: authorization is the same as the record's, and
the bytes really are the artifact the record's checksum describes.
"""

import hashlib

import pytest


@pytest.mark.asyncio
async def test_artifact_streams_the_bytes_the_record_checksums(
    async_client, auth_data, db_session, evidence_storage
):
    headers = auth_data["headers"]

    dep_res = await async_client.post(
        "/v1/dependencies",
        headers=headers,
        json={"name": "Artifact dep", "endpoint_url": "https://artifact.example.com"},
    )
    dep_id = dep_res.json()["id"]

    from app.modules.incidents.service import incident_service

    incident = await incident_service.check_and_create_incident(
        db_session,
        org_id=auth_data["org_id"],
        dependency_id=dep_id,
        error_message="500 Internal Server Error",
    )
    await db_session.commit()

    report_res = await async_client.get(
        f"/v1/incidents/{incident.id}/evidence", headers=headers
    )
    report_id = report_res.json()["id"]

    record = await async_client.get(f"/v1/evidence/{report_id}", headers=headers)
    assert record.status_code == 200
    checksum = record.json()["checksum"]

    artifact = await async_client.get(
        f"/v1/evidence/{report_id}/artifact", headers=headers
    )
    assert artifact.status_code == 200
    assert artifact.headers["content-type"] == "application/pdf"
    assert artifact.headers["content-disposition"].startswith("attachment; filename=")

    # The route's own claim: what it streams is what the record describes.
    assert hashlib.sha256(artifact.content).hexdigest() == checksum
    assert artifact.headers["etag"] == f'"{checksum}"'


@pytest.mark.asyncio
async def test_artifact_is_not_readable_by_another_account(
    async_client, auth_data, db_session, evidence_storage
):
    headers = auth_data["headers"]
    dep_res = await async_client.post(
        "/v1/dependencies",
        headers=headers,
        json={"name": "Private dep", "endpoint_url": "https://private.example.com"},
    )
    dep_id = dep_res.json()["id"]

    from app.modules.incidents.service import incident_service

    incident = await incident_service.check_and_create_incident(
        db_session,
        org_id=auth_data["org_id"],
        dependency_id=dep_id,
        error_message="500 Internal Server Error",
    )
    await db_session.commit()

    report_res = await async_client.get(
        f"/v1/incidents/{incident.id}/evidence", headers=headers
    )
    report_id = report_res.json()["id"]

    import uuid as _uuid

    from app.core.exceptions import ResourceNotFoundException
    from app.modules.evidence.service import evidence_service

    # A different org id is what the route receives from a second tenant. The
    # service is the authorization boundary, so it is exercised directly here
    # rather than by standing up a second account and its session - the same
    # call the route makes, with the same arguments.
    with pytest.raises(ResourceNotFoundException):
        await evidence_service.get_report_artifact(
            db_session, org_id=_uuid.uuid4(), report_id=_uuid.UUID(report_id)
        )


@pytest.mark.asyncio
async def test_artifact_reports_a_missing_object_rather_than_streaming_nothing(
    async_client, auth_data, db_session, evidence_storage
):
    headers = auth_data["headers"]
    dep_res = await async_client.post(
        "/v1/dependencies",
        headers=headers,
        json={"name": "Missing object dep", "endpoint_url": "https://gone.example.com"},
    )
    dep_id = dep_res.json()["id"]

    from app.modules.incidents.service import incident_service

    incident = await incident_service.check_and_create_incident(
        db_session,
        org_id=auth_data["org_id"],
        dependency_id=dep_id,
        error_message="500 Internal Server Error",
    )
    await db_session.commit()

    report_res = await async_client.get(
        f"/v1/incidents/{incident.id}/evidence", headers=headers
    )
    report_id = report_res.json()["id"]

    # Delete the stored object behind the record's back: the failure mode is a
    # record that outlives its artifact.
    evidence_storage.objects.clear()

    artifact = await async_client.get(
        f"/v1/evidence/{report_id}/artifact", headers=headers
    )
    # A record whose object is gone is an answerable failure: 409 with a code
    # the caller can branch on, and a message that names the remedy. Streaming
    # zero bytes would look like a successful download of an empty document.
    assert artifact.status_code == 409
    body = artifact.json()["error"]
    assert body["code"] == "ARTIFACT_MISSING"
    assert "Regenerate the report" in body["message"]
    assert body["details"] == [{"field": "report_id", "issue": "artifact_missing"}]
