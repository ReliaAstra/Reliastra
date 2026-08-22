# Partner payouts, notifications & support — how it works

Covers the partner payout lifecycle, the notification system (in-app, email,
browser), and the live partner ↔ admin support desk. Supersedes the
2026-08-22 audit; every gap that audit found is either fixed here or listed
under [Known limitations](#known-limitations).

---

## 1. Payout destination

**Partner** — Dashboard → Settings → Payout Info picks `crypto_usdc`,
`crypto_usdt` or `bank` and saves via `PUT /v1/partners/payout-settings`.
Stored on `partner_profiles` (`payout_method`, `wallet_address`,
`payout_network`, `bank_details` JSONB). Crypto requires a wallet address;
bank requires bank name + account number. Switching method wipes the other
method's fields so a stale destination can never be paid.

**Admin** — `/admin/partners/{id}` shows a *Payout destination* card with the
wallet/network or the bank fields, and the destination is repeated inside the
"Mark payout paid" confirmation so nobody settles blind. The **payout queue**
on `/admin/partners` (see below) also carries it, so a settlement never
requires opening a partner's page.

## 2. Payout lifecycle

Settlement is still **manual and off-platform** — there is no crypto sender or
bank API. What the code guarantees is the ledger:

| Step | What happens | Where |
|---|---|---|
| Accrual | Confirmed payment → commission `pending`, `payable_at = now + hold` (30d) | `commissions.record_payment` |
| Release | Celery flips elapsed holds to `payable` | `tasks.commission_hold_release` |
| Request | Partner clicks Request Payout → `partner_payouts` row `pending`, commissions reserved (`payout_id` set) | `POST /v1/partners/payouts/request` |
| Settle | Admin sends the money externally, then Mark paid **with a transaction reference** → payout `paid`, commissions `paid` | `POST /v1/admin/partners/payouts/{id}/process` |
| Failure | Mark failed → payout `failed`, reservation released back to the payable pool | same endpoint, `action=mark_failed` |

Requesting requires a configured destination and a balance at or above
`PARTNER_MINIMUM_PAYOUT_MINOR` (default $50).

### Payout queue

Payout requests used to be invisible — the endpoint existed but nothing
rendered it, so an admin had to open partners one by one to notice someone was
waiting. `/admin/partners` now leads with:

* an **Awaiting payout** metric (`pending_payout_count` / `pending_payout_minor`
  on `GET /v1/admin/partners/stats`);
* a **Payout queue** listing every open request with the partner, the amount,
  how long it has waited, and the destination to send to — bank numbers masked
  to the last four digits — with *Mark paid* (requires a transaction reference)
  and *Mark failed* inline. Refreshes every 30s.

### Bugs fixed

1. **Mark paid always 400'd.** The admin UI called `processPayout(id, { action })`
   without the `transaction_reference` the backend requires. The confirm dialog
   now collects it ("On-chain tx hash or bank transfer reference") and forwards
   it; a **Mark failed** control was added next to it.
2. **"Available to withdraw" was the wrong number.** The payouts page showed
   `pending_commission_minor`, which also counts money inside the hold period
   and money already reserved by an open payout. The dashboard response now
   carries `payable_balance_minor` (released **and** unreserved), plus
   `in_transit_minor` and `minimum_payout_minor`; the page shows the payable
   figure and explains the rest ("Also earned: $X still in the hold period · $Y
   reserved by a payout in progress").
3. **Failed payouts stranded the money.** `mark_failed` called the repository
   helper with `payout_id=None`, and that helper skips `None` values — so the
   reservation was never cleared and the commissions became permanently
   unpayable. The reservation is now cleared directly on the model.
4. **Every support ticket response 500'd.** `FeedbackTicketResponse` validated
   `metadata` by alias and picked up SQLAlchemy's `Base.metadata`. It now reads
   `metadata_` and serialises as `metadata`.

## 3. Notifications

One service — `app/modules/partners/notifications.py` — writes an **in-app**
notification (always) and an **email** copy (per preference). Storage reuses
the platform's `in_app_notifications` / `in_app_notification_deliveries`
tables, so there is no parallel partner-only feed.

### Events

| Event | Trigger | Recipient |
|---|---|---|
| `partner_referral_signup` | someone registers with the referral code (`bind_referral`) | partner — referred address is masked (`n***@example.com`) |
| `partner_commission_earned` | a referred customer is billed (`record_payment`) | partner |
| `partner_payout_requested` | payout created | partner |
| `partner_payout_paid` | admin marks paid | partner — includes destination (bank masked to last 4) + tx reference |
| `partner_payout_failed` | admin marks failed | partner |
| `partner_support_reply` | admin replies to a ticket (never for internal notes) | partner |
| `partner_announcement` / `partner_marketing` | admin broadcast | selected partners |

Delivery is best-effort and wrapped: an SMTP outage can never roll back a
payout being marked paid.

### Channels

* **In-app** — `GET /v1/partners/notifications` (+ `/unread-count`, `/read`,
  `DELETE /{id}`). Dashboard has a bell with an unread badge in the top bar and
  a full **Notifications** page in the sidebar. Polled every 20s.
* **Email** — SMTP via `email_client`, subject prefixed `[RELIASTRA Partners]`,
  with a deep link back to the dashboard.
* **Browser (Chrome)** — the dashboard raises `Notification(...)` for newly
  arrived unread items when the partner has both flipped the Settings switch
  (`browser_enabled`, persisted server-side) and granted the browser
  permission. Ids already popped are remembered in `localStorage`, and the
  first poll after load only primes that cache, so nothing is ever shown twice
  or replayed on refresh.

### Preferences

`GET`/`PUT /v1/partners/notification-preferences`, backed by the new
`partner_notification_preferences` table (migration `0022`, which also merges
the two 0021 heads). Settings → Notifications is now wired to it: one switch
for browser notifications and one per email category (referrals, commissions,
payouts, support replies, announcements, marketing — marketing off by default).
In-app delivery is deliberately not switchable: it is the partner's record of
what happened.

## 4. Admin → partner messaging

`POST /v1/admin/partners/notify` sends an announcement to **all active
partners** or to **selected partners**. Every recipient always gets the in-app
notification; the email copy additionally respects that partner's own
preference for the chosen category (`announcement` or `marketing`).

UI: *Message all partners* on `/admin/partners`, *Notify partner* on the
partner detail page. Both audited (`admin_audit_logs` + `audit_logs`).

## 5. Live support desk

Partner conversations are the **same** `feedback_tickets` / `feedback_messages`
rows the admin support workspace already uses — there is no second inbox to
keep in sync. Partner tickets are tagged `source="partner_dashboard"`,
`category="partner"`, numbered `PN-XXXXXXXX`.

* Partner: `POST/GET /v1/partners/support/tickets`,
  `GET /v1/partners/support/tickets/{id}`,
  `POST /v1/partners/support/tickets/{id}/messages`. The dashboard Support page
  is a chat thread that polls every **5s**.
* Admin: the existing `/admin/support` workspace, now polling every **8s**.
  Replying notifies the partner (in-app + email).
* Internal notes (`is_internal_note=true`) are staff-only — never returned to
  the partner and never notified.
* A partner reply re-opens a resolved ticket and bumps it back up the queue.
* Ownership is enforced server-side: another partner requesting the thread gets
  a 404, never the content.

## Known limitations

* **Payouts are still settled by a human.** No crypto or bank rail is
  integrated; `paid` remains an admin assertion backed by a tx reference and an
  audit trail. A real rail can slot behind the same `process_payout` state
  machine.
* **Browser notifications need an open tab.** They use the Notification API,
  not Web Push with a service worker, so no VAPID keys or push subscriptions
  are required — but nothing is delivered while the dashboard is closed. Email
  covers that case.
* **Payout destinations are stored in plain text** and are not masked in the
  admin API response; changing one does not require re-auth or a cool-down.
  This remains the highest-value hardening left.
* `PartnerTicketItem.unread_admin_messages` is always `0` — per-message read
  receipts are not tracked; the notification feed covers "you have a reply".

## Tests

`backend/tests/integration/test_partner_notifications.py` (12 tests) covers the
balance split, mark-paid reference enforcement + notification with a masked
destination, failed-payout release, referral/commission notifications, feed
privacy between partners, preference persistence, admin broadcast (all and
selected) with authz, and the full support round trip including internal-note
leakage and cross-partner access, plus the payout queue's backlog figures and
masked destination. Full backend suite: 286 passed, 3 skipped.
