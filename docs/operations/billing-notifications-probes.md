# Billing, notifications, and probe rollout

## Deployment order

1. Back up the database. Keep `SECRET_KEY`/the derived Fernet key stable.
2. Run `alembic upgrade head`. Migration 0031 encrypts existing alert configuration;
   0032 adds the public endpoint scheduling cursor. Rolling back the migration
   does not decrypt credentials. Roll back application code only to a version
   capable of reading encrypted channel configuration.
3. Deploy the API and frontend together; restart Celery workers and Beat.
4. Run exactly one Beat scheduler. Redis and Postgres are required.
5. Set `CHECK_WORKER_REGION` to each worker's **actual** geographic deployment.
   Workers consume `celery` and `checks.<region>`. Deploy a matching worker for
   every region requested by customers. A single worker is not multi-region
   monitoring. Existing explicitly configured `-Q` lists must include the
   corresponding regional queue. Do not run a worker labelled `eu-west` in the US.
6. The public endpoint scheduler probes configured public `vendor_endpoints` and
   persists `vendor_probe` observations. It does not publish customer observations
   or customer incident records. `seed_vendors_task` can backfill catalog endpoints;
   it creates configuration only, never results.
7. Monitor `/v1/checks/health`, regional broker queue depths, worker task errors,
   and the actual latest observation timestamps. A scheduler heartbeat alone
   does not prove regional coverage or successful outbound requests.

## Notifications

- Uses existing organization-scoped `/v1/notifications/configs` CRUD and `/test`.
- Configuration is encrypted with the existing Fernet architecture; responses
  expose only destination labels, state, event preferences, and test results.
- Verified organization-member email destinations are immediately eligible.
  Other addresses require an emailed code. Legacy email destinations without
  verification require verification before external delivery resumes.
- Slack uses incoming webhooks, not OAuth. Supply a real Slack webhook through
  the password field; the backend validates the Slack host and never returns it.
  The channel is `configured` until an actual test succeeds.
- Production email delivery needs the existing Resend configuration. Local SMTP
  delivery is a development test path, not proof of production deliverability.
- Supported preferences: incident detected and incident resolved. No latency
  notification toggle is advertised because no dedicated event producer exists.
- Mutation audit records contain channel IDs and event names, never credentials.

## Billing

The NGN catalog and USD list prices remain independent published prices. No FX
conversion is invented, and reference-rate availability no longer gates a fixed
price. Checkout continues to verify its server-issued price token. No payment is
initiated by visiting Billing. Card details, cancellation, invoice downloads, and
recurring-price commitments are not invented where the backend has no API. Billing
support is the explicit fallback. Direct USD/EUR collection requires provider
account capability and a separate commercial decision, not a frontend change.

## Live QA

`frontend/e2e/infrastructure-live.spec.ts` drives the real application without
request interception. Set `E2E_ACCOUNTS_FILE` to a local JSON file holding verified
QA `partner`, `customer`, and `other` accounts (email/password; org IDs; customer's
real dependency ID). Set `E2E_MAILBOX_FILE` to a local SMTP JSONL capture for code
and delivery assertions. Set `E2E_SLACK_WEBHOOK` only for a real test destination.
Never commit these files or provider credentials. Missing Slack credentials skip
that test explicitly, rather than reporting a fabricated connection.

Customer and partner logins now hold separate token families and cookies. Existing
legacy mirrored sessions may require signing in again. Partner membership is
validated server-side before rendering the dashboard; visiting marketing or
signing in no longer automatically enrolls a customer in the partner program.

### Verification record — 8 September 2026

- Production-build Chromium suite: seven scenarios passed with real auth, APIs,
  Postgres, Redis, Celery/Beat, outbound HTTPS and a local SMTP mailbox.
- Separate controlled runs passed stopped-worker stale-state rendering and
  automatic refresh of a genuinely expired, server-issued partner access token.
  The latter uses an API temporarily started with `ACCESS_TOKEN_EXPIRE_MINUTES=1`
  and `E2E_SHORT_ACCESS_TTL=1`; restore the normal TTL afterward.
- Desktop and 390px viewport checks cover billing, notifications and partner UI.
- Actual HTTP 404 and HTTP 200 recovery were observed and persisted; another
  scheduled result arrived without another manual click.
- A duplicate broker task ID produced one check result and one outbox event,
  retaining the same result ID in the outbox payload.
- Slack delivery is unverified without a real webhook. SMTP receiver delivery is
  not proof of production internet email delivery. Only the configured `us-east`
  queue was exercised; multi-region quorum-triggered delivery needs real regional
  deployments. Some public targets fail TLS/egress in this sandbox and are not
  presented as successful checks.
- Saved-card management, cancellation and downloadable receipts still require
  backend/provider capabilities; the UI uses honest support/unavailable states.
