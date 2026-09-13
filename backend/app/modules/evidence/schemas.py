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
