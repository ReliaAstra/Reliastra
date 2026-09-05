from __future__ import annotations

import logging
from fastapi import APIRouter, Request, Header, Response, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.modules.email_events.service import resend_webhook_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])

@router.post("/resend")
async def resend_webhook(
    request: Request,
    svix_id: str | None = Header(None, alias="svix-id"),
    svix_timestamp: str | None = Header(None, alias="svix-timestamp"),
    svix_signature: str | None = Header(None, alias="svix-signature"),
    db: AsyncSession = Depends(get_db),
):
    raw = await request.body()
    # Verify BEFORE parsing
    ok = await resend_webhook_service.verify_signature(raw, svix_id, svix_timestamp, svix_signature)
    if not ok:
        logger.warning("Resend webhook invalid signature svix_id=%s", svix_id)
        return Response(status_code=401, content="invalid signature")

    try:
        payload = await request.json()
    except Exception:
        return Response(status_code=400, content="invalid json")

    # Fast ack after idempotency check + persist raw
    # Delegate heavy work to background (Celery) but ensure event is durably stored
    result = await resend_webhook_service.accept_event(db, payload, svix_id)
    if result == "duplicate":
        return {"status": "already_processed"}
    return {"status": "accepted"}
