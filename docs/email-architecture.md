# RELIASTRA Email Architecture

```
                    RELIASTRA EMAIL
                           │
             ┌─────────────┴─────────────┐
             │                           │
          OUTBOUND                    INBOUND
             │                           │
           RESEND                    IMPROVMX
             │                           │
             ↓                           ↓
   noreply@reliastra.com        support@reliastra.com
   alerts@reliastra.com         partners@reliastra.com
             │                   security@reliastra.com
             ↓                   billing@reliastra.com
        RELIASTRA USERS          hello@, privacy@, legal@, abuse@
```

## Outbound — Resend
Central service: `app/infrastructure/email_resend.py` + `app/modules/email_events/sender.py`
- Default From: `RESEND_FROM_EMAIL=RELIASTRA <noreply@reliastra.com>`
- Alerts From: `RESEND_ALERTS_FROM_EMAIL=RELIASTRA <alerts@reliastra.com>`
- Reply-To per category: `account→support`, `security→security@`, `billing→billing@`, `monitoring→support`
- All transactional email flows through `send_transactional_email()` which:
  1. Adds `category` + `correlation_id` as Resend tags (opaque ids, no PII)
  2. Calls Resend `POST https://api.resend.com/emails` with `from/to/subject/html/text/reply_to/tags`
  3. Persists `EmailRecord` with `resend_id` (or SMTP fallback) and `status=sent`
  4. Falls back to SMTP `app/infrastructure/email.py` if `RESEND_API_KEY` missing or Resend 5xx

### EmailClient fallback
If `RESEND_API_KEY` not set or Resend fails, `email_resend` falls through to `email_client.send_email` via `asyncio.to_thread`. Existing SMTP still works for dev.

## Inbound — ImprovMX
ImprovMX is **not** in the app. It is DNS MX routing:
`support@reliastra.com → ImprovMX → your Gmail/Workspace`

No code, no SMTP server in FastAPI/DB.

## Environment
```
RESEND_API_KEY=re_...              # SecretStr, never logged
RESEND_FROM_EMAIL=RELIASTRA <noreply@reliastra.com>
RESEND_ALERTS_FROM_EMAIL=RELIASTRA <alerts@reliastra.com>
RESEND_WEBHOOK_SECRET=whsec_...    # Svix, for POST /webhooks/resend
SUPPORT_EMAIL=support@reliastra.com
SECURITY_EMAIL=security@reliastra.com
BILLING_EMAIL=billing@reliastra.com
PARTNERS_EMAIL=partners@reliastra.com
HELLO_EMAIL=hello@reliastra.com
```

## Categories
`verification | password_reset | welcome | security | billing | trial | monitor_alert | incident | evidence | partner | general`

## Webhook
`POST /webhooks/resend` (public, no JWT, Svix verified). See `docs/resend-webhook.md`.

## Admin
`GET /v1/admin/email/health?days=7` + `/events` + `/records` (RBAC `require_system_admin`), Prometheus `reliastra_email_events_total`
