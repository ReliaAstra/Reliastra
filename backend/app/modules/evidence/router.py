import uuid
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_current_org, require_member
from app.db.session import get_db
from app.modules.evidence.schemas import (
    EvidenceReportDownloadResponse,
    EvidenceReportResponse,
)
from app.modules.evidence.service import EvidenceService, evidence_service
from app.modules.organizations.models import Organization

router = APIRouter(prefix="/v1/evidence", tags=["Evidence"])


def get_evid_service() -> EvidenceService:
    return evidence_service


@router.get("", response_model=list[EvidenceReportResponse])
async def list_evidence_reports(
    limit: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: EvidenceService = Depends(get_evid_service),
) -> list[EvidenceReportResponse]:
    return await service.list_reports(db, current_org.id, limit=limit)


_ARTIFACT_MISSING_RESPONSE = {
    409: {
        "description": (
            "The stored artifact behind this record is missing from object "
            "storage. Regenerate the report to restore it."
        )
    }
}


@router.get(
    "/{report_id}",
    response_model=EvidenceReportDownloadResponse,
    responses=_ARTIFACT_MISSING_RESPONSE,
)
async def get_evidence_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: EvidenceService = Depends(get_evid_service),
) -> EvidenceReportDownloadResponse:
    return await service.get_report_download(db, current_org.id, report_id)


@router.get(
    "/{report_id}/artifact",
    response_class=Response,
    responses={
        200: {
            "content": {"application/pdf": {}},
            "description": "The rendered evidence artifact, streamed to its owner.",
        },
        **_ARTIFACT_MISSING_RESPONSE,
    },
)
async def download_evidence_artifact(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: EvidenceService = Depends(get_evid_service),
) -> Response:
    """Stream the artifact itself, to the account that owns it.

    ``GET /v1/evidence/{report_id}`` answers with metadata and a presigned URL,
    which is the right shape for a browser: the bytes come from object storage
    without passing through this service. It is the wrong shape for a client
    that is not a browser - a presigned URL is a third party's host, it expires,
    and the machine interface should not require a caller to follow a redirect
    into somebody else's infrastructure to obtain a file this API already
    owns. So the bytes are served here too, under the same authorization as the
    record, and the CLI uses this route.

    Distinct from ``GET /v1/evidence/{report_token}/download``, which is the
    public, token-addressed, owner-consented download for the evidence gate.
    'artifact' versus 'download' keeps the two from being confused with each
    other in a route table or a log.
    """
    payload, filename, checksum = await service.get_report_artifact(
        db, current_org.id, report_id
    )
    return Response(
        content=payload,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(payload)),
            # The record's checksum covers exactly these bytes, so it is the
            # honest entity tag: it changes if and only if the bytes change.
            # A client that already holds the artifact can skip the download
            # with If-None-Match, and one that does not can check what it got.
            "ETag": f'"{checksum}"',
        },
    )


@router.post(
    "/{report_id}/regenerate",
    response_model=EvidenceReportResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_member)],
)
async def regenerate_evidence_report(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_org: Organization = Depends(get_current_org),
    service: EvidenceService = Depends(get_evid_service),
) -> EvidenceReportResponse:
    return await service.regenerate_report(db, current_org.id, report_id)
