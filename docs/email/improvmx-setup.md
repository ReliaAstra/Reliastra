# ImprovMX Setup for reliastra.com (Inbound Only)

ImprovMX is **only** for inbound forwarding. **Resend stays for outbound.** Do not delete Resend's SPF/DKIM.

## 1. Create account
1. https://improvmx.com → Sign up
2. Add domain: `reliastra.com`

## 2. Destination mailbox
In ImprovMX dashboard → `reliastra.com` → Forward to: enter `IMPROVMX_FORWARD_TO` (e.g., your Gmail: `secengineerx@gmail.com`). **Make this env-configurable** — do not hardcode in docs.

## 3. Create 8 aliases (all forward to same destination)
- `hello@reliastra.com`
- `support@reliastra.com`
- `partners@reliastra.com`
- `security@reliastra.com`
- `privacy@reliastra.com`
- `legal@reliastra.com`
- `billing@reliastra.com`
- `abuse@reliastra.com`

ImprovMX → Add Alias → `hello` → destination → Save (repeat).

## 4. DNS — BEFORE changing, document existing Resend records

In your DNS provider (Cloudflare/Route53/etc.), **export current records**:

**Resend outbound auth (MUST REMAIN):**
- TXT `send` or root SPF — e.g., `v=spf1 include:amazonses.com ~all` (check Resend Dashboard → Domains → reliastra.com → DNS)
- TXT `resend._domainkey` → `p=...` (DKIM 1/2)
- TXT `resend2._domainkey` → `p=...`
- TXT `resend3._domainkey` → `p=...` (if shown)
- TXT `_dmarc` → `v=DMARC1; p=quarantine; rua=mailto:dmarc@reliastra.com` (or current)

**Screenshot/export these.** Do not delete.

## 5. MX change — inbound routing
**Replace** existing MX (if any) with ImprovMX:

```
Type  Host  Value                  Priority  TTL
MX    @     mx1.improvmx.com       10        3600
MX    @     mx2.improvmx.com       20        3600
```

- If you had MX for Google Workspace/previous mail, **remove it** (you are moving inbound to ImprovMX).
- **Do NOT** change TXT `resend._domainkey` or SPF include for Resend.

## 6. SPF — merge, not duplicate
You must have **ONE** SPF TXT at root (`@` or `reliastra.com`).

If you had `v=spf1 include:amazonses.com ~all` and ImprovMX docs suggest `include:_spf.mx.cloudflare.net`, merge:

```
v=spf1 include:amazonses.com include:_spf.mx.cloudflare.net ~all
```

- Single record, no duplicate SPF TXT.
- Validate: `dig TXT reliastra.com` → only one `v=spf1`.

## 7. DKIM
- **Do NOT** modify Resend's `resend._domainkey` TXT records.
- ImprovMX does **not** require DKIM for forwarding (it forwards, not signs as reliastra.com).

## 8. DMARC
Keep/add:
```
Type Host    Value
TXT  _dmarc  v=DMARC1; p=quarantine; rua=mailto:dmarc@reliastra.com; ruf=mailto:dmarc@reliastra.com; fo=1
```
`p=quarantine` is safe default; `p=reject` only after SPF+DKIM verified.

## 9. Verify order
1. DNS propagation: `dig MX reliastra.com` → `mx1.improvmx.com`
2. `dig TXT reliastra.com` → single SPF with both includes
3. Resend Dashboard → Domains → `reliastra.com` → still **Verified** (DKIM green)
4. ImprovMX Dashboard → `reliastra.com` → **Active** (MX found)

## 10. Test inbound (8 aliases)
For each alias, send from external Gmail to `hello@reliastra.com` etc., check destination mailbox arrives. ImprovMX logs show `Forwarded`.

## 11. Test outbound still works
1. In app, trigger `POST /v1/auth/verify-otp` or password reset → check Resend Dashboard → Logs → `delivered`
2. Verify SPF/DKIM/DMARC pass: send to `check@verifier.port25.com` or Gmail → View Original → `spf=pass`, `dkim=pass`, `dmarc=pass`

## 12. How they coexist
- **MX** = where inbound mail is delivered (now ImprovMX)
- **SPF** = which IPs may *send* as `reliastra.com` (Resend's `amazonses.com`) — MX change does not affect SPF
- **DKIM** = outbound signature (Resend's `resend._domainkey`) — MX change does not affect
- **Result:** Resend outbound stays authenticated; ImprovMX inbound is separate.

## 13. Rollback
If inbound fails, revert MX to previous values (keep SPF/DKIM). Outbound unaffected.
