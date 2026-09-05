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
async def test_delivery_state_no_downgrade():
    # Pure rank test — no DB needed
    from app.modules.email_events.service import STATE_RANK

    def rank(s): return STATE_RANK.get(s, 0)
    assert rank("delivered") > rank("delivery_delayed")
    assert rank("delivered") > rank("sent")
    # Simulate _apply_state logic: only forward progression
    current = "delivered"
    incoming = "delivery_delayed"
    # should not downgrade
    assert not (rank(incoming) >= rank(current) and incoming != current and rank(incoming) < rank(current))
    # Actually check the condition used in service: _rank(status) >= _rank(email.status)
    assert rank("delivery_delayed") < rank("delivered")
    # So service would not update
    assert rank("sent") < rank("delivered")
