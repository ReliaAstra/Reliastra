"""Standalone behavioral tests for the Reliastra audit fixes.

Runs without the repo's Linux-only pgserver conftest. Focuses on the
security-critical control-flow changes.
"""

import types
import uuid
from datetime import datetime, timezone

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_request(
    path: str, method: str = "GET", headers=None, client=("203.0.113.9", 12345)
):
    from starlette.requests import Request

    raw_headers = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    scope = {
        "type": "http",
        "method": method,
        "path": path,
        "headers": raw_headers,
        "query_string": b"",
        "client": client,
    }
    return Request(scope)


class DummyOrg:
    id = uuid.uuid4()


class DummyUser:
    id = uuid.uuid4()
    email = "owner@example.com"
    full_name = "Owner"
    is_active = True
    is_superuser = False
    is_system_admin = False


class StubMember:
    def __init__(self, role):
        self.role = role
        self.user_id = uuid.uuid4()


class FakeApiKey:
    def __init__(self, scopes):
        self.id = uuid.uuid4()
        self.org_id = uuid.uuid4()
        self.scopes = scopes
        self.name = "ci"


# ---------------------------------------------------------------------------
# 1. C1: API-key deny-by-default scoping
# ---------------------------------------------------------------------------


def test_infer_scope_users_me_is_none():
    from app.dependencies import _infer_scope

    assert _infer_scope(make_request("/v1/users/me")) is None
    assert _infer_scope(make_request("/v1/users/me", "PATCH")) is None


@pytest.mark.asyncio
async def test_api_key_cannot_reach_unmapped_paths(monkeypatch):
    """Even a valid '*' scoped key must be rejected on unmapped paths."""
    from app import dependencies as deps

    key = FakeApiKey(scopes=["*"])
    owner_user = DummyUser()

    class StubKeyService:
        async def authenticate_key(self, db, raw):
            return key

    class StubOrgRepo:
        async def list_members(self, db, org_id):
            return [StubMember("owner")]

    class StubUserRepo:
        @staticmethod
        async def get_by_id(db, uid):
            return owner_user

    monkeypatch.setattr(
        deps,
        "api_key_service" if hasattr(deps, "api_key_service") else "_nope",
        None,
        raising=False,
    )
    import app.modules.api_keys.service as key_svc_mod

    monkeypatch.setattr(key_svc_mod, "api_key_service", StubKeyService())

    import app.modules.organizations.repository as org_repo_mod

    monkeypatch.setattr(org_repo_mod, "OrganizationRepository", StubOrgRepo)
    import app.modules.users.repository as user_repo_mod

    monkeypatch.setattr(user_repo_mod, "UserRepository", StubUserRepo)

    # Rate limiter: force allow without redis (imported inside the function
    # from app.core.rate_limit, so patch at the source module).
    import app.core.rate_limit as rl_mod

    async def allow(*a, **k):
        return None

    monkeypatch.setattr(rl_mod, "enforce_rate_limit", allow)

    request = make_request("/v1/users/me", "GET", {"x-api-key": "rel_" + "a" * 40})
    request.state.organization_id = None

    from app.core.exceptions import ForbiddenException

    with pytest.raises(ForbiddenException):
        await deps.get_current_user(request=request, db=None, bearer=None)


# ---------------------------------------------------------------------------
# 2. H8: refresh-token reuse detection fires even when token already revoked
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refresh_reuse_revokes_family_on_revoked_token(monkeypatch):
    from app.core.exceptions import UnauthorizedException
    from app.modules.auth import service as auth_service_mod

    svc = auth_service_mod.auth_service
    family = uuid.uuid4()

    class RT:
        token_family = family
        token_sequence = 1
        is_revoked = True  # rotated away -> replay of an old token

    revoked_calls = []

    class StubAuthRepo:
        async def get_refresh_token(self, s, tok):
            return RT()

        async def get_latest_sequence(self, s, fam):
            return 1  # == sequence: old code reached family-kill only if > seq

        async def revoke_family(self, s, fam):
            revoked_calls.append(fam)

    class StubUserRepo:
        @staticmethod
        async def get_by_id(s, uid):
            return DummyUser()

    monkeypatch.setattr(svc, "auth_repository", StubAuthRepo())
    monkeypatch.setattr(svc, "user_repository", StubUserRepo())
    monkeypatch.setattr(
        auth_service_mod,
        "decode_token",
        lambda tok: {"type": "refresh", "sub": str(DummyUser().id)},
    )

    with pytest.raises(UnauthorizedException):
        await svc.refresh(None, "attacker-copied-token")

    assert revoked_calls and revoked_calls[0] == family, (
        "family revocation must fire when a revoked/rotated token is replayed"
    )


