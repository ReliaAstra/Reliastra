"""Ed25519 provenance for evidence artifacts.

The point of a signature is that a third party can check it without trusting
RELIASTRA, so these tests assert the round trip *externally*: sign with the
deployment key, read the public half back out of the JWK endpoint's payload,
verify there - and assert the properties that make the claim honest when the key
is missing (unsigned must be loud, never absent).
"""

import base64
import hashlib

import pytest

from app.config import settings
from app.modules.evidence import signing

PAYLOAD = b'{"availability_pct":86.1538,"incident":"01J8"}'


def fresh_key():
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    key = Ed25519PrivateKey.generate()
    return key, base64.urlsafe_b64encode(key.private_bytes_raw()).decode("ascii").rstrip("=")


@pytest.fixture
def signing_key(monkeypatch):
    key, encoded = fresh_key()
    monkeypatch.setattr(
        settings, "EVIDENCE_SIGNING_PRIVATE_KEY", encoded, raising=False
    )
    monkeypatch.setattr(settings, "EVIDENCE_SIGNING_PRIVATE_KEY_FILE", "", raising=False)
    monkeypatch.setattr(settings, "EVIDENCE_KEY_ID", "", raising=False)
    return key, encoded


class TestUnsignedDeployment:
    def test_no_key_means_unsigned_not_broken(self, monkeypatch):
        monkeypatch.setattr(settings, "EVIDENCE_SIGNING_PRIVATE_KEY", "", raising=False)
        monkeypatch.setattr(settings, "EVIDENCE_SIGNING_PRIVATE_KEY_FILE", "", raising=False)
        assert signing.sign_payload(PAYLOAD) is None
        state = signing.signing_state()
        assert state.configured is False
        assert state.available is False
        assert signing.public_jwk(state) is None

    def test_a_malformed_key_degrades_to_unsigned(self, monkeypatch):
        # A bad key is a deployment error, not a reason to stop issuing
        # artifacts - but it must never produce a document that *looks* signed.
        monkeypatch.setattr(
            settings, "EVIDENCE_SIGNING_PRIVATE_KEY", "not-a-key-at-all", raising=False
        )
        assert signing.sign_payload(PAYLOAD) is None
        assert signing.public_jwk() is None


