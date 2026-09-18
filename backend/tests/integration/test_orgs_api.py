import uuid

import pytest
from sqlalchemy import text


@pytest.mark.asyncio
async def test_orgs_endpoints(async_client, auth_data, db_session):
    headers = auth_data["headers"]
    org_id = auth_data["org_id"]

    # GET /v1/orgs
    list_res = await async_client.get("/v1/orgs", headers=headers)
    assert list_res.status_code == 200
    orgs = list_res.json()
    assert len(orgs) >= 1

    # POST /v1/orgs
    create_res = await async_client.post(
        "/v1/orgs",
        headers=headers,
        json={"name": "Second Org", "slug": "second-org"},
    )
    assert create_res.status_code == 201, create_res.text
    new_org = create_res.json()
    assert new_org["name"] == "Second Org"

    # GET /v1/orgs/{org_id}
    get_res = await async_client.get("/v1/orgs/current", headers=headers)
    assert get_res.status_code == 200

    # PATCH /v1/orgs/{org_id}
    patch_res = await async_client.patch(
        "/v1/orgs/current",
        headers=headers,
        json={"name": "Renamed Org"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["name"] == "Renamed Org"

    # Invite a member
    # First create another user so email exists
    await async_client.post(
        "/v1/auth/register",
        json={
            "email": "invitee@reliastra.com",
            "password": "Password123!",
            "full_name": "Invited User",
        },
    )

    # The product is single-seat: the API must refuse to add a second member.
    invite_res = await async_client.post(
        "/v1/orgs/members",
        headers=headers,
        json={"email": "invitee@reliastra.com", "role": "member"},
    )
    assert invite_res.status_code == 409, invite_res.text
    assert "Team limit reached" in invite_res.text

    # Member-management endpoints stay exercised: seed the member row
    # directly, bypassing the seat limit the API enforces.
    import uuid as _uuid

    from app.modules.organizations.models import OrganizationMember

    invitee = (
        await db_session.execute(
            text("SELECT id FROM users WHERE email = 'invitee@reliastra.com'")
        )
    ).scalar_one()
    member = OrganizationMember(
        id=_uuid.uuid4(), org_id=uuid.UUID(org_id), user_id=invitee, role="member"
    )
    db_session.add(member)
    await db_session.commit()
    member_data = {"id": str(member.id)}

    # GET /v1/orgs/{org_id}/members
    members_res = await async_client.get(
        "/v1/orgs/members", headers=headers
    )
    assert members_res.status_code == 200
    members_payload = members_res.json()
    members = members_payload["items"]
    assert members_payload["has_more"] is False
    assert len(members) == 2

    # PATCH /v1/orgs/{org_id}/members/{member_id}
    role_res = await async_client.patch(
        f"/v1/orgs/members/{member_data['id']}",
        headers=headers,
        json={"role": "admin"},
    )
    assert role_res.status_code == 200
    assert role_res.json()["role"] == "admin"

    # DELETE /v1/orgs/{org_id}/members/{member_id}
    del_res = await async_client.delete(
        f"/v1/orgs/members/{member_data['id']}",
        headers=headers,
    )
    assert del_res.status_code == 204

    after_del = await async_client.get(
        "/v1/orgs/members", headers=headers
    )
    assert after_del.status_code == 200
    remaining_ids = {m["id"] for m in after_del.json()["items"]}
    assert member_data["id"] not in remaining_ids

    # Single-seat product: after removal the owner fills the only seat, so a
    # re-invite is refused by the team-limit guard even though a soft-deleted
    # membership could be restored.
    reinvite = await async_client.post(
        "/v1/orgs/members",
        headers=headers,
        json={"email": "invitee@reliastra.com", "role": "member"},
    )
    assert reinvite.status_code == 409, reinvite.text
    assert "Team limit reached" in reinvite.text