# ---------------------------------------------------------------------------
# 3. M8/H1: profile password change requires current password + kills sessions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_profile_change_requires_current_password():
    from app.core.exceptions import ValidationException
    from app.core.security import get_password_hash
    from app.modules.users.schemas import UserUpdateRequest
    from app.modules.users.service import UserService

    me = types.SimpleNamespace(
        id=uuid.uuid4(),
        email="me@example.com",
        full_name="Me",
        password_hash=get_password_hash("correct-horse"),
        is_active=True,
        is_superuser=False,
        avatar_url=None,
        auth_provider=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    class StubRepo:
        async def get_by_id(self, s, uid):
            return me

        async def get_by_email(self, s, email):
            return None

        async def update(self, s, user, **kw):
            for k, v in kw.items():
                setattr(user, k, v)
            return user

    svc = UserService(repository=StubRepo())
    req = UserUpdateRequest(password="new-password-123")
    with pytest.raises(ValidationException):
        await svc.update_profile(None, me.id, req)

    # wrong current password
    from app.core.exceptions import ForbiddenException

    req2 = UserUpdateRequest(password="new-password-123", current_password="wrong")
    with pytest.raises(ForbiddenException):
        await svc.update_profile(None, me.id, req2)


@pytest.mark.asyncio
async def test_profile_password_change_revokes_sessions(monkeypatch):
    from app.core.security import get_password_hash
    from app.modules.users import service as users_service_mod
    from app.modules.users.schemas import UserUpdateRequest

    me = types.SimpleNamespace(
        id=uuid.uuid4(),
        email="me@example.com",
        full_name="Me",
        password_hash=get_password_hash("correct-horse"),
        is_active=True,
        is_superuser=False,
        avatar_url=None,
        auth_provider=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    revoked = []

    class StubRepo:
        async def get_by_id(self, s, uid):
            return me

        async def get_by_email(self, s, email):
            return None

        async def update(self, s, user, **kw):
            for k, v in kw.items():
                setattr(user, k, v)
            return user

    import app.modules.auth.repository as auth_repo_mod

    async def fake_revoke(s, uid):
        revoked.append(uid)
        return 3

    monkeypatch.setattr(
        auth_repo_mod.AuthRepository,
        "revoke_all_for_user",
        staticmethod(fake_revoke),
    )

    svc = users_service_mod.UserService(repository=StubRepo())
    await svc.update_profile(
        None,
        me.id,
        UserUpdateRequest(password="brand-new-pw-1", current_password="correct-horse"),
    )
    assert revoked == [me.id]


# ---------------------------------------------------------------------------
# 4. H2/H3: agency not purchasable; currency configured
# ---------------------------------------------------------------------------


def test_enterprise_plan_not_self_serve():
    from app.core.permissions import Plan
    from app.modules.billing.service import PLAN_AMOUNTS

    # Enterprise routes to Contact Sales — not a self-serve checkout amount.
    assert Plan.ENTERPRISE.value not in PLAN_AMOUNTS
    assert all(v > 0 for v in PLAN_AMOUNTS.values())


def test_paystack_currency_setting_exists():
    from app.config import settings

    # The merchant account processes in Nigerian Naira. This one setting is
    # what checkout sends, what the verify gate expects and what every
    # customer-facing disclosure renders — so it must never drift.
    assert getattr(settings, "PAYSTACK_CURRENCY", "").strip().upper() == "NGN"


def test_payment_price_is_published_not_converted():
    """No FX math may exist between the USD list price and the NGN charge.

    ``resolve_payment_price`` reads an operator-published catalog. With no
    catalog entry it refuses rather than reusing the USD minor units, which
    would bill 3900 (i.e. ₦39.00) for a $39 plan.
    """
    from app.config import settings
    from app.core import payment_pricing

    monkey = payment_pricing.resolve_payment_price("pro", "monthly")
    assert monkey.product_amount == 3900  # USD list price, untouched
    assert monkey.payment_currency == "NGN"

    original = settings.PAYSTACK_NGN_PLAN_PRICES
    try:
        settings.PAYSTACK_NGN_PLAN_PRICES = None
        unpriced = payment_pricing.resolve_payment_price("pro", "monthly")
        assert unpriced.payment_amount is None
        assert unpriced.is_configured is False
        with pytest.raises(payment_pricing.PaymentPriceNotConfigured):
            payment_pricing.checkout_amount("pro", "monthly")

        settings.PAYSTACK_NGN_PLAN_PRICES = {"pro": {"monthly": 1234500}}
        priced = payment_pricing.resolve_payment_price("pro", "monthly")
        assert priced.payment_amount == 1234500
        # Still not derived: the USD price is unchanged by publishing NGN.
        assert priced.product_amount == 3900
    finally:
        settings.PAYSTACK_NGN_PLAN_PRICES = original


# ---------------------------------------------------------------------------
# 5. H5: payout state machine blocks transitions from terminal states
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_paid_payout_cannot_be_marked_failed():
    from app.core.exceptions import ValidationException
    from app.modules.partners.payouts import PartnerPayoutService

    payout = types.SimpleNamespace(
        id=uuid.uuid4(), partner_id=uuid.uuid4(), status="paid"
    )

    class StubPayoutRepo:
        async def get_by_id(self, s, pid):
            return payout

    class StubProfileRepo:
        async def get_by_id(self, s, pid):
            return None

    class StubCommissionRepo:
        pass

    svc = PartnerPayoutService.__new__(PartnerPayoutService)
    svc.payout_repo = StubPayoutRepo()
    svc.profile_repo = StubProfileRepo()
    svc.commission_repo = StubCommissionRepo()

    with pytest.raises(ValidationException):
        await svc.process_payout(None, payout.id, "mark_failed", None)


# ---------------------------------------------------------------------------
# 6. M9: TRUSTED_PROXY_HOPS=0 ignores XFF entirely
# ---------------------------------------------------------------------------


def test_xff_ignored_when_zero_hops(monkeypatch):
    from app.core import rate_limit as rl

    monkeypatch.setattr(rl, "_TRUSTED_PROXY_HOPS", 0)
    ip = rl.client_ip_from_request(
        make_request("/x", headers={"x-forwarded-for": "6.6.6.6"})
    )
    assert ip == "203.0.113.9"  # socket peer, not the spoofable header


# ---------------------------------------------------------------------------
# 7. H6: IPv4-mapped IPv6 / NAT64 normalization
# ---------------------------------------------------------------------------


def test_ssrf_blocked_networks_cover_mapped_forms():
    from app.core import ssrf_protection as ssrf

    for hostile in (
        "::ffff:169.254.169.254",
        "::ffff:10.0.0.1",
        "::ffff:127.0.0.1",
        "64:ff9b::a9fe:a9fe",  # NAT64 of 169.254.169.254
        "0.0.0.0",
        "100.64.0.1",
        "::1",
        "::",
    ):
        assert ssrf._is_blocked_ip(hostile), hostile

    for public in ("1.2.3.4", "8.8.8.8", "2606:4700::6810:85e5", "2600::"):
        assert not ssrf._is_blocked_ip(public), public


# ---------------------------------------------------------------------------
# 8. M12: bucket expr uses bound parameterization (no f-string SQL)
# ---------------------------------------------------------------------------


def test_bucket_expr_has_no_interpolated_literal():
    import inspect

    from app.modules.observations.repository import ObservationRepository

    src = inspect.getsource(ObservationRepository._bucket_expr)
    assert 'f"' not in src and "text(f" not in src
