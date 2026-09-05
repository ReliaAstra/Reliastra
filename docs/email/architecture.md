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
        RELIASTRA USERS          etc. → designated mailbox
```

## Outbound — Resend
- Central service: `app/infrastructure/email_resend.py` + `app/modules/email_events/sender.py`
- All transactional email flows through `send_transactional_email()` which writes `EmailRecord` with `resend_id`.
- Default From: `RELIASTRA <noreply@reliastra.com>` (`RESEND_FROM_EMAIL`)
- Alerts: `RELIASTRA <alerts@reliastra.com>` (`RESEND_ALERTS_FROM_EMAIL`) for `monitor_alert`, `incident`
- Reply-To per category: `support@`, `security@` for `security`, `billing@` for `billing`
- Tags: `category`, `org_id`, `template`, `correlation_id` (opaque, no PII)
- Fallback: SMTP via `EmailClient` if `RESEND_API_KEY` missing (dev) or Resend fails

## Inbound — ImprovMX
- No app SMTP server. MX → ImprovMX → forwarding to `IMPROVMX_FORWARD_TO` (configurable, not hardcoded).
- Aliases: hello, support, partners, security, privacy, legal, billing, abuse → same destination
- See `docs/email/improvmx-setup.md` for DNS

## DNS Coexistence
- **Resend**: SPF (include:amazonses.com), DKIM (3x resend.* TXT at `resend._domainkey`), DMARC (`_dmarc`)
- **ImprovMX**: MX `mx1.improvmx.com` (10) + `mx2.improvmx.com` (20)
- **SPF**: single TXT `v=spf1 include:amazonses.com include:_spf.mx.cloudflare.net ~all` (merged, not duplicate)
- **DKIM**: Resend records remain untouched
- **DMARC**: `v=DMARC1; p=quarantine; rua=mailto:dmarc@reliastra.com`

## Environment
```
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL="RELIASTRA <noreply@reliastra.com>"
RESEND_ALERTS_FROM_EMAIL="RELIASTRA <alerts@reliastra.com>"
RESEND_WEBHOOK_SECRET=whsec_...
SUPPORT_EMAIL=support@reliastra.com
SECURITY_EMAIL=security@reliastra.com
BILLING_EMAIL=billing@reliastra.com
# inbound forwarding target (ImprovMX dashboard)
IMPROVMX_FORWARD_TO=secengineerx@gmail.com
```

## Categories
- **Account**: verification, password_reset → noreply / reply-to support
- **Monitoring**: monitor_alert, incident → alerts@ / reply-to support
- **Billing**: payment, trial, subscription → noreply / reply-to billing
- **Security**: security → noreply / reply-to security

## Reliability
- Webhook `POST /webhooks/resend` → Svix verify → idempotency (`uq_resend_event_id`) → persist → Celery `process_resend_event`
- State machine: created → sent → delivered / delayed → bounced/failed/suppressed/complained (ranked, no downgrade)
- Suppression table prevents hammering invalid addresses
- Observability: `reliastra_email_events_total`, admin `/v1/admin/email/health`
