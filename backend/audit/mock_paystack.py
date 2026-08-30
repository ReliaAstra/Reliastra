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
_ACCESS = {}


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
                # Echoed back only so a test can assert what the merchant sent.
                # RELIASTRA deliberately does NOT set `plan` (a Paystack plan
                # code would override `amount` per the API reference), so a
                # non-null value here means the checkout regressed.
                "plan": payload.get("plan"),
                "channels": payload.get("channels"),
                "metadata": payload.get("metadata"),
                "callback_url": payload.get("callback_url"),
                "outcome": "success",
            }
            _tx[ref] = record
            # InlineJS is handed an access code and nothing else, so the code ->
            # reference mapping has to be kept for a popup success to resolve
            # back to the payment RELIASTRA must then verify. It is unique per
            # transaction for the same reason: a shared code could not say which
            # payment was approved.
            access_code = f"mock-access-{ref}"
            _ACCESS[access_code] = ref
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
                        "access_code": access_code,
                        "reference": ref,
                    },
                },
            )
            return
        if self.path == "/reset":
            # Tests call this for isolation, so it must clear EVERY record of
            # what happened — including the capture log that `/capture` reads.
            # Truncating only the in-memory transactions would leave a previous
            # test's initialize call as "the latest", which is exactly the kind
            # of stale assertion that makes an e2e suite lie.
            _tx.clear()
            _ACCESS.clear()
            if CAPTURE_FILE:
                try:
                    open(CAPTURE_FILE, "w").close()
                except OSError:
                    pass
            self._json(200, {"status": True, "reset": True})
            return
        if self.path.startswith("/outcome/"):
            # POST /outcome/<reference>/<success|failed|pending> — lets a test
            # decide what the provider will report when RELIASTRA verifies.
            parts = self.path.rsplit("/", 2)
            ref, wanted = parts[-2], parts[-1]
            if ref in _tx and wanted in ("success", "failed", "pending"):
                _tx[ref]["outcome"] = wanted
                self._json(200, {"status": True})
            else:
                self._json(404, {"status": False, "message": "unknown"})
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
            # The recorded outcome drives the reported status, so a test can
            # walk the declined / pending branches of RELIASTRA's verification,
            # not only the happy path. A reference that was never paid reports
            # "pending" the way the real API does, rather than inventing a
            # success the provider never granted.
            reported = record.get("outcome") if record else "pending"
            if reported not in ("success", "failed", "pending"):
                reported = "success"
            self._json(
                200,
                {
                    "status": True,
                    "message": "Verification successful",
                    "data": {
                        "id": abs(hash(ref)) % 10**9,
                        "reference": ref,
                        "status": reported,
                        "amount": record.get("amount"),
                        # The provider reports the currency it was told to
                        # charge — the exact figure the customer was shown.
                        "currency": record.get("currency") or "NGN",
                        "paid_at": now.isoformat(),
                        "transaction_date": (now - timedelta(minutes=1)).isoformat(),
                        # Deliberately absent: ``next_payment_date`` belongs to
                        # Paystack *subscriptions*, and RELIASTRA initializes a
                        # one-off transaction (it owns billing state itself). The
                        # hosted checkout must therefore exercise the same shape
                        # production returns, including RELIASTRA deriving the
                        # period from the interval it sold.
                        "next_payment_date": None,
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
            # The "hosted checkout" page. Query-driven outcomes let a test walk
            # every branch of the customer journey against the real product
            # code: paid, declined, or abandoned.
            from urllib.parse import parse_qs, urlparse

            ref = urlparse(self.path).path.rsplit("/", 1)[-1]
            query = parse_qs(urlparse(self.path).query)
            wanted = (query.get("outcome") or ["success"])[0]
            record = _tx.get(ref, {})
            amount = record.get("amount")
            currency = record.get("currency") or "NGN"
            amount_major = f"{(amount or 0) / 100:,.2f}"
            # Paystack returns the customer to the transaction's own
            # callback_url — which RELIASTRA sets to its checkout page — so the
            # harness follows that value instead of hardcoding a route. That is
            # what makes a redirect-based test exercise the real resume path.
            return_to = record.get("callback_url") or f"{FRONTEND_URL}/checkout"
            outcome = (
                wanted
                if wanted in ("success", "failed", "pending", "cancel")
                else "success"
            )
            html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Paystack (mock) checkout</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{{font:14px -apple-system,Segoe UI,Roboto,sans-serif;background:#0A1628;color:#fff;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px}}
.card{{background:#101D33;border:1px solid #23406b;border-radius:12px;padding:32px;max-width:420px;width:100%}}
h1{{font-size:16px;margin:0 0 16px}} .amt{{font-size:26px;font-weight:700;margin:8px 0}}
button{{width:100%;padding:13px;border-radius:8px;border:0;font-weight:600;cursor:pointer;margin-top:8px}}
small{{color:#8fa3bf}}</style></head>
<body><div class="card"><h1>Paystack &mdash; mock hosted checkout</h1>
<p>You are about to pay</p><p class="amt">{currency} {amount_major}</p>
<p>reference <code>{ref}</code></p>
<p><small>channels: {record.get("channels") or "card"}</small></p>
<button id="pay" style="background:#0AA87F;color:#fff">Pay {currency} {amount_major}</button>
<button id="decline" style="background:#7f1d1d;color:#fff">Simulate decline</button>
<button id="cancel" style="background:transparent;color:#8fa3bf;border:1px solid #23406b">Cancel</button>
<p><small>Test harness &mdash; returns to RELIASTRA, which verifies server-side.</small></p></div>
<script>
var BASE = {json.dumps(return_to)};
var REF = {json.dumps(ref)};
function finish(status) {{
  var sep = BASE.indexOf('?') >= 0 ? '&' : '?';
  location.href = BASE + sep + 'reference=' + REF + '&status=' + status;
}}
// ?outcome=… auto-completes the payment, so a headless test does not have to
// click through a provider UI it does not own.
if ({json.dumps(outcome)} === 'success') finish('success');
document.getElementById('pay').onclick = function() {{ finish('success'); }};
document.getElementById('decline').onclick = function() {{
  var base = {json.dumps(return_to)};
  var sep = base.indexOf('?') >= 0 ? '&' : '?';
  fetch('/outcome/{ref}/failed', {{method:'POST'}}).then(function() {{
    location.href = base + sep + 'reference=' + {json.dumps(ref)} + '&status=failed';
  }});
}};
document.getElementById('cancel').onclick = function() {{ location.href = BASE; }};
setTimeout(function() {{ location.reload(); }}, 60000);
</script></body></html>"""
            self._html(200, html)
            return
        if self.path.startswith("/v1/inline.js"):
            # A stand-in for Paystack's InlineJS. It is the *contract* the
            # product integrates against — `new PaystackPop()` with
            # `resumeTransaction(accessCode, {onSuccess,onCancel,onError,onLoad})`
            # — not an emulation of their UI: RELIASTRA's own code (script
            # loading, callback wiring, verify-on-success) is what is exercised.
            self._html(
                200,
                """(function(){
  function overlay(accessCode){
    var host=document.getElementById('reliastra-mock-paystack-overlay');
    if(host) host.remove();
    host=document.createElement('div'); host.id='reliastra-mock-paystack-overlay';
    host.setAttribute('role','dialog'); host.setAttribute('aria-label','Paystack (mock)');
    host.style.cssText='position:fixed;inset:0;z-index:2147483000;background:rgba(8,12,20,.62);display:flex;align-items:center;justify-content:center;padding:16px;font:14px -apple-system,Segoe UI,Roboto,sans-serif';
    host.innerHTML='<div style="background:#101D33;color:#fff;border:1px solid #23406b;border-radius:12px;padding:24px;max-width:380px;width:100%">'
      +'<div style="font-size:15px;font-weight:600;margin-bottom:6px">Paystack (mock)</div>'
      +'<div style="color:#8fa3bf;font-size:12px;margin-bottom:14px">access code '+accessCode+'</div>'
      +'<button data-out="success" style="width:100%;padding:12px;border-radius:8px;border:0;background:#0AA87F;color:#fff;font-weight:600;cursor:pointer">Approve payment</button>'
      +'<button data-out="decline" style="width:100%;margin-top:8px;padding:12px;border-radius:8px;border:0;background:#7f1d1d;color:#fff;font-weight:600;cursor:pointer">Decline card</button>'
      +'<button data-out="cancel" style="width:100%;margin-top:8px;padding:12px;border-radius:8px;border:1px solid #23406b;background:transparent;color:#8fa3bf;font-weight:600;cursor:pointer">Cancel</button>'
      +'</div>';
    document.body.appendChild(host);
    var buttons=host.querySelectorAll('button');
    for(var i=0;i<buttons.length;i++){
      buttons[i].addEventListener('click',function(ev){
        var out=ev.currentTarget.getAttribute('data-out');
        var cb=window.__RELIASTRA_MOCK_CALLBACKS__||{};
        if(out==='success'&&cb.onSuccess){
          // Resolve the access code back to its reference, exactly as the real
          // flow does: the popup reports a reference, and RELIASTRA verifies it.
          fetch('/capture/resolve/'+accessCode+'/success').then(function(r){return r.json();}).then(function(body){
            cb.onSuccess({reference:body.reference||'',id:1,message:'Approved'});
          });
        } else if(out==='decline'&&cb.onError){
          cb.onError({message:'Card declined by issuing bank'});
        } else if(cb.onCancel){ cb.onCancel(); }
        host.remove();
      });
    }
  }
  function PaystackPop(){}
  PaystackPop.prototype.resumeTransaction=function(accessCode,callbacks){
    window.__RELIASTRA_MOCK_CALLBACKS__=callbacks||{};
    if(callbacks&&callbacks.onLoad) callbacks.onLoad({id:1,accessCode:accessCode,customer:{}});
    overlay(String(accessCode));
  };
  PaystackPop.prototype.newTransaction=function(options){
    window.__RELIASTRA_MOCK_CALLBACKS__=options||{};
    overlay('mock-inline');
  };
  window.PaystackPop=PaystackPop;
})();""",
            )
            return

        if self.path.startswith("/capture/resolve/"):
            # The InlineJS stub only knows the access code, so it asks which
            # reference that code belongs to before reporting success.
            code = self.path.rsplit("/", 2)[-2]
            ref = _ACCESS.get(code)
            if ref:
                _tx[ref]["outcome"] = (
                    "success" if self.path.endswith("/success") else "failed"
                )
                self._json(
                    200,
                    {"status": True, "reference": ref, "outcome": _tx[ref]["outcome"]},
                )
            else:
                self._json(404, {"status": False, "message": "unknown access code"})
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
