"""Audit-only stub of the Reliastra `/v1/*` API surface.

Purpose: exercise the frontend's three sign-in flows (customer → dashboard,
partner → partner dashboard, admin → admin console) end-to-end WITHOUT the
real Supabase/Redis backend. It faithfully reproduces the backend's contract
shapes:

  * error envelope  { error: { code, message, details: [{field, issue}] } }
  * TokenResponse    { access_token, refresh_token, token_type, expires_in }
  * customer JWT family signed with SECRET_KEY (type=access / type=refresh)
  * admin JWT family signed with ADMIN_TOKEN_SECRET (aud=reliastra-admin,
    type=admin_access / admin_refresh) — same value the Next proxy verifies.

This file is intentionally self-contained (single stdlib dependency: pyjwt is
used if available, otherwise a hand-rolled HS256 JWT). It is NOT part of the
product backend.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

SECRET_KEY = "audit-customer-secret-0123456789abcdef0123456789abcdef"
ADMIN_TOKEN_SECRET = "admin-token-secret-0123456789abcdef0123456789abcdef"
ADMIN_AUDIENCE = "reliastra-admin"

ACCESS_MINUTES = 15
REFRESH_DAYS = 7
ADMIN_ACCESS_MINUTES = 15
ADMIN_REFRESH_DAYS = 1

app = FastAPI()

# ── tiny JWT (HS256) ────────────────────────────────────────────────────────


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64d(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def _jwt_encode(payload: dict, secret: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    h = _b64(json.dumps(header, separators=(",", ":")).encode())
    p = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()
    return f"{h}.{p}.{_b64(sig)}"


def _jwt_decode(token: str, secret: str) -> dict | None:
    try:
        h, p, s = token.split(".")
        expected = hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64d(s)):
            return None
        payload = json.loads(_b64d(p).decode())
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


def _now() -> int:
    return int(time.time())


def customer_pair(user_id: str) -> dict:
    now = _now()
    access = _jwt_encode(
        {"sub": user_id, "iat": now, "nbf": now, "exp": now + ACCESS_MINUTES * 60,
         "type": "access", "jti": uuid.uuid4().hex},
        SECRET_KEY,
    )
    refresh = _jwt_encode(
        {"sub": user_id, "iat": now, "nbf": now, "exp": now + REFRESH_DAYS * 86400,
         "type": "refresh", "jti": uuid.uuid4().hex},
        SECRET_KEY,
    )
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "expires_in": ACCESS_MINUTES * 60,
    }


def admin_pair(username: str) -> dict:
    now = _now()
    access = _jwt_encode(
        {"sub": f"admin:{username}", "iat": now, "nbf": now,
         "exp": now + ADMIN_ACCESS_MINUTES * 60,
         "type": "admin_access", "aud": ADMIN_AUDIENCE, "username": username,
         "jti": uuid.uuid4().hex},
        ADMIN_TOKEN_SECRET,
    )
    refresh = _jwt_encode(
        {"sub": f"admin:{username}", "iat": now, "nbf": now,
         "exp": now + ADMIN_REFRESH_DAYS * 86400,
         "type": "admin_refresh", "aud": ADMIN_AUDIENCE, "username": username,
         "jti": uuid.uuid4().hex},
        ADMIN_TOKEN_SECRET,
    )
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "expires_in": ADMIN_ACCESS_MINUTES * 60,
    }


def _err(status: int, code: str, message: str, details=None) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message,
                           "details": details or [], "request_id": "stub"}},
    )


def _bearer(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


def _require_customer(request: Request) -> str | None:
    token = _bearer(request)
    if not token:
        return None
    payload = _jwt_decode(token, SECRET_KEY)
    if payload and payload.get("type") == "access":
        return payload.get("sub")
    return None


# ── customer auth ───────────────────────────────────────────────────────────

USERS = {
    "customer@reliastra.com": {
        "id": "11111111-1111-4111-8111-111111111111", "password": "correct-horse",
        "full_name": "Customer User", "verified": True, "active": True,
    },
    "unverified@reliastra.com": {
        "id": "22222222-2222-4222-8222-222222222222", "password": "correct-horse",
        "full_name": "Unverified User", "verified": False, "active": True,
    },
    "disabled@reliastra.com": {
        "id": "33333333-3333-4333-8333-333333333333", "password": "correct-horse",
        "full_name": "Disabled User", "verified": True, "active": False,
    },
}


@app.post("/v1/auth/login")
async def login(request: Request):
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    user = USERS.get(email)
    if not user or user["password"] != password:
        return _err(401, "UNAUTHORIZED", "Invalid email or password")
    if not user["active"]:
        return _err(401, "UNAUTHORIZED", "User account is disabled")
    if not user["verified"]:
        return _err(
            403, "FORBIDDEN",
            "Verify your email address to sign in. We've sent a 6-digit code to your inbox.",
            [{"field": "code", "issue": "EMAIL_NOT_VERIFIED"},
             {"field": "email", "issue": email}],
        )
    return JSONResponse(customer_pair(user["id"]))


@app.post("/v1/auth/refresh")
async def refresh(request: Request):
    body = await request.json()
    rt = body.get("refresh_token") or ""
    payload = _jwt_decode(rt, SECRET_KEY)
    if not payload or payload.get("type") != "refresh":
        return _err(401, "UNAUTHORIZED", "Refresh token not found or invalid")
    return JSONResponse(customer_pair(payload["sub"]))


@app.post("/v1/auth/logout")
async def logout(request: Request):
    return Response(status_code=204)


@app.get("/v1/users/me")
async def me(request: Request):
    sub = _require_customer(request)
    if not sub:
        return _err(401, "UNAUTHORIZED", "Authentication required")
    for email, u in USERS.items():
        if u["id"] == sub:
            return JSONResponse({
                "id": u["id"], "email": email, "full_name": u["full_name"],
                "is_active": u["active"], "is_email_verified": u["verified"],
                "auth_provider": "email", "created_at": "2026-01-01T00:00:00Z",
            })
    # generic user (registered via signup)
    return JSONResponse({
        "id": sub, "email": "user@reliastra.com", "full_name": "User",
        "is_active": True, "is_email_verified": True, "auth_provider": "email",
    })


ORG = {
    "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "name": "Reliastra Test Org", "slug": "reliastra-test-org",
    "plan": "pro", "has_agency_mode": False,
}


@app.get("/v1/orgs")
async def orgs(request: Request):
    if not _require_customer(request):
        return _err(401, "UNAUTHORIZED", "Authentication required")
    return JSONResponse([ORG])


@app.get("/v1/orgs/current")
async def org_current(request: Request):
    if not _require_customer(request):
        return _err(401, "UNAUTHORIZED", "Authentication required")
    return JSONResponse(ORG)


PLAN = {
    "plan": "pro", "price_usd": 39, "max_dependencies": 50,
    "trial_ends_at": None, "billing_interval": "monthly",
}


@app.get("/v1/billing/plan")
async def plan(request: Request):
    if not _require_customer(request):
        return _err(401, "UNAUTHORIZED", "Authentication required")
    return JSONResponse(PLAN)


@app.get("/v1/dashboard/summary")
async def summary(request: Request):
    if not _require_customer(request):
        return _err(401, "UNAUTHORIZED", "Authentication required")
    return JSONResponse({
        "dependencies_total": 2, "dependencies_degraded": 0,
        "dependencies_down": 0, "incidents_open": 0,
        "uptime_pct_24h": 99.9, "checks_24h": 128,
    })


# ── partner surface ─────────────────────────────────────────────────────────

PARTNER_EMAILS = {"customer@reliastra.com", "partner@reliastra.com"}


@app.get("/v1/partners/me")
async def partner_me(request: Request):
    token = _bearer(request)
    payload = _jwt_decode(token or "", SECRET_KEY) if token else None
    email = None
    if payload and payload.get("type") == "access":
        for e, u in USERS.items():
            if u["id"] == payload["sub"]:
                email = e
    if email in PARTNER_EMAILS or (email is None and token is None):
        return JSONResponse({
            "partner_id": "88888888-8888-4888-8888-888888888888",
            "referral_code": "AUDIT10", "referral_link": "https://reliastra.com/r/AUDIT10",
            "commission_rate": 30, "status": "active", "created_at": "2026-01-01T00:00:00Z",
        })
    return _err(404, "RESOURCE_NOT_FOUND", "Partner profile not found")


@app.post("/v1/partners/apply")
async def partner_apply(request: Request):
    return JSONResponse({
        "partner_id": "88888888-8888-4888-8888-888888888888",
        "referral_code": "AUDIT10", "referral_link": "https://reliastra.com/r/AUDIT10",
        "commission_rate": 30, "status": "active", "created_at": "2026-01-01T00:00:00Z",
    })


@app.get("/v1/partners/dashboard")
async def partner_dashboard(request: Request):
    return JSONResponse({
        "referral_link": "https://reliastra.com/r/AUDIT10", "clicks": 42,
        "signups": 7, "active_paid_customers": 3,
        "monthly_commission_minor": 0, "pending_commission_minor": 0,
        "payable_balance_minor": 0, "in_transit_minor": 0,
        "total_earned_minor": 0, "total_paid_minor": 0,
        "minimum_payout_minor": 5000, "currency": "USD",
    })


@app.get("/v1/partners/notifications/unread-count")
async def partner_unread(request: Request):
    return JSONResponse({"unread": 0})


@app.get("/v1/partners/notifications")
async def partner_notifications(request: Request):
    return JSONResponse({"items": [], "page": 1, "page_size": 20, "total": 0, "unread": 0})


@app.get("/v1/partners/referrals")
async def partner_referrals(request: Request):
    return JSONResponse({"items": [], "page": 1, "page_size": 20, "total": 0})


@app.get("/v1/partners/commissions")
async def partner_commissions(request: Request):
    return JSONResponse({"items": [], "page": 1, "page_size": 20, "total": 0})


@app.get("/v1/partners/payouts")
async def partner_payouts(request: Request):
    return JSONResponse({"items": [], "page": 1, "page_size": 20, "total": 0})


@app.get("/v1/partners/support/tickets")
async def partner_tickets(request: Request):
    return JSONResponse({"items": [], "page": 1, "page_size": 20, "total": 0})


# ── admin surface ───────────────────────────────────────────────────────────

ADMIN_USERNAME = "operator"
ADMIN_PASSWORD = "operator-password-2026!"


@app.post("/v1/admin/auth/login")
async def admin_login(request: Request):
    body = await request.json()
    if body.get("username") != ADMIN_USERNAME or body.get("password") != ADMIN_PASSWORD:
        return _err(401, "UNAUTHORIZED", "Invalid admin credentials")
    pair = admin_pair(ADMIN_USERNAME)
    pair["admin"] = {
        "id": "99999999-9999-4999-8999-999999999999", "username": ADMIN_USERNAME,
        "email": "system-admin@reliastra.internal", "full_name": "System Administrator",
        "is_system_admin": True,
    }
    return JSONResponse(pair)


def _require_admin(request: Request) -> dict | None:
    token = _bearer(request)
    if not token:
        return None
    payload = _jwt_decode(token, ADMIN_TOKEN_SECRET)
    if payload and payload.get("type") == "admin_access" and payload.get("aud") == ADMIN_AUDIENCE:
        return payload
    return None


@app.post("/v1/admin/auth/refresh")
async def admin_refresh(request: Request):
    body = await request.json()
    rt = body.get("refresh_token") or ""
    payload = _jwt_decode(rt, ADMIN_TOKEN_SECRET)
    if not payload or payload.get("type") != "admin_refresh":
        return _err(401, "UNAUTHORIZED", "Admin session has expired")
    pair = admin_pair(payload["username"])
    pair["admin"] = {
        "id": "99999999-9999-4999-8999-999999999999", "username": payload["username"],
        "email": "system-admin@reliastra.internal", "full_name": "System Administrator",
        "is_system_admin": True,
    }
    return JSONResponse(pair)


@app.post("/v1/admin/auth/logout")
async def admin_logout(request: Request):
    return Response(status_code=204)


@app.get("/v1/admin/auth/me")
async def admin_me(request: Request):
    payload = _require_admin(request)
    if not payload:
        return _err(401, "UNAUTHORIZED", "Admin authentication required")
    return JSONResponse({
        "id": "99999999-9999-4999-8999-999999999999", "username": payload["username"],
        "email": "system-admin@reliastra.internal", "full_name": "System Administrator",
        "is_system_admin": True,
    })


@app.get("/v1/admin/overview")
async def admin_overview(request: Request):
    if not _require_admin(request):
        return _err(401, "UNAUTHORIZED", "Admin authentication required")
    return JSONResponse({
        "customers": {"total": 3, "new_30d": 1}, "revenue": {"mrr_minor": 0},
        "partners": {"active": 1}, "incidents": {"open": 0},
        "dependencies": {"total": 2}, "uptime": {"pct_24h": 99.9},
    })


@app.get("/v1/admin/operations/metrics")
async def admin_metrics(request: Request):
    if not _require_admin(request):
        return _err(401, "UNAUTHORIZED", "Admin authentication required")
    return JSONResponse({"checks_run_24h": 0, "errors_24h": 0, "queue_depth": 0})


# ── generic empty fallbacks (dashboard panels) ──────────────────────────────


@app.get("/v1/{path:path}")
async def generic_get(path: str, request: Request):
    if not _require_customer(request):
        return _err(401, "UNAUTHORIZED", "Authentication required")
    return JSONResponse({"items": [], "page": 1, "page_size": 20, "total": 0})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
