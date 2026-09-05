# ImprovMX Setup — reliastra.com Inbound

This configures **inbound** only. Outbound (Resend) stays authenticated via SPF/DKIM, not MX.

## 1. Create ImprovMX account
- https://improvMX.com → Sign up → Add domain `reliastra.com`

## 2. Destination mailbox
- In ImprovMX → Domain → Forwarding → set **forward to** your receiving mailbox (e.g., `secengineerx@gmail.com` or Google Workspace). This is **configurable** — ImprovMX asks for it, do not hardcode in code.

## 3. Create aliases (all forward to same destination)
- `hello@reliastra.com`
- `support@reliastra.com`
- `partners@reliastra.com`
- `security@reliastra.com`
- `privacy@reliastra.com`
- `legal@reliastra.com`
- `billing@reliastra.com`
- `abuse@reliastra.com`

ImprovMX UI: Aliases → Add → `hello` → forward to `secengineerx@gmail.com` (repeat).

## 4. DNS — MX (inbound routing)
In your DNS provider (Cloudflare/Route53/etc.):

| Type | Host | Value | Priority |
|------|------|-------|----------|
| MX | @ | mx1.improvmx.com | 10 |
| MX | @ | mx2.improvmx.com | 20 |

**Remove** any other MX (e.g., previous Google Workspace MX) if you want ImprovMX to be sole inbound. **Do not delete** Resend records below.

## 5. DNS — Keep Resend outbound records (DO NOT DELETE)
Resend gave you when you verified `reliastra.com`:

- **SPF** (TXT @): `v=spf1 include:amazonses.com include:_spf.google.com ~all` → **Merge**, don't duplicate. Final single TXT @ must be one SPF line.
  - If you already have `v=spf1 include:amazonses.com ~all` (Resend via SES) and you add Google Workspace, merge to `v=spf1 include:amazonses.com include:_spf.google.com ~all`
  - ImprovMX itself does **not** require SPF include; it forwards, not sends. So SPF stays as Resend (+ optional Google).
- **DKIM** (CNAME): `resend._domainkey.reliastra.com → resend.domainkey.u...` (value from Resend dashboard) **KEEP**
- **DKIM2** if shown: `resend2._domainkey...` **KEEP**
- **DMARC** (TXT _dmarc): `v=DMARC1; p=none; rua=mailto:dmarc@reliastra.com` — create if missing (policy `none` → `quarantine` later).

**Never** create two SPF TXT @ records — validators fail.

## 6. SPF/DKIM/DMARC coexistence
- **MX** = where inbound goes (ImprovMX)
- **SPF** = who may *send* as reliastra.com (Resend via SES)
- **DKIM** = Resend signs outbound with `resend._domainkey` — stays
- **DMARC** = alignment policy for SPF+DKIM

They coexist: MX change **does not** break Resend sending (Resend uses SPF/DKIM, not MX). You can have `MX → ImprovMX` and `SPF include:amazonses.com` simultaneously.

## 7. Test each alias
- Send from Gmail to `hello@reliastra.com` → check destination inbox
- Repeat for 8 aliases
- Check ImprovMX → Logs → shows forwarded

## 8. Verify Resend still works
- In Resend dashboard → Domains → `reliastra.com` stays `Verified`
- Send test via `POST /v1/admin/email/test` or trigger password reset → check `noreply@reliastra.com` SPF/DKIM pass in Gmail → Show original → SPF PASS, DKIM PASS, DMARC PASS

## 9. Troubleshooting
- Alias not receiving: check MX propagation `dig MX reliastra.com` → must be `mx1/2.improvmx.com`
- Resend shows `SPF fail`: you have duplicate SPF TXT — merge into one line
- Forwarded mail flagged spam: ensure DMARC `p=none` initially, then tighten
