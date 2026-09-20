"""app.infrastructure.email — backward-compatibility alias.

Canonical home: ``app.platform.integrations.email_smtp``
Moved during the platform redesign. New code must import from the canonical
path; this module re-exports the exact same objects and is covered by the
import-parity test (``tests/unit/test_import_parity.py``).
"""

from app.platform.integrations.email_smtp import (  # noqa: F401
    EmailClient,
    MIMEMultipart,
    MIMEText,
    asyncio,
    email_client,
    logger,
    logging,
    settings,
    smtplib,
)

__all__ = [
    "EmailClient",
    "MIMEMultipart",
    "MIMEText",
    "asyncio",
    "email_client",
    "logger",
    "logging",
    "settings",
    "smtplib",

]
