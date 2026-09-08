# Email Center - admin operational email console

The Email Center (`/admin/email` in the Admin Dashboard, `app/modules/email_center/`
in the backend) lets authorized admins compose and send operational/business
emails through the Resend API using sender aliases on the Reliastra sending
domain. It is an internal operations tool, not customer-facing mail: it does
not use the transactional layout/footer pipeline (`email_layout.py`) because
admins compose free-form business content.

## Verification model (read this first)

Resend verifies **domains**, not individual mailboxes. The Email Center
therefore treats an alias as sendable only when **both** hold:

1. the alias's domain reports `verified` in the Resend account (`GET
   /domains`, consulted live with a 120s cache), **and**
2. the alias row is enabled in `email_center_senders`.

There is no local "verified" flag to drift: `verified` is computed per
request from live provider state, and every send re-checks immediately
before delivery (fail-closed). When Resend cannot be reached the UI shows
`unavailable` - status is never invented. Aliases are additionally
restricted to `RESEND_SENDING_DOMAIN` (default `reliastra.com`).

## API (`/v1/admin/email-center/*`, admin session required)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/status` | Resend connection + domain + verified-sender counts (`?refresh=true` bypasses cache) |
| GET | `/senders` | Sender identities with live verification (`?refresh=true` bypasses cache) |
| POST | `/senders` | Register an alias (rejected unless the domain is verified in Resend) |
| PATCH / DELETE | `/senders/{id}` | Rename / enable-disable / remove an alias |
| POST | `/send` | Validate, deliver via Resend, and audit. Returns `sent` or `failed` with a friendly message |
| POST | `/test` | Send `[Test] Reliastra Email Center Test` through the same path |
| GET | `/messages` | Paginated audit log (`?page=&page_size=&status=&search=`) |
| GET | `/messages/{id}` | Full audit record incl. bodies and failure detail |
| GET / POST | `/templates` | List (seeds built-ins on first call) / create |
| GET / PATCH / DELETE | `/templates/{id}` | Read / update / delete |
| POST | `/templates/{id}/duplicate` | Copy with a unique name |
| POST | `/templates/render` | Render `{{variables}}` for preview |

The Next.js admin proxy exposes these at `/api/admin/email-center/*`. (Note:
`/v1/admin/email/*` is the pre-existing email-health surface - the
`-center` namespace avoids colliding with it.)

## Safety properties

- The Resend API key never leaves the backend: it is read from settings per
  request, never logged, never returned. Covered by tests that scan every
  response shape for key material.
- Server-side validation everywhere: `email-validator` for addresses,
  recipient caps (25/field, 50 total), body caps (512KB text / 1MB HTML),
  attachment caps (5 files, 8MB each, 20MB total).
- HTML is sanitized with a dependency-free allowlist sanitizer
  (`sanitize.py`, mirrored client-side in `lib/email-sanitize.ts` for
  previews). Previews render in `<iframe sandbox="">`.
- Template `{{variables}}` are regex-substituted as plain text (HTML-escaped
  in HTML bodies). No template engine, no code execution.
- Sends are rate-limited per admin (30/10min; tests 10/hour), require an
  explicit confirmation click, disable the button while in flight, and carry
  an idempotency key (unique DB constraint + race-safe replay handling).
- Every attempt persists an `email_center_messages` audit row (admin,
  sender, recipients, subject, provider, status, provider message id,
  failure detail) and an `AdminAuditLog` entry. Bodies are stored so the
  activity drawer can show what was sent.
- Provider errors are normalized to admin-safe copy (`friendly_error()`);
  technical detail stays in server logs and the audit row.

## Data

Migration `0033_email_center`: `email_center_senders`,
`email_center_messages`, `email_center_templates`. System sender seeds
(finance/support/hello/partners/security/noreply/alerts/billing) and five
built-in templates (incl. "Kora — USD International Payments Request") are
inserted lazily by the service on first list - all editable/deletable from
the UI.

## Environment

| Variable | Purpose |
| -------- | ------- |
| `RESEND_API_KEY` | Existing. Without it the Center reports "not configured" and refuses to send. |
| `RESEND_SENDING_DOMAIN` | New. The only domain aliases may belong to (default `reliastra.com`). |

## Frontend note (proxy fix)

While wiring the Center, QA found the admin proxy appended the query string
twice (`[...path]/route.ts` put it into `safePath`, then `fetchBackend`
appended `incoming.search` again), which broke single-value params such as
`?refresh=true`. `fetchBackend` no longer re-appends it; multi-param
endpoints were verified unchanged (they previously survived via last-wins
parsing).
