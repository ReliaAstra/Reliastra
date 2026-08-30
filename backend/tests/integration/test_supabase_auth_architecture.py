import uuid
from unittest.mock import AsyncMock, patch
import pytest
from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.permissions import Role, Plan
from app.modules.users.models import User
from app.modules.users.repository import UserRepository
from app.modules.organizations.repository import OrganizationRepository
from app.modules.api_keys.repository import ApiKeyRepository
from app.modules.dependencies.repository import DependencyRepository


@pytest.mark.asyncio
async def test_supabase_auth_valid_login_and_provisioning(async_client, mocker):
    """
    Test Phase 4 (Token Verification), Phase 5 (RELIASTRA User Mapping), and Phase 6 (User Provisioning).
    We mock verify_supabase_token to return a valid payload.
    The user should be mapped by supabase_user_id and auto-provisioned if missing.
    """
    supabase_sub = str(uuid.uuid4())
    mock_payload = {
        "sub": supabase_sub,
        "email": "new_supabase_user@reliastra.com",
        "email_verified": True,
        "user_metadata": {
            "full_name": "Supabase User",
        },
        "aud": "authenticated",
    }

    # Patch the verify_supabase_token helper to return our mock payload
    mocker.patch(
        "app.core.supabase.verify_supabase_token",
        new=AsyncMock(return_value=mock_payload),
    )

    # 1. Access a protected endpoint, e.g., list organizations
    headers = {"Authorization": "Bearer some-supabase-token"}
    res = await async_client.get("/v1/orgs", headers=headers)
    assert res.status_code == 200

    # 2. Check that user was successfully provisioned in DB
    orgs = res.json()
    assert len(orgs) == 1
    assert orgs[0]["name"] == "Supabase User's Organization"

    # 3. Verify user attributes
    # The active user is returned by the API
    user_me_res = await async_client.get("/v1/users/me", headers=headers)
    assert user_me_res.status_code == 200
    user_me = user_me_res.json()
    assert user_me["email"] == "new_supabase_user@reliastra.com"
    assert user_me["full_name"] == "Supabase User"


@pytest.mark.asyncio
async def test_supabase_auth_invalid_and_expired_tokens(async_client, mocker):
    """
    Test Phase 16 (Error Handling) on invalid or expired Supabase JWTs.
    """
    # Case 1: verify_supabase_token returns None (e.g. invalid/expired token)
    mocker.patch(
        "app.core.supabase.verify_supabase_token",
        new=AsyncMock(return_value=None),
    )

    headers = {"Authorization": "Bearer invalid-or-expired-token"}
    res = await async_client.get("/v1/orgs", headers=headers)
    assert res.status_code == 401
    assert "Invalid or expired token" in res.text


