"""Minimal Paystack API mock so billing flows can be exercised end-to-end.

This is the *local developer / test* stand-in for api.paystack.co. It mirrors
the real contract closely enough for the customer journey to run unchanged:

  POST /transaction/initialize   -> records the request, returns
                                    authorization_url/reference/access_code
  GET  /pay/<reference>          -> the "hosted page": a stub that redirects
                                    back to the frontend's billing page with
                                    ?pay_ref=<reference>, like Paystack does
  GET  /transaction/verify/:ref  -> a successful verification echoing the
                                    exact amount + currency + metadata that
                                    initialize received (a provider must
                                    report what IT was asked to charge)
  GET  /capture                  -> the last initialize body (test hook)
  GET  /capture/all              -> every initialize body, as JSONL
  GET  /fx/latest                -> a static USD->NGN stub for the FX
                                    reference feature (display-only)
Any other path -> 404

Environment:
  PORT                 listen port (default 9200)
  FRONTEND_URL         where /pay/<ref> redirects (default http://localhost:3000)
  PAYSTACK_CAPTURE     optional file; every initialize body is also written
                       here, newline-delimited, so out-of-band tests can read
                       exactly what upstream was told to charge
  FX_NGN_RATE          the static USD->NGN reference rate (default 1650.00)

The mock deliberately charges nothing — it exists so the surrounding product
(UI -> API -> provider request -> verification -> persisted transaction)
can be verified for real, including the amount and currency invariance.
"""

import json
import os
import sys
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", "9200"))
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
CAPTURE_FILE = os.environ.get("PAYSTACK_CAPTURE", "")
FX_NGN_RATE = float(os.environ.get("FX_NGN_RATE", "1650.00"))

_tx = {}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print("[paystack-mock] %s" % (fmt % args), flush=True)

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _html(self, code, html):
        body = html.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        ln = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(ln) if ln else b"{}"
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {}
        if self.path == "/transaction/initialize":
            ref = f"mock-ref-{uuid.uuid4().hex[:16]}"
            # Record exactly what the merchant (RELIASTRA backend) asked
            # Paystack to charge — amount in minor units + currency. Tests
            # assert this equals what the customer saw on screen.
            record = {
                "reference": ref,
                "amount": payload.get("amount"),
                "currency": payload.get("currency"),
                "email": payload.get("email"),
                "plan": payload.get("plan"),
                "metadata": payload.get("metadata"),
                "callback_url": payload.get("callback_url"),
            }
            _tx[ref] = record
            with open(CAPTURE_FILE, "a") if CAPTURE_FILE else open(os.devnull, "w") as fh:
                fh.write(json.dumps(record) + "\n")
            self._json(
                200,
                {
                    "status": True,
                    "message": "Authorization URL created",
                    "data": {
                        # A local "hosted page" so the journey can complete:
                        # it behaves like Paystack's redirect-back flow.
                        "authorization_url": f"http://127.0.0.1:{PORT}/pay/{ref}",
                        "access_code": "mock-access-code",
                        "reference": ref,
                    },
                },
            )
            return
        if self.path == "/reset":
            _tx.clear()
            self._json(200, {"status": True})
            return
        self._json(404, {"status": False, "message": "not found"})

    def do_GET(self):
        if self.path.startswith("/transaction/verify/"):
            ref = self.path.rsplit("/", 1)[-1]
            record = _tx.get(ref)
            if not record:
                self._json(404, {"status": False, "message": "Unknown reference"})
                return
            from datetime import datetime, timedelta, timezone

            now = datetime.now(timezone.utc)
            self._json(
                200,
                {
                    "status": True,
                    "message": "Verification successful",
                    "data": {
                        "id": abs(hash(ref)) % 10**9,
                        "reference": ref,
                        "status": "success",
                        "amount": record.get("amount"),
                        # The provider reports the currency it was told to
                        # charge — the exact figure the customer was shown.
                        "currency": record.get("currency") or "NGN",
                        "paid_at": now.isoformat(),
                        "transaction_date": (now - timedelta(minutes=1)).isoformat(),
                        "next_payment_date": (now + timedelta(days=30)).isoformat(),
                        "domain": "reliastra.com",
                        "channel": "card",
                        "gateway_reference": f"GATEWAY-{ref[-8:]}",
                        "customer": {"customer_code": f"CUST_{ref[-6:].upper()}"},
                        "metadata": record.get("metadata") or {},
                    },
                },
            )
            return
        if self.path.startswith("/pay/"):
            ref = self.path.rsplit("/", 1)[-1]
            record = _tx.get(ref, {})
            amount = record.get("amount")
            currency = record.get("currency") or "NGN"
            amount_major = f"{(amount or 0) / 100:,.2f}"
            html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Paystack (mock) checkout</title>
<style>body{{font:14px -apple-system,Segoe UI,Roboto,sans-serif;background:#0A1628;color:#fff;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}}
.card{{background:#101D33;border:1px solid #23406b;border-radius:12px;padding:32px;max-width:420px;width:92%}}
h1{{font-size:16px;margin:0 0 16px}} .amt{{font-size:26px;font-weight:700;margin:8px 0}}
small{{color:#8fa3bf}}</style></head>
<body><div class="card"><h1>Paystack &mdash; mock hosted checkout</h1>
<p>You are about to pay</p><p class="amt">{currency} {amount_major}</p>
<p>reference <code>{ref}</code></p>
<button id="pay" style="width:100%;padding:12px;border-radius:8px;border:0;background:#0AA87F;
color:#fff;font-weight:600;cursor:pointer">Pay {currency} {amount_major}</button>
<p><small>Test harness — clicking completes the payment and returns to RELIASTRA.</small></p></div>
<script>
document.getElementById('pay').onclick = () => {{
  location.href = {json.dumps(FRONTEND_URL)} + '/settings/billing?pay_ref=' + {json.dumps(ref)} + '&status=success';
}};
setTimeout(() => location.reload(), 60000);
</script></body></html>"""
            self._html(200, html)
            return
        if self.path == "/capture":
            if not CAPTURE_FILE or not os.path.exists(CAPTURE_FILE):
                self._json(200, {})
                return
            lines = [
                json.loads(line)
                for line in open(CAPTURE_FILE).read().splitlines()
                if line.strip()
            ]
            self._json(200, lines[-1] if lines else {})
            return
        if self.path == "/capture/all":
            if not CAPTURE_FILE or not os.path.exists(CAPTURE_FILE):
                self._json(200, [])
                return
            lines = [
                json.loads(line)
                for line in open(CAPTURE_FILE).read().splitlines()
                if line.strip()
            ]
            self._json(200, lines)
            return
        if self.path.startswith("/fx/latest"):
            from datetime import datetime, timezone

            self._json(
                200,
                {
                    "result": "success",
                    "base_code": "USD",
                    "base": "USD",
                    "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    "time_last_update_utc": datetime.now(timezone.utc).strftime(
                        "%a, %d %b %Y %H:%M:%S +0000"
                    ),
                    "rates": {"NGN": FX_NGN_RATE, "GHS": 15.0, "ZAR": 18.0},
                },
            )
            return
        self._json(404, {"status": False, "message": "not found"})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()


def main() -> None:
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"paystack mock listening on 0.0.0.0:{PORT}", flush=True)
    if CAPTURE_FILE:
        print(f"  capture file: {CAPTURE_FILE}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    sys.exit(main())
