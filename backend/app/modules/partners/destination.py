"""Payout-destination handling: encryption at rest, masking, and display.

A partner's payout destination is the single most attackable field in the
program — whoever controls it receives the money. Three rules follow:

1. **Encrypted at rest.** ``wallet_address`` and ``bank_details`` are stored
   Fernet-encrypted (key derived from ``SECRET_KEY``), so a database dump is
   not a list of payable wallets. Rows written before this change are still
   plaintext and are read transparently, then re-encrypted on the next save.
2. **Masked by default everywhere.** Partner-facing responses and the admin
   list/queue only ever carry a masked form. The full value is available to a
   system admin through one explicit, audited endpoint — the moment before
   they actually send money.
3. **Changes are visible.** Saving a destination re-authenticates the partner,
   notifies them out-of-band, and starts a cool-down before the new
   destination can be paid, so a silent swap cannot be cashed out immediately.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.core.security import get_fernet

logger = logging.getLogger(__name__)

#: Marker identifying a ciphertext written by this module. Values without it
#: are legacy plaintext and are returned as-is.
ENCRYPTED_PREFIX = "enc:v1:"

#: Key used to hold the ciphertext inside the ``bank_details`` JSONB column,
#: so the column type does not have to change.
BANK_CIPHERTEXT_KEY = "__enc__"


# ── Encryption ────────────────────────────────────────────────────────────


def encrypt_text(value: str | None) -> str | None:
    if value is None:
        return None
    token = get_fernet().encrypt(value.encode("utf-8")).decode("utf-8")
    return f"{ENCRYPTED_PREFIX}{token}"


def decrypt_text(stored: str | None) -> str | None:
    """Decrypt a stored value, tolerating legacy plaintext rows."""
    if stored is None:
        return None
    if not stored.startswith(ENCRYPTED_PREFIX):
        return stored
    token = stored[len(ENCRYPTED_PREFIX) :]
    try:
        return get_fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except Exception as exc:  # pragma: no cover - rotated SECRET_KEY
        logger.warning("Failed to decrypt payout wallet address: %s", exc)
        return None


def encrypt_bank_details(details: dict[str, Any] | None) -> dict[str, Any] | None:
    if details is None:
        return None
    payload = json.dumps(details)
    token = get_fernet().encrypt(payload.encode("utf-8")).decode("utf-8")
    return {BANK_CIPHERTEXT_KEY: f"{ENCRYPTED_PREFIX}{token}"}


def decrypt_bank_details(stored: dict[str, Any] | None) -> dict[str, Any] | None:
    """Decrypt bank details, tolerating legacy plaintext JSONB rows."""
    if not stored:
        return None
    token = stored.get(BANK_CIPHERTEXT_KEY) if isinstance(stored, dict) else None
    if not token:
        # Legacy row: the JSONB object is the details themselves.
        return dict(stored)
    if not token.startswith(ENCRYPTED_PREFIX):
        return None
    try:
        raw = get_fernet().decrypt(
            token[len(ENCRYPTED_PREFIX) :].encode("utf-8")
        )
        return json.loads(raw.decode("utf-8"))
    except Exception as exc:  # pragma: no cover - rotated SECRET_KEY
        logger.warning("Failed to decrypt payout bank details: %s", exc)
        return None


# ── Masking ───────────────────────────────────────────────────────────────


def mask_wallet(address: str | None) -> str | None:
    """``0x71C7…9F2a`` — enough to recognise, not enough to reuse."""
    if not address:
        return None
    if len(address) <= 10:
        return f"{address[:2]}…{address[-2:]}" if len(address) > 4 else "…"
    return f"{address[:6]}…{address[-4:]}"


def mask_account_number(number: str | None) -> str | None:
    if not number:
        return None
    tail = str(number)[-4:]
    return f"••••{tail}"


def mask_bank_details(details: dict[str, Any] | None) -> dict[str, Any] | None:
    """Return bank details safe to render: only the account tail survives."""
    if not details:
        return None
    masked = {
        key: value
        for key, value in details.items()
        if key in {"account_name", "bank_name"}
    }
    if details.get("account_number"):
        masked["account_number"] = mask_account_number(details["account_number"])
    if details.get("routing_number"):
        masked["routing_number"] = mask_account_number(details["routing_number"])
    if details.get("swift_bic"):
        masked["swift_bic"] = details["swift_bic"]
    return masked


# ── Display ───────────────────────────────────────────────────────────────


_METHOD_LABELS = {"crypto_usdc": "USDC", "crypto_usdt": "USDT"}


def describe_destination(partner, *, reveal: bool = False) -> str:
    """One-line destination summary.

    Masked by default — used in notifications, emails and the admin payout
    queue. ``reveal=True`` produces the payable value and must only be used
    behind an audited admin action.
    """
    method = getattr(partner, "payout_method", None)
    if not method:
        return "your configured payout destination"

    if method == "bank":
        details = decrypt_bank_details(getattr(partner, "bank_details", None)) or {}
        bank = details.get("bank_name") or "your bank account"
        account = details.get("account_number")
        if not account:
            return bank
        return f"{bank} {account if reveal else mask_account_number(account)}"

    label = _METHOD_LABELS.get(method, method)
    address = decrypt_text(getattr(partner, "wallet_address", None))
    parts = [label]
    network = getattr(partner, "payout_network", None)
    if network:
        parts.append(f"on {network}")
    if address:
        parts.append(f"({address if reveal else mask_wallet(address)})")
    return " ".join(parts)


def destination_view(partner, *, reveal: bool = False) -> dict[str, Any]:
    """Structured destination for API responses, masked unless revealed."""
    method = getattr(partner, "payout_method", None)
    address = decrypt_text(getattr(partner, "wallet_address", None))
    details = decrypt_bank_details(getattr(partner, "bank_details", None))
    return {
        "payout_method": method,
        "payout_network": getattr(partner, "payout_network", None),
        "wallet_address": address if reveal else mask_wallet(address),
        "bank_details": details if reveal else mask_bank_details(details),
        "payout_details_updated_at": getattr(
            partner, "payout_details_updated_at", None
        ),
    }
