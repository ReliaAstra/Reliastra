"""Invoice and receipt HTML generated from persisted billing transactions.

Documents are built from ``billing_transactions`` — the provider-reported
charge recorded at payment time — never from today's price list. A later
repricing cannot rewrite an invoice.

Invoices and receipts are distinct:

* Invoice — the bill for a subscription period (seller, buyer, line item,
  amounts, status).
* Receipt — proof that a payment was collected (reference, paid-at, method,
  charged amount).

Both are HTML so they can be viewed in the browser and downloaded without a
PDF library. Print CSS produces a paper-stable document.
"""

from __future__ import annotations

from datetime import datetime
from html import escape
from uuid import UUID

from app.core.commercial_terms import (
    BILLING_EMAIL,
    REFUND_POLICY_PATH,
    SELLER_BRAND,
    SELLER_LEGAL_NAME,
    refund_summary,
)
from app.core.payment_pricing import format_money
from app.core.permissions import get_plan_display_name
from app.modules.billing.models import BillingTransaction


def document_number(prefix: str, tx: BillingTransaction) -> str:
    when = tx.paid_at or tx.created_at
    yyyymm = when.strftime("%Y%m") if isinstance(when, datetime) else "000000"
    short = str(tx.id).replace("-", "")[:8].upper()
    return f"{prefix}-{yyyymm}-{short}"


def invoice_number(tx: BillingTransaction) -> str:
    return document_number("INV", tx)


def receipt_number(tx: BillingTransaction) -> str:
    return document_number("RCT", tx)


def _day(value: datetime | None) -> str:
    if not isinstance(value, datetime):
        return "—"
    return value.strftime("%d %b %Y")


def _row(label: str, value: str) -> str:
    return (
        f"<tr><th>{escape(label)}</th><td>{escape(value)}</td></tr>"
    )


def _status_label(status: str) -> str:
    mapping = {
        "success": "Paid",
        "refunded": "Refunded",
        "disputed": "Disputed",
        "failed": "Failed",
        "pending": "Pending",
    }
    return mapping.get(status, status.replace("_", " ").title())


