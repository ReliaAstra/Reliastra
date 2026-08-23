"""Pydantic schemas for the Partner Referral API (v1)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


# ── Partner activation / profile ──────────────────────────────────────────


class PartnerApplyRequest(BaseModel):
    agree_terms: bool = False


#: Payout methods a partner may select. Mirrors the frontend ``PayoutMethod``
#: union so the two sides stay in lockstep.
PAYOUT_METHODS = ("crypto_usdc", "crypto_usdt", "bank")


class PayoutSettingsUpdateRequest(BaseModel):
    """Request body for saving a partner's payout destination."""

    payout_method: str = Field(pattern="^(crypto_usdc|crypto_usdt|bank)$")
    #: Account password, re-checked before the destination changes. Required
    #: for password-based accounts; federated (Supabase/OAuth) accounts have
    #: no local password and are exempt.
    current_password: str | None = Field(default=None, max_length=200)
    wallet_address: str | None = Field(
        default=None, max_length=200, description="Crypto wallet address"
    )
    network: str | None = Field(
        default=None, max_length=50, description="Blockchain network"
    )
    bank_details: dict | None = Field(
        default=None, description="Structured bank-account details"
    )


class PartnerProfileResponse(BaseModel):
    partner_id: uuid.UUID
    referral_code: str
    referral_link: str
    commission_rate: int
    status: str
    created_at: datetime
    payout_method: str | None = None
    #: Masked (``0x71C7…9F2a``). The full address is never returned to the
    #: browser — it is stored encrypted and only revealed to a system admin
    #: through an audited endpoint at settlement time.
    wallet_address: str | None = None
    payout_network: str | None = None
    #: Masked: account and routing numbers are reduced to ``••••1234``.
    bank_details: dict | None = None
    #: One-line masked summary, ready to display.
    payout_destination: str | None = None
    #: Last destination change — drives the payout cool-down.
    payout_details_updated_at: datetime | None = None


class PartnerDashboardResponse(BaseModel):
    referral_link: str
    clicks: int
    signups: int
    active_paid_customers: int
    monthly_commission_minor: int
    #: Everything earned but not yet paid — includes commissions still inside
    #: the hold period and commissions already reserved by an open payout.
    #: This is an *informational* figure, never the withdrawable amount.
    pending_commission_minor: int
    #: The amount that can actually be withdrawn right now: commissions whose
    #: hold has elapsed (``payable``) and which are not reserved by an
    #: existing payout. This is what the dashboard must show as
    #: "Available to withdraw".
    payable_balance_minor: int = 0
    #: Amount currently sitting in payouts that are created but not settled.
    in_transit_minor: int = 0
    total_earned_minor: int
    total_paid_minor: int
    minimum_payout_minor: int = 0
    currency: str


# ── Referrals ─────────────────────────────────────────────────────────────


class ReferralItem(BaseModel):
    referral_id: uuid.UUID
    status: str
    plan: str | None
    subscription_amount_minor: int
    commission_rate: int
    monthly_commission_minor: int
    masked_email: str | None
    organization_name: str | None
    created_at: datetime
    subscribed_at: datetime | None


class ReferralListResponse(BaseModel):
    items: list[ReferralItem]
    page: int
    page_size: int
    total: int


# ── Commissions ───────────────────────────────────────────────────────────


class CommissionItem(BaseModel):
    id: uuid.UUID
    referral_id: uuid.UUID | None
    period: str
    subscription_amount_minor: int
    commission_rate: int
    commission_amount_minor: int
    currency: str
    status: str
    created_at: datetime
    payable_at: datetime | None
    paid_at: datetime | None


class CommissionListResponse(BaseModel):
    items: list[CommissionItem]
    page: int
    page_size: int
    total: int


# ── Payouts ───────────────────────────────────────────────────────────────


class PayoutItem(BaseModel):
    id: uuid.UUID
    period: str | None
    amount_minor: int
    currency: str
    status: str
    paid_at: datetime | None
    transaction_reference: str | None


class PayoutListResponse(BaseModel):
    items: list[PayoutItem]
    page: int
    page_size: int
    total: int


