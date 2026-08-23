import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.acquisition.models import AcquisitionFirstTouch
from app.modules.acquisition.schemas import (
    SEARCH_ENGINE_HOSTS,
    AcquisitionTouchInput,
)


def classify(touch: AcquisitionTouchInput | None) -> str:
    """Derive the channel from an observed touch - deliberately tiny.

    Precedence:
    1. explicit UTMs      -> ``campaign``  (``medium=organic`` tags the
                             exception: that is genuine organic search)
    2. search-engine referrer (no UTMs) -> ``organic_search``
    3. any other named referrer          -> ``referral``
    4. nothing observable                -> ``direct``
    """
    if not touch:
        return "direct"
    host = (touch.referrer_host or "").lower()
    if (touch.medium or "") == "organic":
        return "organic_search"
    if any(
        getattr(touch, field)
        for field in ("source", "campaign", "content", "term", "medium")
    ):
        return "campaign"
    if host in SEARCH_ENGINE_HOSTS:
        return "organic_search"
    if host:
        return "referral"
    return "direct"


class AcquisitionRepository:
    @staticmethod
    async def get_by_user(
        session: AsyncSession, user_id: uuid.UUID
    ) -> AcquisitionFirstTouch | None:
        result = await session.execute(
            select(AcquisitionFirstTouch).where(
                AcquisitionFirstTouch.user_id == user_id
            )
        )
        return result.scalar_one_or_none()


class AcquisitionService:
    def __init__(self, repository: AcquisitionRepository | None = None) -> None:
        self.repository = repository or AcquisitionRepository()

    async def record_signup_attribution(
        self,
        session: AsyncSession,
        user_id: uuid.UUID,
        first: AcquisitionTouchInput | None,
        last: AcquisitionTouchInput | None = None,
    ) -> None:
        """Attach first-touch at account creation. IMMUTABLE by policy.

        * If a row already exists (duplicate signup paths), the original
          ``first_*`` record is never modified; only ``last_*`` refreshes.
        * Raises nothing by contract? No - raises naturally; the CALLER
          (registration) wraps this in try/except because attribution must
          never break signup.
        """
        existing = await self.repository.get_by_user(session, user_id)

        if existing is not None:
            if last is not None:
                existing.last_channel = classify(last)
                existing.last_source = last.source
                existing.last_medium = last.medium
                existing.last_campaign = last.campaign
                existing.last_touch_at = datetime.now(timezone.utc)
                await session.flush()
            return

        effective_first = first or last  # direct signup still records direct
        if effective_first is None:
            return

        row = AcquisitionFirstTouch(
            user_id=user_id,
            channel=classify(effective_first),
            source=effective_first.source,
            medium=effective_first.medium,
            campaign=effective_first.campaign,
            content=effective_first.content,
            term=effective_first.term,
            landing_path=effective_first.landing_path,
            referrer_host=effective_first.referrer_host,
            first_touch_at=datetime.now(timezone.utc),
        )
        if last is not None and last is not effective_first:
            row.last_channel = classify(last)
            row.last_source = last.source
            row.last_medium = last.medium
            row.last_campaign = last.campaign
            row.last_touch_at = datetime.now(timezone.utc)
        session.add(row)
        await session.flush()


acquisition_service = AcquisitionService()
