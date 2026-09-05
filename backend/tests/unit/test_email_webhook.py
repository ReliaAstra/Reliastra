import base64, hashlib, hmac, json, time, uuid
import pytest
from app.modules.email_events.service import resend_webhook_service
from app.config import settings

def _svix_headers(raw: bytes, secret: str, svix_id="msg_test", ts=None):
    ts = str(ts or int(time.time()))
    b64 = secret[6:] if secret.startswith("whsec_") else secret
    key = base64.b64decode(b64)
    to_sign = f"{svix_id}.{ts}.{raw.decode()}".encode()
    sig = base64.b64encode(hmac.new(key, to_sign, hashlib.sha256).digest()).decode()
    return svix_id, ts, f"v1,{sig}"

@pytest.mark.asyncio
async def test_verify_valid():
    secret = "whsec_" + base64.b64encode(b"0"*32).decode()
    settings.RESEND_WEBHOOK_SECRET = secret  # type: ignore
    raw = b'{"type":"email.sent","data":{"email_id":"re_123"}}'
    sid, ts, sig = _svix_headers(raw, secret)
    assert await resend_webhook_service.verify_signature(raw, sid, ts, sig) is True

@pytest.mark.asyncio
async def test_verify_invalid():
    secret = "whsec_" + base64.b64encode(b"0"*32).decode()
    settings.RESEND_WEBHOOK_SECRET = secret  # type: ignore
    raw = b'{"type":"email.sent"}'
    assert await resend_webhook_service.verify_signature(raw, "a", "123", "v1,invalid") is False

@pytest.mark.asyncio
async def test_delivery_state_no_downgrade(db_session):
    # create EmailRecord sent -> delivered should not downgrade to sent
    from app.modules.email_events.models import EmailRecord
    rec = EmailRecord(recipient="a@b.com", sender="noreply@reliastra.com", subject="s", category="verification", status="delivered")
    db_session.add(rec)
    await db_session.flush()
    # simulate delayed event after delivered (rank 3 < 4) should not downgrade
    from app.modules.email_events.models import ResendWebhookEvent
    evt = ResendWebhookEvent(provider="resend", event_id="evt1", event_type="email.delivery_delayed", resend_email_id=rec.resend_id, recipient="a@b.com", payload={"type":"email.delivery_delayed","data":{"email_id": rec.resend_id}})
    # if rec has no resend_id, we set one
    if not rec.resend_id:
        rec.resend_id = "re_test123"
        await db_session.flush()
        evt.resend_email_id = rec.resend_id
    await resend_webhook_service._apply_state(db_session, evt)
    await db_session.refresh(rec)
    assert rec.status == "delivered"
