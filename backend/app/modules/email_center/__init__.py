"""Admin Email Center - internal operational email console.

This module is the single backend surface for the Admin Dashboard's
"Email Center" (``/admin/email``). It lets authorized admins compose and send
business/transactional emails through the Resend API using sender aliases on
the Reliastra sending domain.

Design notes:

* The Resend API key NEVER leaves the backend. The frontend talks only to
  these endpoints; every route requires ``require_system_admin``.
* Sender eligibility is derived from LIVE Resend state, never from local
  assumptions: Resend verifies *domains*, so an alias is sendable only when
  its domain reports ``verified`` in the Resend account *and* the alias row
  is enabled locally.
* Every send attempt (success or failure) is persisted as an
  :class:`EmailCenterMessage` audit record.
"""

from __future__ import annotations
