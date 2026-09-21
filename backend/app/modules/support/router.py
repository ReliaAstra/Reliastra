"""``POST /v1/support/requests`` - the console's support email form.

One endpoint, one job: take what the customer wrote, put it in the queue, alert
the team, and tell the writer what happens next. There is no thread to fetch
afterwards and nothing to poll - the answer arrives at the address on the
account.

The public site form (``POST /v1/support/tickets``) stays where it is; it
serves anonymous visitors and shares the same queue and the same alerting.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.modules.support.schemas import SupportRequestCreate, SupportRequestReceipt
from app.modules.support.service import support_email_service
from app.modules.users.models import User
from app.platform.persistence.session import get_db
from app.platform.web.rate_limit import SlidingWindowRateLimiter, enforce_rate_limit

support_router = APIRouter(prefix="/v1/support", tags=["Support"])

#: Ten support emails an hour per account. A person writing in twice about the
#: same incident is normal; a loop that mails the team forty times is not.
_support_request_limiter = SlidingWindowRateLimiter(
    limit=10, window_seconds=3600, key_prefix="support_request"
)


@support_router.post(
    "/requests",
    response_model=SupportRequestReceipt,
    status_code=status.HTTP_201_CREATED,
    summary="Email the support team",
    description=(
        "Send a support email from the console. The request lands in the admin "
        "support inbox, the team is alerted by email and by browser "
        "notification, and the reply arrives at the account address. There is "
        "no live conversation surface: support is answered by email."
    ),
)
async def submit_support_request(
    request: Request,
    body: SupportRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SupportRequestReceipt:
    await enforce_rate_limit(request, _support_request_limiter, str(current_user.id))
    return await support_email_service.submit_request(
        db,
        user=current_user,
        subject=body.subject,
        message=body.message,
        category=body.category,
    )