def _shell(*, title: str, number: str, kind: str, body: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{escape(title)}</title>
  <style>
    :root {{ color-scheme: light; }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: #f4f1ea;
      color: #161410;
      font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Times New Roman", serif;
      font-size: 15px;
      line-height: 1.5;
    }}
    .page {{
      max-width: 720px;
      margin: 32px auto;
      background: #fff;
      border: 1px solid #d6d0c4;
      padding: 40px 44px 36px;
    }}
    header {{
      display: flex;
      justify-content: space-between;
      gap: 24px;
      border-bottom: 1px solid #161410;
      padding-bottom: 16px;
      margin-bottom: 28px;
    }}
    .brand {{
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      font-weight: 600;
    }}
    h1 {{
      font-size: 22px;
      font-weight: 600;
      margin: 4px 0 0;
      letter-spacing: -0.02em;
    }}
    .meta {{ text-align: right; font-size: 13px; }}
    .mono {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }}
    table {{ width: 100%; border-collapse: collapse; }}
    th, td {{
      text-align: left;
      padding: 8px 0;
      border-bottom: 1px solid #e6e0d4;
      vertical-align: top;
    }}
    th {{
      width: 42%;
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      font-weight: 600;
      color: #5c574c;
    }}
    .parties {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 28px;
    }}
    .label {{
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-size: 11px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #5c574c;
      margin: 0 0 6px;
    }}
    footer {{
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #d6d0c4;
      font-size: 12px;
      color: #5c574c;
    }}
    @media print {{
      body {{ background: #fff; }}
      .page {{ margin: 0; border: 0; max-width: none; padding: 12mm; }}
    }}
    @media (max-width: 640px) {{
      .page {{ margin: 0; border: 0; padding: 24px 20px; }}
      .parties {{ grid-template-columns: 1fr; }}
      header {{ flex-direction: column; }}
      .meta {{ text-align: left; }}
    }}
  </style>
</head>
<body>
  <article class="page" data-document="{escape(kind)}" data-number="{escape(number)}">
    {body}
  </article>
</body>
</html>
"""


def render_invoice(
    tx: BillingTransaction,
    *,
    organization_name: str,
    billing_email: str | None,
) -> str:
    number = invoice_number(tx)
    plan = get_plan_display_name(tx.plan)
    interval = (tx.billing_interval or "monthly").capitalize()
    charged = format_money(tx.charged_amount_minor, tx.charged_currency)
    product = format_money(tx.product_amount_minor, tx.product_currency) or "—"
    status = _status_label(tx.status)
    period = ""
    if tx.period_start or tx.period_end:
        period = f"{_day(tx.period_start)} – {_day(tx.period_end)}"
    rows = [
        _row("Invoice number", number),
        _row("Status", status),
        _row("Date", _day(tx.paid_at or tx.created_at)),
        _row("Description", f"RELIASTRA {plan} · {interval}"),
        _row("Product price", product),
        _row("Amount", charged),
        _row("Currency", tx.charged_currency),
        _row("Payment provider", (tx.provider or "paystack").capitalize()),
        _row("Payment reference", tx.reference),
    ]
    if period:
        rows.append(_row("Billing period", period))
    body = f"""
    <header>
      <div>
        <p class="brand">{escape(SELLER_BRAND)}</p>
        <h1>Invoice</h1>
      </div>
      <div class="meta mono">{escape(number)}</div>
    </header>
    <div class="parties">
      <div>
        <p class="label">From</p>
        <p>{escape(SELLER_LEGAL_NAME)}<br/>{escape(BILLING_EMAIL)}</p>
      </div>
      <div>
        <p class="label">Bill to</p>
        <p>{escape(organization_name)}{('<br/>' + escape(billing_email)) if billing_email else ''}</p>
      </div>
    </div>
    <table>{''.join(rows)}</table>
    <footer>
      <p>{escape(refund_summary())}</p>
      <p>Questions: {escape(BILLING_EMAIL)} · Refund policy: {escape(REFUND_POLICY_PATH)}</p>
    </footer>
    """
    return _shell(title=f"Invoice {number}", number=number, kind="invoice", body=body)


def render_receipt(
    tx: BillingTransaction,
    *,
    organization_name: str,
    billing_email: str | None,
) -> str:
    number = receipt_number(tx)
    plan = get_plan_display_name(tx.plan)
    interval = (tx.billing_interval or "monthly").capitalize()
    charged = format_money(tx.charged_amount_minor, tx.charged_currency)
    product = format_money(tx.product_amount_minor, tx.product_currency) or "—"
    status = _status_label(tx.status)
    method = ""
    meta = tx.provider_metadata if isinstance(tx.provider_metadata, dict) else {}
    brand = meta.get("card_brand") or meta.get("brand")
    last4 = meta.get("last4")
    if brand and last4:
        method = f"{str(brand).title()} ······{last4}"
    elif meta.get("channel"):
        method = str(meta.get("channel")).replace("_", " ").title()
    rows = [
        _row("Receipt number", number),
        _row("Status", status),
        _row("Paid", _day(tx.paid_at or tx.created_at)),
        _row("Plan", f"RELIASTRA {plan} · {interval}"),
        _row("Product price", product),
        _row("Amount charged", charged),
        _row("Charged currency", tx.charged_currency),
        _row("Payment provider", (tx.provider or "paystack").capitalize()),
        _row("Payment reference", tx.reference),
    ]
    if method:
        rows.append(_row("Payment method", method))
    if tx.verified_at:
        rows.append(_row("Verified", _day(tx.verified_at)))
    body = f"""
    <header>
      <div>
        <p class="brand">{escape(SELLER_BRAND)}</p>
        <h1>Receipt</h1>
      </div>
      <div class="meta mono">{escape(number)}</div>
    </header>
    <div class="parties">
      <div>
        <p class="label">Collected by</p>
        <p>{escape(SELLER_LEGAL_NAME)}<br/>{escape(BILLING_EMAIL)}</p>
      </div>
      <div>
        <p class="label">Payer</p>
        <p>{escape(organization_name)}{('<br/>' + escape(billing_email or tx.email or '')) if (billing_email or tx.email) else ''}</p>
      </div>
    </div>
    <table>{''.join(rows)}</table>
    <footer>
      <p>This receipt is proof of the amount Paystack collected for this reference. It is not a tax invoice by itself.</p>
      <p>{escape(refund_summary())}</p>
    </footer>
    """
    return _shell(title=f"Receipt {number}", number=number, kind="receipt", body=body)


def filename_for(kind: str, tx: BillingTransaction) -> str:
    number = invoice_number(tx) if kind == "invoice" else receipt_number(tx)
    return f"reliastra-{kind.lower()}-{number}.html"