# ── Public referral resolution ────────────────────────────────────────────


class ReferralResolveResponse(BaseModel):
    valid: bool
    referral_code: str | None
    destination: str
    visitor_id: str | None = None


# ── Admin ─────────────────────────────────────────────────────────────────


class PartnerAdminItem(BaseModel):
    partner_id: uuid.UUID
    user_id: uuid.UUID
    email: str
    referral_code: str
    status: str
    referred_signups: int
    active_paid_customers: int
    monthly_commission_minor: int
    total_earned_minor: int
    total_paid_minor: int
    currency: str
    created_at: datetime


class PartnerAdminListResponse(BaseModel):
    items: list[PartnerAdminItem]
    page: int
    page_size: int
    total: int


class PartnerStatusUpdateRequest(BaseModel):
    status: str = Field(pattern="^(active|suspended|banned)$")
    reason: str | None = None


class CommissionReverseRequest(BaseModel):
    reason: str


class AdminCommissionItem(BaseModel):
    commission_id: uuid.UUID
    partner_id: uuid.UUID
    partner_email: str | None
    referral_id: uuid.UUID | None
    referred_email: str | None
    period: str
    subscription_amount_minor: int
    commission_amount_minor: int
    currency: str
    status: str
    created_at: datetime
    paid_at: datetime | None


class AdminCommissionListResponse(BaseModel):
    items: list[AdminCommissionItem]
    page: int
    page_size: int
    total: int


class PayoutCreateRequest(BaseModel):
    partner_id: uuid.UUID
    amount_minor: int | None = None


class PayoutProcessRequest(BaseModel):
    action: str = Field(pattern="^(mark_paid|mark_failed)$")
    transaction_reference: str | None = None


class AdminPayoutItem(BaseModel):
    id: uuid.UUID
    partner_id: uuid.UUID
    partner_email: str | None
    period: str | None
    amount_minor: int
    currency: str
    status: str
    transaction_reference: str | None
    requested_at: datetime
    paid_at: datetime | None
    #: ``crypto_usdc`` | ``crypto_usdt`` | ``bank`` | ``None`` when the partner
    #: has not configured a destination yet.
    payout_method: str | None = None
    #: Where the money has to be sent, ready to display in the payout queue —
    #: bank account numbers are masked to the last four digits.
    payout_destination: str | None = None


class AdminPayoutListResponse(BaseModel):
    items: list[AdminPayoutItem]
    page: int
    page_size: int
    total: int


class PartnerStatsResponse(BaseModel):
    total_partners: int
    active_partners: int
    total_referred_signups: int
    total_active_paid_customers: int
    monthly_referred_revenue_minor: int
    monthly_commission_minor: int
    total_commission_paid_minor: int
    pending_commission_minor: int
    #: Payouts awaiting settlement — the admin's actual to-do list.
    pending_payout_count: int = 0
    pending_payout_minor: int = 0
    currency: str


# ── Notifications ─────────────────────────────────────────────────────────


class NotificationItem(BaseModel):
    """One entry in the partner's notification feed."""

    id: uuid.UUID
    event: str
    title: str
    body: str
    action_url: str | None = None
    action_label: str | None = None
    priority: str = "normal"
    is_read: bool = False
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationItem]
    page: int
    page_size: int
    total: int
    unread: int


class NotificationUnreadCountResponse(BaseModel):
    unread: int


class NotificationMarkReadRequest(BaseModel):
    #: Omit (or send an empty list) to mark the whole feed read.
    notification_ids: list[uuid.UUID] | None = None


class NotificationPreferencesResponse(BaseModel):
    email_referral: bool
    email_commission: bool
    email_payout: bool
    email_support: bool
    email_announcement: bool
    email_marketing: bool
    browser_enabled: bool


class NotificationPreferencesUpdateRequest(BaseModel):
    email_referral: bool | None = None
    email_commission: bool | None = None
    email_payout: bool | None = None
    email_support: bool | None = None
    email_announcement: bool | None = None
    email_marketing: bool | None = None
    browser_enabled: bool | None = None


# ── Partner support desk ──────────────────────────────────────────────────


