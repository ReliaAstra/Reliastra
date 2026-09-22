"""Router registry: every HTTP surface in one table.

Each entry records whether the router is mounted and why. Unmounted routers
are still imported (an import-time check that the preserved code is intact)
but never exposed — to restore one, flip ``mounted`` to True and restore the
frontend routes recorded in ``docs/redesign/``.

The developer-first product mounts only the surfaces below. The B2B surfaces
(agencies, partner portal, growth funnel, badges, status pages, campaign
tooling, outreach) are unmounted — stage 1 of a two-stage removal; module
code and tables are preserved deliberately and deletion is a separate,
reviewed change.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import APIRouter, FastAPI

from app.modules.admin.auth_router import admin_auth_router
from app.modules.admin.public_support_router import public_support_router
from app.modules.admin.router import admin_router, public_announcements_router
from app.modules.agencies.router import router as agencies_router
from app.modules.analytics.router import public_analytics_router
from app.modules.api_keys.router import router as api_keys_router
from app.modules.auth.router import router as auth_router
from app.modules.badges.router import router as badges_router
from app.modules.billing.router import router as billing_router
from app.modules.checks.router import router as checks_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.dependencies.router import router as dependencies_router
from app.modules.email_center.router import router as email_center_router
from app.modules.email_events.admin_router import router as email_admin_router
from app.modules.email_events.router import router as email_webhook_router
from app.modules.evidence.router import router as evidence_router
from app.modules.evidence_gate.router import router as evidence_gate_router
from app.modules.feed.router import feed_router
from app.modules.growth.router import growth_router
from app.modules.incidents.router import router as incidents_router
from app.modules.notifications.router import router as notifications_router
from app.modules.organizations.router import router as organizations_router
from app.modules.outreach.router import router as outreach_admin_router
from app.modules.partners.admin_router import admin_partners_router
from app.modules.partners.public_router import public_partners_router
from app.modules.partners.router import partners_router
from app.modules.referrals.router import referrals_router
from app.modules.status_pages.router import status_page_router, status_router
from app.modules.support.router import support_router
from app.modules.timeline_share.router import router as timeline_share_router
from app.modules.users.router import router as users_router
from app.modules.vendor_submissions.router import (
    submission_admin_router,
    submission_router,
)
from app.modules.vendors.router import router as vendors_router
from app.modules.verification.router import router as verification_router
from app.modules.webhooks.router import webhooks_router


@dataclass(frozen=True)
class RouterMount:
    """One HTTP surface and its mount decision."""

    name: str
    router: APIRouter
    mounted: bool
    reason: str


ROUTER_REGISTRY: tuple[RouterMount, ...] = (
    RouterMount("auth", auth_router, True, "identity: register/login/refresh/OAuth"),
    RouterMount("users", users_router, True, "account profile"),
    RouterMount("organizations", organizations_router, True, "workspaces + membership"),
    RouterMount("dependencies", dependencies_router, True, "monitored endpoints"),
    RouterMount("checks", checks_router, True, "probe observations + pipeline health"),
    RouterMount("incidents", incidents_router, True, "detected degradations"),
    RouterMount("evidence", evidence_router, True, "SLA evidence artifacts"),
    RouterMount("evidence_gate", evidence_gate_router, True, "evidence eligibility gate"),
    RouterMount("vendors", vendors_router, True, "vendor directory + public observatory data"),
    RouterMount("timeline_share", timeline_share_router, True, "shareable incident timelines"),
    RouterMount("notifications", notifications_router, True, "alert channels (email/Slack/…)"),
    RouterMount("dashboard", dashboard_router, True, "console overview aggregates"),
    RouterMount("billing", billing_router, True, "plans, checkout, subscriptions, invoices"),
    RouterMount("api_keys", api_keys_router, True, "programmatic access keys"),
    RouterMount("verification", verification_router, True, "public evidence verification"),
    # Referral attribution for the Technical Creator Program. Only the
    # code -> signup linkage is exposed; leaderboard gamification and
    # self-serve reward claiming are not part of the product.
    RouterMount("referrals", referrals_router, True, "creator-code -> signup linkage"),
    RouterMount("webhooks", webhooks_router, True, "outbound webhook subscriptions"),
    RouterMount("feed", feed_router, True, "activity feed"),
    RouterMount("admin_auth", admin_auth_router, True, "admin-console sessions"),
    RouterMount("admin", admin_router, True, "admin control plane"),
    RouterMount("public_announcements", public_announcements_router, True, "public announcements"),
    RouterMount("public_support", public_support_router, True, "public support intake"),
    RouterMount(
        "support",
        support_router,
        True,
        "console support email (email-only desk, no live conversation)",
    ),
    # Creator-link resolution for /r/{code}: validate code, count the click,
    # return a safe destination. The one partner-surface endpoint the
    # lightweight creator program still needs.
    RouterMount("public_partners", public_partners_router, True, "creator-link resolution"),
    RouterMount("email_webhook", email_webhook_router, True, "Resend/SMTP inbound events"),
    # ── Unmounted B2B surfaces (code preserved, see module docstring) ──
    RouterMount("agencies", agencies_router, False, "B2B: agencies/clients/portals"),
    RouterMount("partners", partners_router, False, "B2B: partner portal API"),
    RouterMount("admin_partners", admin_partners_router, False, "B2B: partner administration"),
    RouterMount("badges", badges_router, False, "B2B: vendor trust badges"),
    RouterMount("vendor_submissions", submission_router, False, "B2B: vendor lead submissions"),
    RouterMount("vendor_submission_admin", submission_admin_router, False, "B2B: submission review"),
    RouterMount("growth", growth_router, False, "B2B: PLG growth surfaces"),
    RouterMount("status", status_router, False, "B2B: org status pages"),
    RouterMount("status_page", status_page_router, False, "B2B: org status pages"),
    RouterMount("public_analytics", public_analytics_router, False, "B2B: public marketing metrics"),
    RouterMount("email_admin", email_admin_router, True, "admin: email campaign inspection (read-only)"),
    RouterMount("email_center", email_center_router, True, "admin: operational email via Resend"),
    RouterMount("outreach_admin", outreach_admin_router, False, "B2B: outreach sequences"),
)


def mount_routers(app: FastAPI) -> list[str]:
    """Include every mounted registry router. Returns the mounted names."""
    mounted: list[str] = []
    for entry in ROUTER_REGISTRY:
        if entry.mounted:
            app.include_router(entry.router)
            mounted.append(entry.name)
    return mounted


def unmounted_routers() -> list[RouterMount]:
    """Registry entries that exist but are not exposed over HTTP."""
    return [entry for entry in ROUTER_REGISTRY if not entry.mounted]
