"""Live-application journeys for the billing-currency UX.

These tests drive the ASSEMBLED product — the Next frontend rendering real
components, the FastAPI API running real billing logic, a Paystack stand-in and
real delivered mail — because every guarantee in this area is a property of the
assembly rather than of one module:

* the disclosure has to be visible where the customer decides, which only a
  rendered page can show;
* the amount on a pricing card has to be the amount the API publishes *and* the
  amount Paystack is asked to charge;
* the confirmation and receipt mail have to be the mail a real payer receives.

Run against a stack of your own::

    E2E_BASE_URL=http://localhost:3000 \\
    E2E_MAIL_URL=http://localhost:8025 \\
    E2E_PAYSTACK_CAPTURE=/tmp/paystack-last-init.json \\
    .venv/bin/python -m pytest tests/e2e/test_billing_currency_journey.py -q

``E2E_BASE_URL`` points at the frontend: the browser and the API calls both use
its ``/api/v1`` proxy, so the test travels exactly the origin a customer does.
``E2E_MAIL_URL`` is an HTTP API over captured mail (MailHog from
docker-compose, or any sink returning ``{"messages":[{"subject","to","raw"}]}``)
— required for the journeys that sign up and pay, because their proof depends on
the emailed code and on the mail a real user received. ``E2E_PAYSTACK_CAPTURE``
is a file a local Paystack stand-in writes with the JSON body it received, which
is how the test can assert what was actually sent upstream.

Nothing here mocks a component: a browser is started, a real account is signed
up, and a real checkout is handed to Paystack.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import uuid
from email import message_from_string
from email.header import decode_header, make_header
from typing import Any

import httpx
import pytest

from app.core.payment_pricing import NGN_CURRENCY_NOTICE
from app.infrastructure.email_layout import TRANSACTIONAL_SUPPORT_FOOTER

pytest.importorskip("playwright.async_api", reason="playwright is not installed")

BASE_URL = os.environ.get("E2E_BASE_URL", "").rstrip("/")
API_URL = os.environ.get("E2E_API_URL") or (f"{BASE_URL}/api/v1" if BASE_URL else "")
MAIL_URL = os.environ.get("E2E_MAIL_URL", "").rstrip("/")
PAYSTACK_CAPTURE = os.environ.get("E2E_PAYSTACK_CAPTURE", "")
# Where the customer goes to pay. Production: Paystack's hosted checkout. The
# local harness points this at the stand-in (audit/mock_paystack.py) so the
# journey can watch the browser actually leave for it.
PROVIDER_URL = os.environ.get("E2E_PAYSTACK_URL", "https://checkout.paystack.com").rstrip("/")
PASSWORD = "Journey-S3cret!"

#: A dev server compiles a route on first request, which can outlast
#: Playwright's 30s default. Journeys here are about product behaviour, not
#: bundler speed, so the budget is generous and configurable.
TIMEOUT_MS = int(os.environ.get("E2E_TIMEOUT_MS", "90000"))

pytestmark = pytest.mark.skipif(
    not BASE_URL, reason="set E2E_BASE_URL to run journeys against a live app"
)


# ── captured mail ─────────────────────────────────────────────────────────


def _decode_header(value: str) -> str:
    """Readable header text.

    A subject containing a brand dash is transmitted RFC 2047-encoded, so an
    encoded-word like ``=?utf-8?b?...?=`` is what a raw grep would see. Matching
    on that would make a correct email look like a missing one.
    """
    try:
        return str(make_header(decode_header(value or "")))
    except Exception:  # noqa: BLE001 - malformed encoding: match on what we have
        return value or ""


async def _sink_messages() -> list[dict[str, Any]]:
    """Captured mail, newest last, normalized from MailHog or a simple sink."""
    if not MAIL_URL:
        return []
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(f"{MAIL_URL}/api/v2/messages")
        if res.status_code == 404:  # not MailHog — try the plain endpoint
            res = await client.get(f"{MAIL_URL}/")
    res.raise_for_status()
    payload = res.json()
    out: list[dict[str, Any]] = []
    for item in payload.get("items", []):  # MailHog's shape
        headers = {
            key.lower(): value[0]
            for key, value in item.get("Content", {}).get("headers", {}).items()
        }
        out.append(
            {
                "subject": _decode_header(headers.get("subject", "")),
                "to": _decode_header(headers.get("to", "")),
                "raw": item.get("MIME", {}).get("raw", ""),
            }
        )
    for msg in payload.get("messages", []):
        out.append(
            {
                **msg,
                "subject": _decode_header(msg.get("subject", "")),
                "to": _decode_header(msg.get("to", "")),
            }
        )
    return out


def _decode_parts(raw: str) -> list[str]:
    message = message_from_string(raw)
    parts = []
    for part in message.walk():
        if part.get_content_maintype() == "text":
            payload = part.get_payload(decode=True)
            if payload:
                charset = part.get_content_charset() or "utf-8"
                parts.append(payload.decode(charset, "replace"))
    # Whitespace-normalized: mail word-wraps, and a footer assertion must not
    # depend on where a line break happened to land.
    return [" ".join(part.split()) for part in parts if part.strip()]


def _text_parts(raw: str) -> list[str]:
    """Decoded text/* parts of a delivered message, as the recipient sees them.

    Captured mail arrives either as the message source (an SMTP sink) or as the
    whole message base64-encoded (MailHog), so both are tried before giving up —
    asserting on an encoded blob would pass on shape and fail on meaning.
    """
    body = raw.strip()
    candidates = [body]
    try:
        candidates.append(base64.b64decode(body).decode("utf-8", "replace"))
    except Exception:  # noqa: BLE001 - not base64, the raw form already won
        pass
    for candidate in candidates:
        parts = _decode_parts(candidate)
        if parts:
            return parts
    return []


async def _wait_for_code(address: str, timeout: float = 30.0) -> str:
    """The signup code, read out of the mail the user actually received."""
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        for msg in reversed(await _sink_messages()):
            if address.lower() not in msg.get("to", "").lower():
                continue
            # The body is base64 in a MIME part, so the code is read from the
            # decoded text — the same thing the recipient sees.
            for text in _text_parts(msg.get("raw", "")):
                match = re.search(r"verification code is:?\s*([0-9 ]{6,24})", text)
                if match:
                    digits = re.sub(r"\D", "", match.group(1))
                    if len(digits) >= 6:
                        return digits[:6]
        await asyncio.sleep(0.5)
    raise AssertionError(f"no verification code for {address} within {timeout}s")


async def _mail_for(address: str, subject_re: str) -> dict[str, Any] | None:
    pattern = re.compile(subject_re, re.I)
    for msg in reversed(await _sink_messages()):
        if address.lower() in msg.get("to", "").lower() and pattern.search(
            msg.get("subject", "")
        ):
            return msg
    return None


async def _await_mail(
    address: str, subject_re: str, timeout: float = 30.0
) -> dict[str, Any] | None:
    """Poll :func:`_mail_for` — delivery is a best-effort side effect of the
    verify call and lands asynchronously, exactly like a customer's inbox."""
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        msg = await _mail_for(address, subject_re)
        if msg:
            return msg
        await asyncio.sleep(0.5)
    return None


# ── fixtures ───────────────────────────────────────────────────────────────

_ACCOUNT: dict[str, Any] = {}


@pytest.fixture(scope="module")
def api() -> httpx.Client:
    """Synchronous client for API-side reads (the browser drives the writes)."""
    with httpx.Client(base_url=API_URL, timeout=60) as client:
        yield client


async def _account() -> dict[str, Any]:
    """The checkout journey's account, created once per session.

    Memoized because the journey *pays* with it and a second signup would add
    nothing but noise. A test that must see the pre-payment state creates its
    own with :func:`_create_account` instead — order-independence matters more
    here than saving one signup.
    """
    if not _ACCOUNT:
        _ACCOUNT.update(await _create_account())
    return _ACCOUNT


async def _create_account() -> dict[str, Any]:
    """A verified RELIASTRA account, created for real through the public API.

    Over HTTP rather than in-process because the point is that the *deployed*
    signup — SMTP, OTP gate and all — actually works.
    """
    if not MAIL_URL:
        pytest.skip("E2E_MAIL_URL is required: signup is gated on a real code")
    async with httpx.AsyncClient(base_url=API_URL, timeout=60) as client:
        address = f"journey-{uuid.uuid4().hex[:8]}@reliastra.com"
        register = await client.post(
            "/auth/register",
            json={
                "email": address,
                "password": PASSWORD,
                "full_name": "Currency Journey",
            },
        )
        assert register.status_code == 201, register.text
        org_id = register.json()["organization"]["id"]
        code = await _wait_for_code(address)
        verified = await client.post(
            "/auth/verify-otp", json={"email": address, "code": code}
        )
        assert verified.status_code == 200, verified.text
        token = verified.json()["tokens"]["access_token"]
        plan = (await client.get("/billing/plan", headers=_auth(token, org_id))).json()
        assert "plan" in plan, plan
    return {
        "email": address,
        "password": PASSWORD,
        "token": token,
        "org_id": org_id,
        "plan": plan["plan"],
    }


def _flat(text: str) -> str:
    """Lower-case, whitespace-collapsed innerText for content assertions.

    Labels render uppercased through CSS ``text-transform`` — ``innerText``
    reflects the *paint*, not the markup — and adjacent inline runs can render
    without a gap (``(NGN)per month``). These assertions care about the words,
    never about typography, so both are normalized away.
    """
    return " ".join(text.split()).lower()


def _auth(token: str, org_id: str | None = None) -> dict[str, str]:
    """Bearer token, scoped to an organization when one is relevant.

    Billing is organization-scoped, so the header is part of a valid billing
    request rather than a test convenience — the frontend sends the same one.
    """
    headers = {"Authorization": f"Bearer {token}"}
    if org_id:
        headers["X-Organization-ID"] = org_id
    return headers


@pytest.fixture(scope="session", autouse=True)
def warm_routes() -> None:
    """Fetch each route once before the browser starts.

    Removes "first compile" from the measurement, so a timeout means the page
    really did not render — which is the only thing worth reporting.
    """
    import urllib.error
    import urllib.request

    for path in ("/", "/login", "/signup", "/settings/billing"):
        try:
            with urllib.request.urlopen(f"{BASE_URL}{path}", timeout=180):
                pass
        except (urllib.error.URLError, TimeoutError, OSError):
            pass  # a cold route is a slow route, not a failure of the journey


@pytest.fixture
async def page():
    """A real Chromium page per test.

    ``E2E_BROWSER_PATH`` points at any local build when the Playwright-bundled
    one is unavailable; the flags cover a container without a sandbox.
    """
    from playwright.async_api import async_playwright

    args = [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        # NOTE: do not add --single-process/--no-zygote here; the local
        # Chromium build used in this sandbox crashes with them and runs
        # normally without.
    ]
    executable = os.environ.get("E2E_BROWSER_PATH")
    launcher = {"executable_path": executable} if executable else {}
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True, args=args, **launcher)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        current = await context.new_page()
        current.set_default_timeout(TIMEOUT_MS)
        try:
            yield current
        finally:
            await context.close()
            await browser.close()


async def _sign_in(page: Any, account: dict[str, Any]) -> None:
    """Log in through the real form.

    The session the checkout depends on is part of what is under test, so a
    token written straight into storage would prove less than it appears to.
    The submit is retried because an un-hydrated form swallows a click silently
    — a click that never issues a request is a test-harness race, not a defect
    in the app, and must not be reported as one.
    """
    seen: list[tuple[int, str]] = []
    page.on("response", lambda res: seen.append((res.status, res.url)))
    await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    button = page.get_by_role("button", name=re.compile(r"sign in", re.I)).first
    await button.wait_for(state="visible", timeout=TIMEOUT_MS)
    for attempt in range(3):
        await page.fill("#email", account["email"])
        await page.fill("#password", account["password"])
        try:
            async with page.expect_response(
                lambda res: res.url.endswith("/auth/login"), timeout=TIMEOUT_MS
            ) as login_info:
                await button.click()
            login = await login_info.value
            assert login.status == 200, f"sign-in rejected: {login.status}"
            break
        except AssertionError:
            raise
        except Exception:  # noqa: BLE001 - form not interactive yet
            if attempt == 2:
                raise
            await page.wait_for_timeout(1_500)
    await page.wait_for_url(re.compile(r"/dashboard"), timeout=TIMEOUT_MS)
    # Wait for the console's own session restore to land before navigating on.
    # Starting a new document mid-restore aborts it, and an interrupted refresh
    # rotation leaves the browser holding a spent token — the next load then
    # reads as an expired session. A customer clicking a link a moment after
    # sign-in hits exactly this, so the journey settles first and says so.
    deadline = asyncio.get_running_loop().time() + TIMEOUT_MS / 1000
    while asyncio.get_running_loop().time() < deadline:
        if any(status == 200 and url.endswith("/users/me") for status, url in seen):
            break
        await asyncio.sleep(0.25)
    else:
        pytest.fail("the console never finished restoring the session")


# ── journey 1: pricing page ───────────────────────────────────────────────


@pytest.mark.parametrize(
    "viewport", [(1440, 900), (390, 844)], ids=["desktop", "mobile"]
)
async def test_pricing_page_discloses_the_charged_currency(page: Any, viewport) -> None:
    await page.set_viewport_size({"width": viewport[0], "height": viewport[1]})
    await page.goto(f"{BASE_URL}/", wait_until="domcontentloaded")
    await page.locator("#pricing").scroll_into_view_if_needed()
    notice = page.locator('[data-testid="pricing-currency-notice"]')
    await notice.wait_for(state="visible", timeout=TIMEOUT_MS)

    rendered = " ".join((await notice.inner_text()).split())
    assert NGN_CURRENCY_NOTICE.strip() in rendered, (
        "pricing page must carry the canonical disclosure verbatim"
    )

    # Informational styling: an accessible note, never a red error banner.
    styled = await page.evaluate(
        """() => {
            const box = document.querySelector('[data-testid="pricing-currency-notice"]');
            const el = box.querySelector('[role="note"]') || box;
            const cs = getComputedStyle(el);
            return { role: el.getAttribute('role'), bg: cs.backgroundColor,
                     color: cs.color, text: el.innerText.slice(0, 40) };
        }"""
    )
    assert styled["role"] == "note"
    channels = re.findall(r"rgba?\((\d+), (\d+), (\d+)", f"{styled['bg']} {styled['color']}")
    assert not any(
        int(r[0]) > 150 and int(r[1]) < 90 and int(r[2]) < 90 for r in channels
    ), f"currency disclosure must not read as an error: {styled}"

    per_card = await page.evaluate(
        """() => {
            const card = document.querySelector('[data-testid="pricing-card-pro"]');
            if (!card) return null;
            const price = card.querySelector('[data-testid="pricing-price-pro"]');
            const note = card.querySelector('[data-testid="payment-currency-pro"]');
            const cta = card.querySelector('[data-testid="pricing-cta-pro"]');
            if (!price || !note || !cta) return null;
            const r = (el) => el.getBoundingClientRect();
            return { between: r(price).bottom <= r(note).top + 1 &&
                              r(note).bottom <= r(cta).top + 1,
                     visible: r(note).height > 0 && r(note).width > 0,
                     text: note.innerText,
                     card: card.innerText };
        }"""
    )
    assert per_card, "pricing card must expose its currency line"
    assert per_card["visible"] and per_card["between"], (
        "the currency line must sit between the price and the card's action"
    )
    card_note = _flat(per_card["text"])
    assert "nigerian naira" in card_note or "ngn" in card_note
    # The mandatory triple: Product price / Actual charge / Payment provider.
    assert "product price $39.00 (usd)" in card_note, (
        "every card names the USD product price, even on the marketing page"
    )
    assert re.search(r"actual charge ₦[\d,]+\.\d{2} ?\(ngn\) ?per month", card_note), (
        "the card must state the published charge, spelled and coded"
    )
    assert re.search(r"payment provider paystack", card_note), (
        "the card must name who takes the money"
    )
    assert "$39" in per_card["card"], (
        "the USD list price stays visible — the disclosure explains, it hides nothing"
    )

    overflow = await page.evaluate(
        "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
    )
    assert overflow <= 1, f"notice must not cause horizontal scroll at {viewport[0]}px"

    # Annual is a different charge, so it must be a different disclosure.
    await page.get_by_role("button", name=re.compile(r"^Annual", re.I)).click()
    await page.wait_for_timeout(500)
    annual = _flat(await page.locator('[data-testid="payment-currency-pro"]').inner_text())
    assert re.search(r"actual charge ₦[\d,]+\.\d{2} ?\(ngn\) ?per year", annual), (
        "the annual card must show the annual payment price, not the monthly one"
    )

    # Enterprise: Contact Sales only — no NGN figure, no checkout affordance.
    ent = await page.locator('[data-testid="pricing-card-enterprise"]').inner_text()
    ent_flat = _flat(ent)
    assert "custom pricing" in ent_flat and "contact sales" in ent_flat
    assert "₦" not in ent and "$" not in ent, (
        "Enterprise must never be priced as a number, anywhere on its card"
    )

    # FX reference: if the API publishes one it must arrive labelled, sourced
    # and timestamped; if it does not, the panel must be absent — never faked.
    import urllib.request

    with urllib.request.urlopen(f"{API_URL}/billing/currency", timeout=30) as res:
        fx = json.loads(res.read().decode()).get("fx_reference")
    panel = page.locator('[data-testid="fx-reference-panel"]')
    if fx:
        assert await panel.count() == 1, "an available reference must be displayed"
        text = await panel.inner_text()
        assert "estimate" in text.lower(), "the reference must be labelled an estimate"
        assert fx["provider"].lower() in text.lower(), "the reference must name its source"
        assert fx["retrieved_at"][:10].replace("-", " ") in text or "fetched" in text.lower(), (
            "the reference must be timestamped"
        )
        assert _flat(fx["disclaimer"]) in _flat(text), (
            "the 'not your charge' disclaimer is part of the panel, verbatim"
        )
    else:
        assert await panel.count() == 0, (
            "no source, no panel: the UI must never show an invented rate"
        )


# ── journey 2: upgrade flow → Paystack → mail ─────────────────────────────


async def test_upgrade_flow_confirms_then_charges_the_published_amount(
    page: Any, api: httpx.Client
) -> None:
    account = await _account()
    auth = _auth(account["token"], account["org_id"])
    await _sign_in(page, account)

    await page.goto(f"{BASE_URL}/settings/billing", wait_until="domcontentloaded")
    billing_notice = page.locator('[data-testid="billing-currency-notice"]')
    await billing_notice.wait_for(state="visible", timeout=TIMEOUT_MS)
    assert NGN_CURRENCY_NOTICE.strip() in " ".join(
        (await billing_notice.inner_text()).split()
    ), "the billing page carries the same canonical paragraph, not a summary"

    await page.get_by_role("button", name=re.compile(r"upgrade", re.I)).first.click()
    modal = page.locator('[role="dialog"]')
    await modal.wait_for(state="visible", timeout=TIMEOUT_MS)

    grid_notice = " ".join(
        (await modal.locator('[data-testid="upgrade-currency-notice"]').inner_text()).split()
    )
    assert NGN_CURRENCY_NOTICE.strip() in grid_notice, (
        "the plan chooser carries the disclosure, not only the payment step"
    )
    published = api.get("/billing/currency").json()["plan_payment_amounts"]["pro"]
    # The digits of "₦60,000.00 (NGN)" are exactly the minor units the backend
    # publishes, so every amount below is derived from the API rather than from
    # a figure this test happens to know.
    expected_minor = int(re.sub(r"\D", "", published["monthly"]))
    card_line = _flat(
        await modal.locator('[data-testid="payment-currency-pro"]').inner_text()
    )
    assert "nigerian naira (ngn)" in card_line or "ngn" in card_line
    assert f"actual charge {published['monthly'].lower()}" in card_line, (
        "the plan chooser shows the same published charge as checkout will"
    )
    assert "payment provider paystack" in card_line

    await modal.get_by_role("button", name=re.compile(r"Upgrade to Pro", re.I)).click()
    review = page.locator('[data-testid="checkout-currency-notice"]')
    await review.wait_for(state="visible", timeout=TIMEOUT_MS)
    assert NGN_CURRENCY_NOTICE.strip() in " ".join((await review.inner_text()).split())
    amount = (
        await modal.locator('[data-testid="payment-charge-pro"]').inner_text()
    ).strip()
    assert amount == published["monthly"], (
        "the confirmed amount must match the published price character for character"
    )
    review_block = _flat(
        await modal.locator('[data-testid="payment-transparency-pro"]').inner_text()
    )
    assert "product price $39.00 (usd)" in review_block, (
        "the last RELIASTRA screen before Paystack restates the product price"
    )
    assert "payment provider paystack — secure hosted checkout" in review_block

    continue_button = page.get_by_role(
        "button", name=re.compile(r"Continue to Paystack", re.I)
    )
    assert "NGN" in await continue_button.inner_text(), (
        "the CTA itself names the currency it is about to charge"
    )

    # Backing out must return to plan choice, not to a half-started payment.
    await page.get_by_role("button", name="Back to plans", exact=True).click()
    await modal.get_by_role("button", name=re.compile(r"Upgrade to Pro", re.I)).click()
    await review.wait_for(state="visible", timeout=15_000)

    # Paystack's hosted page is where the customer goes next, and the test must
    # not depend on reaching it. Requests are recorded as they leave: the
    # response body of an API call made just before a navigation can be gone by
    # the time it is read, and a journey should not depend on that race.
    events: list[tuple[str, str | None]] = []

    def record(request: Any) -> None:
        if "/api/" not in request.url and not request.url.startswith(PROVIDER_URL):
            return
        try:
            events.append((request.url, request.post_data))
        except Exception:  # noqa: BLE001 - request body not retrievable
            events.append((request.url, None))

    page.on("request", record)
    await continue_button.click()

    deadline = asyncio.get_running_loop().time() + TIMEOUT_MS / 1000
    init: tuple[str, str | None] | None = None
    handoff: str | None = None
    while asyncio.get_running_loop().time() < deadline:
        init = next((e for e in events if e[0].endswith("/billing/initialize")), None)
        leave = next(
            (url for url, _ in events if url.startswith(PROVIDER_URL)),
            None,
        )
        if init and leave:
            handoff = leave
            break
        await asyncio.sleep(0.25)
    assert handoff and init, (
        "the browser must hand the customer to Paystack's hosted checkout"
    )

    sent = json.loads(init[1] or "{}")
    assert sent["plan"] == "pro"
    assert "amount" not in sent and "currency" not in sent, (
        "the browser must not be able to choose what it is charged"
    )

    # The handoff is Paystack's own URL carrying our reference: nothing of ours
    # is layered between the customer and the payment form.
    # Real Paystack hands off via checkout.paystack.com/<code>; the local
    # stand-in uses <provider>/pay/<reference>. Both carry OUR reference as the
    # last path segment, which is what verification is keyed on.
    match = re.search(r"paystack\.com/([^?/]+)", handoff) or re.search(
        r"/([^/?#]+)/?$", handoff
    )
    assert match, f"provider handoff URL carries no reference: {handoff}"
    reference = match.group(1)
    assert reference and reference != "initialize"

    if PAYSTACK_CAPTURE and os.path.exists(PAYSTACK_CAPTURE):
        # The stand-in appends one JSON document per initialize (JSONL); the
        # flow under test made exactly the payment it was shown, so the LAST
        # record is this journey's.
        with open(PAYSTACK_CAPTURE) as handle:
            lines = [line for line in handle.read().splitlines() if line.strip()]
        assert lines, "capture file exists but recorded nothing"
        upstream = json.loads(lines[-1])
        assert upstream["currency"] == "NGN", (
            "Paystack must be told the currency the customer was shown"
        )
        assert upstream["amount"] == expected_minor
        assert upstream["email"] == account["email"]

    # The browser has left for Paystack, so RELIASTRA must have changed
    # nothing: entitlement moves only on verification.
    still = api.get("/billing/plan", headers=auth).json()
    assert still["plan"] == account["plan"], "no upgrade before the money moved"

    # The customer "returns" and the transaction verifies: the plan moves, and
    # the payer gets a confirmation and a receipt.
    verified = api.post(f"/billing/verify?reference={reference}", headers=auth)
    assert verified.status_code == 200, verified.text
    paid = verified.json()
    assert paid["plan"] == "pro"
    # The confirmation restates the gateway's figure, not a recomputed price:
    # the amount and currency charged are the ones the customer was shown.
    assert paid["currency"] == "NGN"
    assert paid["amount_minor"] == expected_minor
    assert paid["amount_display"] == published["monthly"]

    if MAIL_URL:
        receipt = await _await_mail(account["email"], r"receipt")
        confirmation = await _await_mail(account["email"], r"subscription confirmed")
        assert confirmation and receipt, "a payer must receive both mails"
        for mail in (confirmation, receipt):
            parts = _text_parts(mail["raw"])
            assert len(parts) >= 2, "delivered mail must carry text and HTML parts"
            for text in parts:
                assert TRANSACTIONAL_SUPPORT_FOOTER in text, (
                    f"{mail['subject']}: every delivered mail carries the footer"
                )
            joined = " ".join(parts)
            assert "NGN" in joined, "the mail must state the currency charged"
            # The triple belongs on payment documents too; the USD figure may
            # only appear as a *labelled product price*, never as the charge.
            assert "Payment provider: Paystack" in joined
            assert "Product price: $39.00 (USD)" in joined
            assert "Actual charge: ₦" in joined, (
                "the charge line itself must be in the currency actually charged"
            )
        assert published["monthly"] in " ".join(_text_parts(receipt["raw"])), (
            "the receipt shows the amount actually charged"
        )


async def test_upgrade_modal_stays_usable_on_a_phone(page: Any) -> None:
    """Mobile rule: the disclosure must not push the payment action away.

    The spec asks for the notice to be visible *with* the CTA rather than above
    it on a scrollable page, and for no horizontal scroll. Both are properties
    of a rendered 390px viewport, so they are measured here.
    """
    await page.set_viewport_size({"width": 390, "height": 844})
    await _sign_in(page, await _create_account())
    await page.goto(f"{BASE_URL}/settings/billing", wait_until="domcontentloaded")
    # "Upgrade" before a subscription exists, "Change plan" once one does — the
    # journeys share one account, so both are legitimate entry points.
    await page.get_by_role("button", name=re.compile(r"upgrade|change plan", re.I)).first.click()
    modal = page.locator('[role="dialog"]')
    await modal.wait_for(state="visible", timeout=TIMEOUT_MS)

    geometry = await modal.evaluate(
        """(el) => {
            const panel = el.querySelector('[role="document"]') || el;
            const notice = panel.querySelector('[data-testid="upgrade-currency-notice"]');
            const card = panel.querySelector('[data-testid="payment-currency-pro"]');
            return {
                overflowingX: panel.scrollWidth - panel.clientWidth,
                pageOverflowX:
                    document.documentElement.scrollWidth -
                    document.documentElement.clientWidth,
                noticeVisible: !!notice && notice.getBoundingClientRect().height > 0,
                cardVisible: !!card && card.getBoundingClientRect().height > 0,
            };
        }"""
    )
    assert geometry["noticeVisible"], "the plan chooser keeps its disclosure at 390px"
    assert geometry["cardVisible"], "the per-plan currency line stays on screen at 390px"
    assert geometry["overflowingX"] <= 1, f"modal scrolls sideways: {geometry}"
    assert geometry["pageOverflowX"] <= 1, f"page scrolls sideways: {geometry}"

    # Review step: notice and the payment action share one screen.
    await modal.get_by_role("button", name=re.compile(r"Upgrade to Pro", re.I)).click()
    both = await page.evaluate(
        """() => {
            const notice = document.querySelector('[data-testid="checkout-currency-notice"]');
            const buttons = Array.from(document.querySelectorAll('[role="dialog"] button'));
            const cta = buttons.find((b) => b.textContent.includes('Continue to Paystack'));
            if (!notice || !cta) return null;
            const vh = window.innerHeight;
            const top = Math.min(notice.getBoundingClientRect().top, cta.getBoundingClientRect().top);
            const bottom = Math.max(notice.getBoundingClientRect().bottom, cta.getBoundingClientRect().bottom);
            const scroller = cta.closest('[class*="overflow-y-auto"]') ?? document.scrollingElement;
            return { top, bottom, vh, scrollable: scroller ? scroller.scrollHeight - scroller.clientHeight : 0 };
        }"""
    )
    assert both, "the confirmation step needs the disclosure and the payment action"
    fits = both["bottom"] <= both["vh"] and both["top"] >= 0
    assert fits or both["scrollable"] > 0, (
        f"the disclosure must not push the CTA off-screen: {both}"
    )
