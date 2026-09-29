"""Ed25519 signatures over the canonical evidence payload.

**Why this exists.** A SHA-256 of a payload proves the payload is internally
consistent. It proves nothing about *who* produced it: anybody can hash their
own fabricated facts, and the hash in the footer will happily agree with them.
Until an artifact is signed by a key whose public half is published
independently of the artifact, "cryptographically verifiable" describes a
checksum, not an authenticity claim. This module closes that gap.

**The contract.**

* The signature covers the *canonical payload bytes* (``canonical_json_bytes``
  of the evidence document), never the PDF. The PDF is an arrangement of the
  facts; the payload is the facts. Both hashes stay in the document, and the
  signature is described as covering the payload so a verifier never points it
  at the wrong bytes.
* Signing is **optional and disclosed**. ``EVIDENCE_SIGNING_PRIVATE_KEY``
  unset is a legitimate deployment state during rollout; an unsigned report
  prints that it is unsigned, and the verification endpoint reports
  ``signed: false``. A document may never claim a signature it does not carry.
* The key is an Ed25519 seed (32 bytes, base64url/base64/hex) or a PEM private
  key, from env or a mounted file. Nothing here writes to disk, and no endpoint
  returns the private half - only the public JWK and a key id.
* ``key_id`` is derived from the public key, so two deployments sharing a key
  agree on the identifier without configuring it, and a rotation mints a new
  one automatically. ``EVIDENCE_KEY_ID`` overrides it when a stable citation
  handle has to survive a rotation.
* **Rotation must never reuse an id.** A verifier that pins ``kid -> key`` sees
  a new key published under an old id as the signature of a key-substitution
  attack. Every published key therefore also carries ``key_fingerprint``, a
  digest of the key material itself, so a substitution is detectable even when
  the id is reused by mistake.
* **A keyring keeps old records verifiable.** ``EVIDENCE_SIGNING_KEYRING``
  holds superseded public keys as ``{"<kid>": "<base64url raw public key>"}``.
  Without it the first rotation silently makes every previously issued record
  unverifiable by anyone, which is the one outcome an evidence product cannot
  afford.

Verification is deliberately boring and independently reproducible: the
endpoint hands out the public JWK and the recipient verifies with one command.
A proof that only works inside our own stack is not a proof.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import logging
from dataclasses import dataclass
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

ALGORITHM = "Ed25519"
SIGNATURE_ENCODING = "base64url"


@dataclass(frozen=True)
class SigningState:
    """What the deployment can currently do, and how it says so."""

    configured: bool
    algorithm: str = ALGORITHM
    key_id: str | None = None
    public_key: str | None = None  # base64url of the raw 32-byte Ed25519 key
    error: str | None = None

    @property
    def available(self) -> bool:
        return self.configured and self.public_key is not None

    @property
    def fingerprint(self) -> str | None:
        """Digest of the key material, independent of any configured id.

        Published beside ``key_id`` so a verifier can tell "the same key, new
        label" from "a different key wearing a familiar label".
        """
        if not self.available:
            return None
        return _fingerprint(_b64url_decode(self.public_key or ""))

    def jwk(self) -> dict[str, Any]:
        return {
            "kty": "OKP",
            "crv": "Ed25519",
            "x": self.public_key,
            "kid": self.key_id,
            "key_fingerprint": self.fingerprint,
            "alg": self.algorithm,
            "use": "sig",
        }


def _fingerprint(raw_public: bytes) -> str:
    """``sha256:<hex>`` over the raw public key. Stable, id-independent."""
    return f"sha256:{hashlib.sha256(raw_public).hexdigest()}"



def _b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _key_material() -> bytes | None:
    """Raw key material from env or key file: a 32-byte seed, or PEM bytes."""
    raw = str(getattr(settings, "EVIDENCE_SIGNING_PRIVATE_KEY", "") or "").strip()
    if not raw:
        path = str(getattr(settings, "EVIDENCE_SIGNING_PRIVATE_KEY_FILE", "") or "")
        path = path.strip()
        if path:
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    raw = handle.read().strip()
            except OSError as exc:  # pragma: no cover - deployment problem
                logger.warning("evidence signing: key file unreadable: %s", exc)
                return None
    if not raw:
        return None
    if "-----BEGIN" in raw:
        return raw.encode("utf-8")
    try:
        seed = _b64url_decode(raw)
    except (binascii.Error, ValueError):
        try:
            seed = bytes.fromhex(raw)
        except ValueError:
            seed = b""
    if len(seed) == 32:
        return seed
    logger.warning(
        "evidence signing: EVIDENCE_SIGNING_PRIVATE_KEY is neither a PEM block "
        "nor a 32-byte seed; artifacts will be generated UNSIGNED"
    )
    return None


def _private_key() -> Any | None:
    material = _key_material()
    if material is None:
        return None
    try:
        if len(material) == 32:
            from cryptography.hazmat.primitives.asymmetric.ed25519 import (
                Ed25519PrivateKey,
            )

            return Ed25519PrivateKey.from_private_bytes(material)
        from cryptography.hazmat.primitives.serialization import (
            load_pem_private_key,
        )

        key = load_pem_private_key(material, password=None)
        # A PEM file may hold any key type; only Ed25519 is acceptable here,
        # because the document prints the algorithm and a mismatch between the
        # stated and the real one would be worse than being unsigned.
        if type(key).__name__ != "Ed25519PrivateKey":
            raise ValueError(f"unsupported key type {type(key).__name__}")
        return key
    except Exception as exc:  # pragma: no cover - malformed key material
        logger.warning("evidence signing: key could not be loaded: %s", exc)
        return None


def _raw_public(key: Any) -> bytes:
    from cryptography.hazmat.primitives.serialization import (
        Encoding,
        PublicFormat,
    )

    return key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)


def _describe(key: object) -> SigningState:
    """Derive the published identity of a loaded key. One key load, one digest."""
    raw = _raw_public(key)
    configured_id = str(getattr(settings, "EVIDENCE_KEY_ID", "") or "").strip()
    return SigningState(
        configured=True,
        key_id=configured_id or hashlib.sha256(raw).hexdigest()[:16],
        public_key=base64.urlsafe_b64encode(raw).decode("ascii").rstrip("="),
    )


def signing_state() -> SigningState:
    """Public description of the signing configuration. Never the key itself."""
    key = _private_key()
    if key is None:
        return SigningState(configured=False)
    try:
        return _describe(key)
    except Exception as exc:  # pragma: no cover - defensive
        return SigningState(configured=False, error=f"{type(exc).__name__}: {exc}")


def keyring() -> dict[str, str]:
    """Superseded public keys, ``{key_id: base64url raw public key}``.

    Configured as ``EVIDENCE_SIGNING_KEYRING`` holding a JSON object, or a JSON
    array of ``{"kid": ..., "x": ...}`` entries. A record signed before a
    rotation stays verifiable as long as its key is listed here.

    Malformed configuration degrades to an empty keyring plus a loud warning
    rather than raising: the verification endpoint must still answer, and
    answering "this key is unknown" is a correct, useful answer.
    """
    raw = str(getattr(settings, "EVIDENCE_SIGNING_KEYRING", "") or "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError) as exc:
        logger.warning("evidence signing: EVIDENCE_SIGNING_KEYRING is not valid JSON: %s", exc)
        return {}

    entries: dict[str, str] = {}
    if isinstance(parsed, dict):
        pairs = parsed.items()
    elif isinstance(parsed, list):
        pairs = (
            (str(item.get("kid") or ""), str(item.get("x") or ""))
            for item in parsed
            if isinstance(item, dict)
        )
    else:
        logger.warning("evidence signing: EVIDENCE_SIGNING_KEYRING must be an object or array")
        return {}

    for key_id, public in pairs:
        key_id = str(key_id).strip()
        public = str(public).strip()
        if not key_id or not public:
            continue
        try:
            raw_key = _b64url_decode(public)
        except (binascii.Error, ValueError):
            logger.warning("evidence signing: keyring entry %r is not base64url", key_id)
            continue
        if len(raw_key) != 32:
            logger.warning("evidence signing: keyring entry %r is not a 32-byte Ed25519 key", key_id)
            continue
        entries[key_id] = public
    return entries


def resolve_public_keys(key_id: str | None) -> list[str]:
    """Every public key published under ``key_id``, current key first.

    A list rather than a single value because a deployment that reuses a
    ``kid`` across a rotation is indistinguishable, from the outside, from one
    that does not - and the two must not behave differently in the direction
    that loses evidence. A verifier tries each candidate and accepts the record
    if any published key for that id validates it, which is sound: every
    candidate was published by us for exactly that identifier.

    An empty list means no key is published under that id, which is a
    verification failure and never a pass.
    """
    candidates: list[str] = []
    state = signing_state()
    if state.available and key_id and state.key_id == key_id:
        candidates.append(state.public_key or "")
    if key_id:
        historical = keyring().get(key_id)
        if historical and historical not in candidates:
            candidates.append(historical)
    return [c for c in candidates if c]


def resolve_public_key(key_id: str | None) -> str | None:
    """The single key published under ``key_id``, for callers that want one.

    Prefer :func:`resolve_public_keys` when the answer decides whether a record
    is genuine.
    """
    candidates = resolve_public_keys(key_id)
    return candidates[0] if candidates else None


def verify_signature_over(
    payload_bytes: bytes, signature_b64url: str, key_id: str | None
) -> bool:
    """Verify a signature against every public key published for ``key_id``."""
    for public in resolve_public_keys(key_id):
        if verify_payload(payload_bytes, signature_b64url, public):
            return True
    return False



def sign_payload(payload_bytes: bytes) -> dict[str, str] | None:
    """Sign the canonical payload. ``None`` means "this deployment is unsigned"."""
    key = _private_key()
    if key is None:
        return None
    try:
        state = _describe(key)
        signature = key.sign(payload_bytes)
    except Exception as exc:  # pragma: no cover - signing should not fail
        logger.warning("evidence signing: sign() failed: %s", exc)
        return None
    return {
        "alg": ALGORITHM,
        "encoding": SIGNATURE_ENCODING,
        "key_id": state.key_id or "",
        "value": base64.urlsafe_b64encode(signature).decode("ascii").rstrip("="),
    }


def verify_payload(
    payload_bytes: bytes, signature_b64url: str, public_key_b64url: str
) -> bool:
    """Verify against a raw Ed25519 public key (both base64url).

    Used by the verification endpoint's self-check and by tests. Kept strict:
    malformed input is a failed verification, never an exception, because the
    caller is answering "is this document genuine?" for someone who cannot see
    our logs.
    """
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import (
            Ed25519PublicKey,
        )

        public = Ed25519PublicKey.from_public_bytes(_b64url_decode(public_key_b64url))
        public.verify(_b64url_decode(signature_b64url), payload_bytes)
        return True
    except Exception:
        return False


def public_jwk(state: SigningState | None = None) -> dict[str, Any] | None:
    """The JWK shape a `jwks.json` consumer expects, or ``None`` when unsigned."""
    state = state or signing_state()
    if not state.available:
        return None
    return state.jwk()


def public_jwks() -> list[dict[str, Any]]:
    """Every public key this deployment has ever signed under.

    The current key plus the keyring. Entries are keyed by
    ``(kid, key_fingerprint)`` rather than ``kid`` alone, so a deployment that
    reuses an id across a rotation publishes both keys instead of silently
    dropping the superseded one - which is exactly the substitution a pinned
    verifier is entitled to be suspicious of.
    """
    entries: dict[tuple[str, str], dict[str, Any]] = {}
    for key_id, public in keyring().items():
        try:
            raw = _b64url_decode(public)
        except (binascii.Error, ValueError):  # pragma: no cover - filtered in keyring()
            continue
        entries[(key_id, _fingerprint(raw))] = {
            "kty": "OKP",
            "crv": "Ed25519",
            "x": public,
            "kid": key_id,
            "key_fingerprint": _fingerprint(raw),
            "alg": ALGORITHM,
            "use": "sig",
            "status": "historical",
        }
    state = signing_state()
    if state.available:
        jwk = state.jwk()
        jwk["status"] = "current"
        entries[(state.key_id or "", state.fingerprint or "")] = jwk
    return list(entries.values())
