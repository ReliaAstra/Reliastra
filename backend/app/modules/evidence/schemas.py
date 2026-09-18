import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class EvidenceReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    incident_id: uuid.UUID
    file_size_bytes: int
    checksum: str
    generated_at: datetime
    expires_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    #: Which renderer produced the bytes whose checksum is above. Optional
    #: because artifacts issued before provenance was recorded carry none, and a
    #: missing renderer is information a support agent needs, not a validation
    #: error worth failing a response over.
    renderer: str | None = None
    renderer_version: str | None = None


class EvidenceReportDownloadResponse(EvidenceReportResponse):
    download_url: str

    # ── The path from an artifact to its own verification ──────────────────
    # These fields all describe the document that the checksum above belongs
    # to, and every one of them is already printed inside that document: the
    # verification id is in the footer and in the QR code, and the hashes are
    # on the authenticity page. They were simply not readable back through the
    # API, which meant the one claim the artifact makes that a third party can
    # check was reachable only by opening the PDF and typing a URL by hand.
    #
    # Optional on purpose. An artifact issued before its snapshot was linked
    # has no verification record to point at, and an absent value here says
    # that rather than inventing one.
    verification_id: str | None = None
    #: Absolute URL of the public verification page, for pasting into a
    #: ticket, a Slack thread or an email. Never impersonated by the client:
    #: this is the deployment's own configured origin.
    verification_url: str | None = None
    #: SHA-256 over the canonical payload - the facts of the incident. It
    #: differs from `checksum`, which covers the rendered document.
    data_hash: str | None = None
    methodology_version: str | None = None
    #: Whether this artifact carries an Ed25519 signature over the payload.
    #: `False` is a fact about the deployment, not an error.
    signed: bool = False
    signature_alg: str | None = None