@pytest.mark.asyncio
async def test_tenant_isolation_bola_protection(async_client, db_session):
    """
    Test Phase 8: Tenant / Organization Isolation (BOLA/IDOR protection).
    User A has Org A and Dependency A.
    User B has Org B and Dependency B.
    Verify that User A cannot access Dependency B even if they supply Org B's ID or Dependency B's ID.
    """
    # Create User A, Org A, and Dependency A
    user_a = await UserRepository.create(
        db_session,
        email="user_a@reliastra.com",
        password_hash="",
        full_name="User A",
        is_active=True,
        # Email verification is a hard gate; fixtures that bypass signup
        # must mark the address verified or every request 403s.
        is_email_verified=True,
    )
    org_a = await OrganizationRepository.create(
        db_session, name="Org A", slug="org-a", plan=Plan.FREE.value
    )
    await OrganizationRepository.add_member(
        db_session, org_id=org_a.id, user_id=user_a.id, role=Role.ADMIN.value
    )

    dep_a = await DependencyRepository.create(
        db_session,
        org_id=org_a.id,
        application_id=None,
        name="Dep A",
        endpoint_url="https://example.com/a",
        method="GET",
        headers=None,
        expected_status_codes=[200],
        timeout_seconds=5,
        check_interval_seconds=30,
        regions=["us-east"],
    )

    # Create User B, Org B, and Dependency B
    user_b = await UserRepository.create(
        db_session,
        email="user_b@reliastra.com",
        password_hash="",
        full_name="User B",
        is_active=True,
        # Email verification is a hard gate; fixtures that bypass signup
        # must mark the address verified or every request 403s.
        is_email_verified=True,
    )
    org_b = await OrganizationRepository.create(
        db_session, name="Org B", slug="org-b", plan=Plan.FREE.value
    )
    await OrganizationRepository.add_member(
        db_session, org_id=org_b.id, user_id=user_b.id, role=Role.ADMIN.value
    )

    dep_b = await DependencyRepository.create(
        db_session,
        org_id=org_b.id,
        application_id=None,
        name="Dep B",
        endpoint_url="https://example.com/b",
        method="GET",
        headers=None,
        expected_status_codes=[200],
        timeout_seconds=5,
        check_interval_seconds=30,
        regions=["us-east"],
    )

    await db_session.commit()

    # Generate native access tokens for both users to run the API requests
    from app.modules.auth.service import auth_service
    token_a = auth_service._generate_token_pair(user_a.id).access_token
    token_b = auth_service._generate_token_pair(user_b.id).access_token

    # 1. User A accesses Dependency A under Org A context -> ALLOWED
    headers_a_good = {
        "Authorization": f"Bearer {token_a}",
        "X-Organization-ID": str(org_a.id),
    }
    res = await async_client.get(f"/v1/dependencies/{dep_a.id}", headers=headers_a_good)
    assert res.status_code == 200
    assert res.json()["name"] == "Dep A"

    # 2. User A tries to access Dependency B under Org B context -> DENIED
    # Denied because User A is not a member of Org B.
    headers_a_bad_org = {
        "Authorization": f"Bearer {token_a}",
        "X-Organization-ID": str(org_b.id),
    }
    res = await async_client.get(f"/v1/dependencies/{dep_b.id}", headers=headers_a_bad_org)
    assert res.status_code == 403

    # 3. User A tries to access Dependency B under Org A context -> DENIED / NOT FOUND
    # Denied because Dependency B does not belong to Org A.
    res = await async_client.get(f"/v1/dependencies/{dep_b.id}", headers=headers_a_good)
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_admin_authorization_server_side_enforcement(async_client, db_session):
    """
    Test Phase 11: Server-side admin enforcement via the dedicated credential.

    Admin access is a separate JWT family (aud=reliastra-admin, typed
    admin_access, ADMIN_TOKEN_SECRET). Customer/user JWTs — even rows that
    have ``is_system_admin=True`` — are rejected; only the operator credential
    path may mint the admin token.
    """
    from tests.helpers import make_admin_headers

    # Seed the dedicated admin credential FIRST so the console is *enabled* for
    # the negative assertions below. A disabled console answers 403
    # ("Admin console is disabled") instead of the 401 the test expects for
    # anonymous / non-admin callers, which is what made this test red.
    await make_admin_headers(db_session)

    # Create a normal user and an "admin" user row. The flag no longer grants
    # access — the dedicated credential does.
    normal_user = await UserRepository.create(
        db_session,
        email="normal_user@reliastra.com",
        password_hash="",
        full_name="Normal User",
        is_active=True,
        # Email verification is a hard gate; fixtures that bypass signup
        # must mark the address verified or every request 403s.
        is_email_verified=True,
    )

    admin_user = await UserRepository.create(
        db_session,
        email="system_admin@reliastra.com",
        password_hash="",
        full_name="System Admin",
        is_active=True,
        is_email_verified=True,
    )
    # Explicitly set system admin to prove the flag alone grants nothing.
    admin_user.is_system_admin = True
    db_session.add(admin_user)
    await db_session.commit()

    from app.modules.auth.service import auth_service
    token_normal = auth_service._generate_token_pair(normal_user.id).access_token
    token_admin_user = auth_service._generate_token_pair(admin_user.id).access_token

    # Anonymous -> DENIED
    res = await async_client.get("/v1/admin/operations/metrics")
    assert res.status_code == 401

    # Normal user -> DENIED (user JWT is not an admin credential)
    res = await async_client.get(
        "/v1/admin/operations/metrics",
        headers={"Authorization": f"Bearer {token_normal}"},
    )
    assert res.status_code == 401

    # is_system_admin=True user JWT -> STILL DENIED (user token family)
    res = await async_client.get(
        "/v1/admin/operations/metrics",
        headers={"Authorization": f"Bearer {token_admin_user}"},
    )
    assert res.status_code == 401

    # Dedicated admin credential -> ALLOWED
    res = await async_client.get(
        "/v1/admin/operations/metrics",
        headers=await make_admin_headers(db_session),
    )
    assert res.status_code == 200

    # User JWT must never be accepted as an admin refresh credential either.
    res = await async_client.post(
        "/v1/admin/auth/refresh",
        json={"refresh_token": token_admin_user},
    )
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_partner_authorization_self_service(async_client, db_session):
    """
    Test Phase 10: Partner Authorization.
    A standard user is NOT a partner until they opt-in and agree to terms.
    """
    user = await UserRepository.create(
        db_session,
        email="potential_partner@reliastra.com",
        password_hash="",
        full_name="Potential Partner",
        is_active=True,
        # Email verification is a hard gate; fixtures that bypass signup
        # must mark the address verified or every request 403s.
        is_email_verified=True,
    )
    await db_session.commit()

    from app.modules.auth.service import auth_service
    token = auth_service._generate_token_pair(user.id).access_token
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Access dashboard before registering -> 404 (or inactive)
    res = await async_client.get("/v1/partners/dashboard", headers=headers)
    assert res.status_code == 404

    # 2. Register as a partner (idempotent opt-in)
    apply_res = await async_client.post(
        "/v1/partners/apply",
        headers=headers,
        json={"agree_terms": True},
    )
    assert apply_res.status_code == 201

    # 3. Access dashboard after registering -> ALLOWED
    dash_res = await async_client.get("/v1/partners/dashboard", headers=headers)
    assert dash_res.status_code == 200
    assert dash_res.json()["clicks"] == 0


