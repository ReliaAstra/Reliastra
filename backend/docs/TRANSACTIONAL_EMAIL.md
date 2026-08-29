# Transactional email — layout, footer and notices

Every automated email RELIASTRA sends is rendered through one pipeline:
`app/infrastructure/email_layout.py` → `app/infrastructure/email.py`. No module
builds its own HTML shell, and no template writes a support footer.

## Why this exists

Customer-facing mail was drifting: some templates had a footer, several had
none, some had two, and a few embedded support copy *inside* security
instructions. Mail is a legal and trust surface — the unsubscribe route, the
support address and the "we will never ask for your password" line must all be
true in the same message, in every message.

## The contract

1. **One canonical support footer, always.**
   `TRANSACTIONAL_SUPPORT_FOOTER` plus `support@reliastra.com · <origin>` renders
   in the footer band of every automated email — welcome, verification, password
   reset, subscription confirmation, receipt, renewal notice, trial reminder,
   billing failure, account and security notices — in **both** the `text/plain`
   and `text/html` parts. It is never written per template; the layout adds it.

2. **Exactly once.**
   `ensure_footer_html` / `ensure_transactional_footer` are idempotent
   (`FOOTER_MARKER = "reliastra-email-footer"`). Templates that arrived with
   their own footer had it deleted rather than layered on. `ensure_footer_html`
   also injects the band into a foreign document (before `</body>`) instead of
   producing a second one.

3. **Never inside security-critical content.**
   The footer is a separated band under the message body. Instructions about
   codes, links, expiry, "we will never ask for your password", and
   suspicious-activity warnings live in `content_*` and stay above it, so the
   footer can never dilute or be mistaken for them.

4. **Tone.** Restrained, warm, factual. No emoji, no slang, no marketing
   enthusiasm, no "Hey", no "No worries"/"Hit us up". Copy review treats those
   as defects; `tests/unit/test_transactional_email_footer.py` asserts a banned
   token list across every rendered template.

5. **Currency language.** Where an email states what will be charged, it uses
   the canonical disclosure and the published payment amount from
   `app/core/payment_pricing.py` — never a figure composed in the template, and
   never a forward-looking promise the receipt cannot support. A receipt states
   the currency factually; that is the **one** deliberate difference between
   mail and web copy, recorded in `app/modules/billing/notifications.py`.

## Using it

```python
from app.infrastructure.email_layout import render_email

text, html = render_email(
    title="…",                      # H1 inside the body
    content_text="…",               # plain-text body
    content_html="<p>…</p>",        # html body, WITHOUT <html>/<body>
    preheader="…",                  # inbox preview line
    meta_rows={"Plan": "Pro", …},   # optional definition list
    info_block=("heading", "body"), # optional muted callout, e.g. a notice
    cta=("Open the dashboard", url) # optional single primary action
)
await email_client.send(to_email=…, subject=…, body=text, html=html)
```

Rules for callers:

- Escape anything interpolated from user input — `escape()` is re-exported for
  this; amounts and plans come from resolvers, not from free text.
- Do not add a footer, a support address or an unsubscribe line to `content_*`.
- Amounts in billing mail come from `payment_pricing.format_money` / the
  `PaymentSummary` fields, so mail and web cannot state different numbers.

## Tests that hold this in place

| Test | What it proves |
| --- | --- |
| `tests/unit/test_transactional_email_footer.py` | footer present exactly once per template in both tiers; security copy above it; escaping; contrast ≥ AA; tone bans; **byte-equality with the frontend's currency copy** |
| `tests/integration/test_transactional_emails.py` | the mail a real API call delivers: verification, welcome, reset, confirmation and receipt — parsed out of the MIME parts, not out of a string |
| `tests/e2e/test_billing_currency_journey.py` | a browser journey that signs up, pays through Paystack's hosted checkout and checks the delivered receipt for the footer and the charged amount |
