import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger(__name__)


class EmailClient:
    def __init__(
        self,
        smtp_host: str | None = None,
        smtp_port: int | None = None,
        smtp_from: str | None = None,
        use_tls: bool | None = None,
    ) -> None:
        self.smtp_host = smtp_host or settings.SMTP_HOST
        self.smtp_port = smtp_port or settings.SMTP_PORT
        self.smtp_from = smtp_from or settings.SMTP_FROM
        self.use_tls = settings.SMTP_USE_TLS if use_tls is None else use_tls

    def send_email(
        self,
        to_email: str,
        subject: str,
        body: str,
        html_body: str | None = None,
        *,
        category: str = "transactional",
    ) -> bool:
        """SYNC — call via ``asyncio.to_thread`` from async code.

        Resend-first: when ``RESEND_API_KEY`` is configured the message goes
        through Resend (the only supported production path — there is no
        local MTA in production). SMTP is strictly a fallback for local
        development (MailHog) and hermetic tests. No caller sends SMTP-only.
        """
        logger.info("Sending email to '%s': Subject='%s'", to_email, subject)
        try:
            from app.infrastructure.email_resend import send_via_resend_sync

            ok, _resend_id = send_via_resend_sync(
                to=to_email,
                subject=subject,
                html=html_body or f"<p>{body}</p>",
                text=body,
                category=category,
            )
            if ok:
                return True
            logger.debug(
                "Resend unavailable, falling back to SMTP %s:%s",
                self.smtp_host,
                self.smtp_port,
            )
        except Exception as exc:
            logger.debug("Resend attempt failed, falling back to SMTP: %s", exc)
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = self.smtp_from
        message["To"] = to_email
        message.attach(MIMEText(body, "plain"))
        if html_body:
            message.attach(MIMEText(html_body, "html"))

        server: smtplib.SMTP | smtplib.SMTP_SSL | None = None
        try:
            if self.smtp_port == 465:
                server = smtplib.SMTP_SSL(
                    self.smtp_host, self.smtp_port, timeout=3
                )
            else:
                server = smtplib.SMTP(
                    self.smtp_host, self.smtp_port, timeout=3
                )
                if self.use_tls or self.smtp_port == 587:
                    server.starttls()
            server.send_message(message)
            server.quit()
            server = None
            logger.info(
                "Successfully sent email via SMTP %s:%s",
                self.smtp_host,
                self.smtp_port,
            )
            return True
        except Exception as exc:
            logger.warning("SMTP delivery failed (%s), email not sent.", exc)
            return False
        finally:
            if server is not None:
                try:
                    server.quit()
                except Exception:
                    pass


    async def send_async(
        self,
        to_email: str,
        subject: str,
        body: str,
        html_body: str | None = None,
    ) -> bool:
        """Async wrapper — runs the blocking SMTP call in a thread pool."""
        return await asyncio.to_thread(
            self.send_email,
            to_email,
            subject,
            body,
            html_body,
        )


email_client = EmailClient()