class PartnerTicketCreateRequest(BaseModel):
    subject: str = Field(min_length=1, max_length=500)
    message: str = Field(min_length=10)
    priority: str = Field(default="normal", pattern="^(low|normal|high|urgent)$")


class PartnerTicketMessageCreateRequest(BaseModel):
    body: str = Field(min_length=1)


class PartnerTicketMessageItem(BaseModel):
    id: uuid.UUID
    #: "user" (the partner), "admin" (RELIASTRA support) or "system".
    sender_type: str
    sender_name: str
    body: str
    created_at: datetime


class PartnerTicketItem(BaseModel):
    id: uuid.UUID
    ticket_number: str
    subject: str
    status: str
    priority: str
    created_at: datetime
    updated_at: datetime
    last_message_at: datetime
    last_message_preview: str
    last_sender_type: str
    unread_admin_messages: int = 0


class PartnerTicketListResponse(BaseModel):
    items: list[PartnerTicketItem]
    page: int
    page_size: int
    total: int


class PartnerTicketDetailResponse(BaseModel):
    ticket: PartnerTicketItem
    messages: list[PartnerTicketMessageItem]


# ── Admin → partner messaging ─────────────────────────────────────────────


class AdminPayoutDestinationRevealResponse(BaseModel):
    """Full, payable destination — returned only to a system admin, audited."""

    partner_id: uuid.UUID
    partner_email: str | None = None
    payout_method: str | None = None
    payout_network: str | None = None
    wallet_address: str | None = None
    bank_details: dict | None = None
    payout_destination: str | None = None
    payout_details_updated_at: datetime | None = None
    #: True while the post-change cool-down is still running.
    in_cooldown: bool = False


class AdminPartnerNotifyRequest(BaseModel):
    """Send an announcement to one, several, or every partner."""

    #: "all" broadcasts to every partner in ``statuses``; "selected" uses
    #: ``partner_ids``.
    audience: str = Field(default="all", pattern="^(all|selected)$")
    partner_ids: list[uuid.UUID] = Field(default_factory=list)
    #: Only used when ``audience="all"``.
    statuses: list[str] = Field(default_factory=lambda: ["active"])
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=5000)
    action_url: str | None = Field(default=None, max_length=500)
    action_label: str | None = Field(default=None, max_length=100)
    #: "announcement" respects the partner's announcement preference;
    #: "marketing" respects the (default-off) marketing preference.
    category: str = Field(default="announcement", pattern="^(announcement|marketing)$")
    send_email: bool = True


class AdminPartnerNotifyResponse(BaseModel):
    recipients: int
    emailed: int
    title: str


# ── Analytics & referral detail ───────────────────────────────────────────


class AttributionBucket(BaseModel):
    bucket: str
    count: int
    pct: float


class TimeseriesPoint(BaseModel):
    date: str
    signups: int


class FunnelStage(BaseModel):
    status: str
    count: int


class CampaignBucket(BaseModel):
    campaign: str
    count: int


class PartnerAnalyticsResponse(BaseModel):
    total_referrals: int
    active_customers: int
    conversion_rate: float
    attribution: list[AttributionBucket]
    timeseries: list[TimeseriesPoint]
    funnel: list[FunnelStage]
    top_campaigns: list[CampaignBucket]
    insights: list[str]


class ReferralTimelineEvent(BaseModel):
    kind: str
    label: str
    at: datetime | None
    detail: str | None = None


class ReferralDetailResponse(BaseModel):
    referral_id: uuid.UUID
    status: str
    plan: str | None
    organization_name: str | None
    masked_email: str | None
    created_at: datetime
    subscribed_at: datetime | None
    commission_rate: int
    subscription_amount_minor: int
    monthly_commission_minor: int
    # Acquisition (marketing first-touch) – privacy-safe aggregate labels
    acquisition_channel: str | None = None
    acquisition_source: str | None = None
    acquisition_campaign: str | None = None
    acquisition_bucket: str | None = None
    # Partner attribution anchor
    partner_referral_code: str | None = None
    timeline: list[ReferralTimelineEvent]