@pytest.mark.asyncio
async def test_api_keys_verification_and_isolation(async_client, db_session):
    """
    Test Phase 9: API Key machine authentication and isolation.
    - Valid key -> Allowed
    - Invalid key -> Denied
    - Key for Org B used to access Org A -> Denied
    - Revoked API key -> Denied
    """
    # Setup organizations & users
    user_a = await UserRepository.create(
        db_session, email="owner_a@reliastra.com", password_hash="", full_name="User A", is_active=True
    )
    org_a = await OrganizationRepository.create(
        db_session, name="Org A", slug="org-a", plan=Plan.FREE.value
    )
    await OrganizationRepository.add_member(
        db_session, org_id=org_a.id, user_id=user_a.id, role=Role.OWNER.value
    )

    org_b = await OrganizationRepository.create(
        db_session, name="Org B", slug="org-b", plan=Plan.FREE.value
    )

    from app.modules.api_keys.service import api_key_service
    from app.modules.api_keys.schemas import ApiKeyCreateRequest

    # Create API key for Org A
    key_resp = await api_key_service.create_key(
        db_session,
        org_id=org_a.id,
        request=ApiKeyCreateRequest(
            name="A-Key",
            scopes=["read:dependencies"],
        ),
    )
    raw_key = key_resp.full_key
    await db_session.commit()

    # 1. Valid API Key accessing Org A dependencies -> ALLOWED
    api_headers_good = {
        "X-API-Key": raw_key,
        "X-Organization-ID": str(org_a.id),
    }
    res = await async_client.get("/v1/dependencies", headers=api_headers_good)
    assert res.status_code == 200

    # 2. Invalid API Key -> Denied
    res = await async_client.get(
        "/v1/dependencies",
        headers={"X-API-Key": "rel_invalidkey", "X-Organization-ID": str(org_a.id)},
    )
    assert res.status_code == 401

    # 3. API Key of Org A used to access Org B -> Denied
    api_headers_bad_org = {
        "X-API-Key": raw_key,
        "X-Organization-ID": str(org_b.id),
    }
    res = await async_client.get("/v1/dependencies", headers=api_headers_bad_org)
    assert res.status_code == 403

    # 4. Revoked key -> Denied
    await api_key_service.revoke_key(db_session, org_a.id, key_resp.id)
    await db_session.commit()

    res = await async_client.get("/v1/dependencies", headers=api_headers_good)
    assert res.status_code == 401
