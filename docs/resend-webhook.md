# Resend Webhook — Setup & Verification

## Endpoint
```
POST https://reliastra.com/webhooks/resend
# also:
POST https://api.reliastra.com/webhooks/resend
```
- Public, no JWT, **Svix verified** (`svix-id`, `svix-timestamp`, `svix-signature`)
- Fast ack: verify → idempotency insert → queue Celery `process_resend_event` → 200
- Retries: Resend replays on 4xx/5xx + manual replay in dashboard; idempotency (`uq_resend_event_id` provider+event_id) guarantees safe replay

## Resend Dashboard Steps
1. Resend → Webhooks → Add Endpoint → URL `https://reliastra.com/webhooks/resend`
2. Events to enable (required):
   - `email.sent`
   - `email.delivered`
   - `email.delivery_delayed`
   - `email.bounced`
   - `email.complained`
   - `email.failed`
   - `email.suppressed`
   - `email.scheduled`
3. Enable only if used:
   - `email.opened` (analytics, not critical)
   - `email.clicked` (analytics)
4. **Do NOT enable** `email.received` — inbound is ImprovMX (see `docs/email/improvmx-setup.md`)
5. **Do NOT enable** `contact.*` / `domain.*` unless you have a use case
6. Copy **Signing Secret** `whsec_...` → set on host as `RESEND_WEBHOOK_SECRET` (600, never in repo, never in logs)

## Environment
```
RESEND_WEBHOOK_SECRET=whsec_...  # Svix base64 after whsec_
```
Inject via `/opt/reliastra/.env.production` or `docker-compose.env_file`, never frontend.

## Verification (manual)
```bash
curl -X POST https://reliastra.com/webhooks/resend \
  -H "svix-id: test" -H "svix-timestamp: 123" -H "svix-signature: v1,invalid" \
  -d '{"type":"email.sent","data":{"email_id":"re_123"}}'
# → 401 invalid signature

# Valid: trigger from Resend → Webhooks → Test event → check
curl -s https://reliastra.com/v1/admin/email/health?days=1 -H "Authorization: Bearer <admin_jwt>" | jq
# delivered/bounced counts increase
```

## Security
- Svix HMAC `whsec` base64 decode → `HMAC-SHA256("svix-id.svix-timestamp.raw_body")` → compare `svix-signature` `v1` with `hmac.compare_digest`
- Timestamp drift ±300s
- Idempotency: `UNIQUE(provider, event_id)` → duplicate returns `already_processed` 200, no double state
- No secrets in logs, no payload dump by default
- Rate limit via existing `idempotency` / `rate_limit` not needed (public but verified)

## Observability
- `reliastra_email_events_total{event_type,status}` + `EmailRecord.status` state machine
- Admin `GET /v1/admin/email/health` + `/events` + `/records`
- Structured logs `event_type, resend_event_id, resend_email_id, recipient_hash, category, processing_duration_ms`