class TestSignedDeployment:
    def test_signature_verifies_against_the_published_jwk(self, signing_key):
        key, _ = signing_key
        signed = signing.sign_payload(PAYLOAD)
        assert signed is not None
        assert signed["alg"] == "Ed25519"
        assert signed["encoding"] == "base64url"
        jwk = signing.public_jwk()
        assert jwk is not None and jwk["crv"] == "Ed25519"
        assert jwk["x"] == base64.urlsafe_b64encode(
            key.public_key().public_bytes_raw()
        ).decode("ascii").rstrip("=")
        assert signing.verify_payload(PAYLOAD, signed["value"], jwk["x"]) is True

    def test_a_single_changed_byte_fails_verification(self, signing_key):
        signed = signing.sign_payload(PAYLOAD)
        assert signed is not None
        jwk = signing.public_jwk()
        assert jwk is not None
        assert (
            signing.verify_payload(PAYLOAD + b" ", signed["value"], jwk["x"]) is False
        )

    def test_malformed_inputs_are_a_failed_check_not_an_exception(self, signing_key):
        jwk = signing.public_jwk()
        assert jwk is not None
        assert signing.verify_payload(b"", "", jwk["x"]) is False
        assert signing.verify_payload(PAYLOAD, "!!!", jwk["x"]) is False
        assert signing.verify_payload(PAYLOAD, (jwk or {})["x"], "junk") is False

    def test_key_id_is_derived_from_the_public_key(self, signing_key):
        key, _ = signing_key
        expected = hashlib.sha256(key.public_key().public_bytes_raw()).hexdigest()[:16]
        state = signing.signing_state()
        assert state.key_id == expected
        assert signing.sign_payload(PAYLOAD)["key_id"] == expected

    def test_an_explicit_key_id_wins_so_citations_survive_rotation(self, signing_key, monkeypatch):
        monkeypatch.setattr(
            settings, "EVIDENCE_KEY_ID", "reliastra-2026-a", raising=False
        )
        assert signing.signing_state().key_id == "reliastra-2026-a"
        assert signing.sign_payload(PAYLOAD)["key_id"] == "reliastra-2026-a"

    def test_pem_input_is_accepted(self, monkeypatch):
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        from cryptography.hazmat.primitives.serialization import (
            Encoding,
            PrivateFormat,
            NoEncryption,
        )

        key = Ed25519PrivateKey.generate()
        pem = key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()).decode()
        monkeypatch.setattr(settings, "EVIDENCE_SIGNING_PRIVATE_KEY", pem, raising=False)
        signed = signing.sign_payload(PAYLOAD)
        assert signed is not None
        jwk = signing.public_jwk()
        assert jwk is not None
        assert signing.verify_payload(PAYLOAD, signed["value"], jwk["x"])

    def test_a_non_ed25519_pem_is_refused_rather_than_mislabelled(self, monkeypatch, tmp_path):
        # The document prints the algorithm. Accepting an RSA key and labelling
        # the artifact "Ed25519" would be a worse failure than refusing to sign.
        from cryptography.hazmat.primitives.asymmetric.rsa import generate_private_key
        from cryptography.hazmat.primitives.serialization import (
            Encoding,
            PrivateFormat,
            NoEncryption,
        )

        pem = (
            generate_private_key(public_exponent=65537, key_size=2048)
            .private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
            .decode()
        )
        monkeypatch.setattr(settings, "EVIDENCE_SIGNING_PRIVATE_KEY", pem, raising=False)
        assert signing.sign_payload(PAYLOAD) is None

    def test_key_material_can_be_mounted_from_a_file(self, monkeypatch, tmp_path):
        _key, encoded = fresh_key()
        path = tmp_path / "ed25519.key"
        path.write_text(encoded)
        monkeypatch.setattr(settings, "EVIDENCE_SIGNING_PRIVATE_KEY", "", raising=False)
        monkeypatch.setattr(
            settings, "EVIDENCE_SIGNING_PRIVATE_KEY_FILE", str(path), raising=False
        )
        signed = signing.sign_payload(PAYLOAD)
        assert signed is not None
        jwk = signing.public_jwk()
        assert jwk is not None
        assert signing.verify_payload(PAYLOAD, signed["value"], jwk["x"])

    def test_the_private_half_is_never_exposed_by_any_public_helper(self, signing_key):
        key, encoded = signing_key
        state = signing.signing_state()
        jwk = signing.public_jwk(state)
        assert jwk is not None
        blob = repr(state) + repr(jwk)
        assert encoded not in blob
        assert key.private_bytes_raw().hex() not in blob


class TestVerificationEndpoint:
    @pytest.mark.asyncio
    async def test_keys_endpoint_reports_unsigned_deployments_honestly(self, monkeypatch):
        from app.modules.verification.router import verification_keys

        monkeypatch.setattr(settings, "EVIDENCE_SIGNING_PRIVATE_KEY", "", raising=False)
        monkeypatch.setattr(
            settings, "EVIDENCE_SIGNING_PRIVATE_KEY_FILE", "", raising=False
        )
        payload = await verification_keys()
        assert payload["configured"] is False
        assert payload["keys"] == []
        assert "unsigned" in payload["note"]

    @pytest.mark.asyncio
    async def test_keys_endpoint_publishes_one_jwk_when_configured(self, signing_key):
        from app.modules.verification.router import verification_keys

        payload = await verification_keys()
        assert payload["configured"] is True
        assert payload["algorithm"] == "Ed25519"
        assert len(payload["keys"]) == 1
        assert payload["keys"][0]["use"] == "sig"
