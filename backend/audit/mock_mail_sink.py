"""Tiny SMTP capture + HTTP inbox for local billing journeys (MailHog stand-in).

Listens for SMTP on :2525 and speaks just enough protocol to accept mail from
the app's SMTP client. Captured messages are readable over HTTP, shaped like
MailHog so existing e2e tooling works unchanged:

  GET /api/v2/messages   -> {"items": [{"Content": {"headers": {...}}, "MIME": {"raw": "..."}}]}
  GET /                  -> {"messages": [{"subject","to","raw"}]}
  GET /reset             -> clears the inbox

The backend points at it with SMTP_HOST=127.0.0.1 SMTP_PORT=2525. Tests read
the emailed OTP and the payment mails from here, exactly as a customer would
receive them — no in-process mocks.
"""

import json
import os
import re
import socketserver
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SMTP_PORT = int(os.environ.get("SMTP_PORT", "2525"))
HTTP_PORT = int(os.environ.get("HTTP_PORT", "8025"))

_lock = threading.Lock()
_MESSAGES: list[dict] = []


class _SMTPHandler(socketserver.StreamRequestHandler):
    def _send(self, line: str) -> None:
        self.wfile.write(f"{line}\r\n".encode())

    def handle(self):  # noqa: C901 - a tiny protocol, best kept linear
        self._send("220 reliastra-mock ESMTP ready")
        data_lines: list[str] = []
        collecting = False
        while True:
            raw = self.rfile.readline()
            if not raw:
                break
            line = raw.decode("utf-8", "replace").rstrip("\r\n")
            if collecting:
                if line == ".":
                    collecting = False
                    self._send("250 OK queued")
                    self._store("\r\n".join(data_lines))
                    data_lines = []
                else:
                    data_lines.append(line[1:] if line.startswith("..") else line)
                continue
            verb = line.split(" ", 1)[0].upper()
            if verb == "HELO" or verb == "EHLO":
                self._send("250 hello" if verb == "HELO" else "250-hello\r\n250 SMTPUTF8")
            elif verb == "MAIL":
                self._send("250 sender ok")
            elif verb == "RCPT":
                self._send("250 recipient ok")
            elif verb == "DATA":
                collecting = True
                self._send("354 send data")
            elif verb == "RSET":
                self._send("250 reset ok")
            elif verb == "NOOP":
                self._send("250 noop")
            elif verb == "QUIT":
                self._send("221 bye")
                break
            else:
                self._send("250 ok")

    def _store(self, message: str) -> None:
        headers = {}
        for match in re.finditer(
            r"(?im)^(subject|to|from)\s*:\s*(.+?)\s*$", message
        ):
            headers.setdefault(match.group(1).lower(), match.group(2))
        with _lock:
            _MESSAGES.append({"raw": message, "headers": headers})


class _HTTPHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print("[mail-sink] %s" % (fmt % args), flush=True)

    def do_GET(self):
        with _lock:
            messages = list(_MESSAGES)
        if self.path == "/reset":
            with _lock:
                _MESSAGES.clear()
            self._json(200, {"status": "ok"})
            return
        if self.path.startswith("/api/"):
            items = [
                {
                    "Content": {
                        "headers": {
                            k.upper(): [v] for k, v in msg["headers"].items()
                        },
                        "data": msg["raw"],
                    },
                    "MIME": {"raw": msg["raw"]},
                }
                for msg in messages
            ]
            self._json(200, {"total": len(items), "count": len(items), "items": items})
            return
        slim = [
            {
                "subject": msg["headers"].get("subject", ""),
                "to": msg["headers"].get("to", ""),
                "from": msg["headers"].get("from", ""),
                "raw": msg["raw"],
            }
            for msg in messages
        ]
        self._json(200, {"messages": slim})

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class _ThreadingSMTPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> None:
    smtp = _ThreadingSMTPServer(("0.0.0.0", SMTP_PORT), _SMTPHandler)
    httpd = ThreadingHTTPServer(("0.0.0.0", HTTP_PORT), _HTTPHandler)
    threading.Thread(target=smtp.serve_forever, daemon=True).start()
    print(
        f"mail sink: SMTP 0.0.0.0:{SMTP_PORT} · HTTP 0.0.0.0:{HTTP_PORT}",
        flush=True,
    )
    httpd.serve_forever()


if __name__ == "__main__":
    main()
