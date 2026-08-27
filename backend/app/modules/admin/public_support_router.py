"""Public (unauthenticated) support intake.

The marketing site's "Contact support" form posts here. Submissions become
ordinary ``feedback_tickets`` rows — the *same* table the admin support
workspace at ``/v1/admin/support/*`` reads — so a web form message lands in
the live admin queue instead of a write-only side table nobody reads.

Two properties matter:

* **Attribution.** If the submitted address belongs to a registered account we
  link ``user_id``, which is what lets an admin reply reach that person's
  in-dashboard feed. If it does not, the reply is emailed to the address.
* **Abuse control.** Anonymous writes to a human queue need a tighter budget
  than the general IP limiter, so this router uses its own sliding window.

The initial message is *not* stored as a separate ``feedback_messages`` row:
``feedback_messages.sender_id`` is non-nullable and an anonymous submitter has
no id. The admin workspace already renders ``ticket.body`` as the opening
customer bubble, so the conversation reads correctly from the ticket itself.
"""

from __future__ import annotations

import logging
import re

from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import SlidingWindowRateLimiter, enforce_rate_limit
from app.db.session import get_db
from app.modules.admin.schemas import FeedbackTicketResponse
from app.modules.admin.service import admin_feedback_service

logger = logging.getLogger(__name__)

public_support_router = APIRouter(prefix="/v1/support", tags=["Support — Public"])

#: 10 anonymous submissions per 10 minutes per IP. Tight enough to blunt
#: form spam, loose enough that a real visitor retrying is never blocked.
_public_support_limiter = SlidingWindowRateLimiter(
    limit=10, window_seconds=600, key_prefix="rl_public_support"
)

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class PublicSupportTicketRequest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    email: EmailStr
    subject: str = Field(min_length=1, max_length=500)
    message: str = Field(min_length=10, max_length=8000)


class PublicSupportTicketResponse(BaseModel):
    """Deliberately minimal — an anonymous caller must not learn internals."""

    success: bool = True
    ticket_number: str
    status: str


@public_support_router.post(
    "/tickets",
    response_model=PublicSupportTicketResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a support request from the public site",
)
async def submit_public_ticket(
    request: Request,
    body: PublicSupportTicketRequest,
    db: AsyncSession = Depends(get_db),
) -> PublicSupportTicketResponse:
    await enforce_rate_limit(request, _public_support_limiter)

    email = body.email.strip().lower()
    if not _EMAIL_RE.match(email):
        # Belt and braces: EmailStr accepts a few shapes the product does not
        # want to queue for a human (e.g. addresses with no dot in the domain).
        from app.core.exceptions import ValidationException

        raise ValidationException("Please enter a valid email address.")

    ticket: FeedbackTicketResponse = await admin_feedback_service.create_ticket(
        db,
        email=email,
        full_name=body.name.strip(),
        category="general",
        subject=body.subject.strip(),
        body=body.message.strip(),
        priority="normal",
        source="web",
    )
    logger.info(
        "Public support ticket %s accepted for %s", ticket.ticket_number, email
    )
    return PublicSupportTicketResponse(
        ticket_number=ticket.ticket_number, status=ticket.status
    )
