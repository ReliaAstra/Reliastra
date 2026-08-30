import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import (
    ConflictException,
    ForbiddenException,
    RateLimitExceededException,
    UnauthorizedException,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    verify_password,
)
from app.modules.auth.constants import (
    EMAIL_NOT_VERIFIED_CODE,
    TOKEN_CLAIM_TYPE_REFRESH,
    TOKEN_TYPE_BEARER,
)
from app.modules.auth.otp_service import email_otp_service
from app.modules.auth.repository import AuthRepository
from app.modules.auth.schemas import (
    LoginRequest,
    OrganizationLite,
    RegisterRequest,
    RegisterResponse,
    TokenResponse,
    UserResponseLite,
)
from app.modules.organizations.repository import OrganizationRepository
from app.modules.users.repository import UserRepository

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(
        self,
        auth_repository: AuthRepository = AuthRepository(),
        user_repository: UserRepository = UserRepository(),
        org_repository: OrganizationRepository = OrganizationRepository(),
    ) -> None:
        self.auth_repository = auth_repository
        self.user_repository = user_repository
        self.org_repository = org_repository
        # Serializes refresh per user so concurrent consumers of the SAME
        # refresh token (customer console + partner SPA + admin console) can
        # never both read the pre-rotation state and mint parallel sequences.
        self._refresh_locks: dict[uuid.UUID, asyncio.Lock] = {}
        # family -> (last issued pair, issued_at). Lets a replay inside the
        # grace window return the SAME pair the winner just received instead
        # of rotating again (which would strand the winner one sequence back)
        # or revoking the whole family (which ends every surface's session).
        self._grace_cache: dict[str, tuple[TokenResponse, datetime]] = {}

    def _generate_token_pair(self, user_id: uuid.UUID) -> TokenResponse:
        access_token = create_access_token(subject=str(user_id))
        refresh_token = create_refresh_token(subject=str(user_id))
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type=TOKEN_TYPE_BEARER,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    async def register(
        self, session: AsyncSession, request: RegisterRequest
    ) -> RegisterResponse:
        existing = await self.user_repository.get_by_email(session, request.email)
        if existing:
            raise ConflictException("Email is already registered")

        password_hash = get_password_hash(request.password)
        user = await self.user_repository.create(
            session=session,
            email=request.email,
            password_hash=password_hash,
            full_name=request.full_name,
        )

        org_name = request.org_name or f"{request.full_name}'s Organization"
        slug = f"org-{user.id.hex[:8]}"
        # Ensure slug uniqueness (append suffix if collision)
        existing_slug = await self.org_repository.get_by_slug(session, slug)
        suffix = 2
        while existing_slug:
            slug = f"org-{user.id.hex[:8]}-{suffix}"
            existing_slug = await self.org_repository.get_by_slug(session, slug)
            suffix += 1
        org = await self.org_repository.create(
            session=session,
            name=org_name,
            slug=slug,
            plan="free",
        )
        await self.org_repository.add_member(
            session=session,
            org_id=org.id,
            user_id=user.id,
            role="owner",
        )
        from app.modules.agencies.repository import AgencyRepository

        await AgencyRepository.create_application(
            session,
            org_id=org.id,
            name="Default",
            description="Default application",
        )

        # Process referral if ref_code provided
        if request.ref_code:
            # Bind the commissionable partner referral. Reuses the existing
            # ``ref_code`` identity — one code, one partner, one customer.
            # Attribution must never be able to fail a registration, so any
            # error here is logged and swallowed.
            try:
                from app.modules.partners.service import partner_service

                await partner_service.bind_referral(
                    session=session,
                    referral_code=request.ref_code,
                    new_user_id=user.id,
                    new_org_id=org.id,
                )
            except Exception:
                logger.exception(
                    "Partner referral binding failed during registration for user %s",
                    user.id,
                )

        # Attach first-party acquisition attribution (FIRST TOUCH). Same
        # failure-isolation contract as the referral binding above: a broken
        # attribution layer can never block account creation. The service
        # enforces first-touch immutability internally.
        try:
            from app.modules.acquisition.service import acquisition_service

            attribution = request.acquisition
            await acquisition_service.record_signup_attribution(
                session=session,
                user_id=user.id,
                first=attribution.first if attribution else None,
                last=attribution.last if attribution else None,
            )
        except Exception:
            logger.exception(
                "Acquisition attribution recording failed during registration for user %s",
                user.id,
            )

        # HARD GATE: no tokens are issued at registration. The account exists
        # but is inert until the emailed 6-digit code is submitted to
        # /v1/auth/verify-otp. Issuing the code is best-effort — a dead SMTP
        # server must not roll back a successful signup, and the user can
        # always hit "Resend code".
        try:
            await email_otp_service.issue_code(session, user, enforce_cooldown=False)
        except Exception:
            logger.exception(
                "Failed to issue email verification code during registration "
                "for user %s",
                user.id,
            )

        return RegisterResponse(
            user=UserResponseLite(
                id=user.id,
                email=user.email,
                full_name=user.full_name,
                is_active=user.is_active,
                is_email_verified=user.is_email_verified,
            ),
            organization=OrganizationLite(
                id=org.id,
                name=org.name,
                slug=org.slug,
                plan=org.plan,
            ),
            tokens=None,
            verification_required=True,
        )

    async def issue_session(
        self, session: AsyncSession, user_id: uuid.UUID
    ) -> TokenResponse:
        """Mint and persist a token pair for *user_id*."""
        tokens = self._generate_token_pair(user_id)
        expires_at = datetime.now(timezone.utc) + timedelta(
            days=settings.REFRESH_TOKEN_EXPIRE_DAYS
        )
        await self.auth_repository.create_refresh_token(
            session, user_id, tokens.refresh_token, expires_at
        )
        return tokens
    async def login(
        self, session: AsyncSession, request: LoginRequest
    ) -> TokenResponse:
        user = await self.user_repository.get_by_email(session, request.email)
        if not user or not verify_password(request.password, user.password_hash):
            raise UnauthorizedException("Invalid email or password")
        if not user.is_active:
            raise UnauthorizedException("User account is disabled")

        # HARD GATE: correct credentials are not enough — the address must be
        # proven. Runs *after* the password check so the response cannot be
        # used to enumerate which addresses are registered.
        if not user.is_email_verified:
            # Send a fresh code so the client can go straight to the code
            # screen. Cooldown breaches are swallowed: the user still has a
            # live code, and the 403 below tells them what to do with it.
            try:
                await email_otp_service.issue_code(session, user)
            except RateLimitExceededException:
                logger.info(
                    "Verification code resend suppressed by cooldown for user %s",
                    user.id,
                )
            except Exception:
                logger.exception(
                    "Failed to reissue verification code at login for user %s",
                    user.id,
                )
            raise ForbiddenException(
                "Verify your email address to sign in. We've sent a 6-digit "
                "code to your inbox.",
                details={"code": EMAIL_NOT_VERIFIED_CODE, "email": user.email},
            )

        tokens = self._generate_token_pair(user.id)
        expires_at = datetime.now(timezone.utc) + timedelta(
            days=settings.REFRESH_TOKEN_EXPIRE_DAYS
        )
        await self.auth_repository.create_refresh_token(
            session, user.id, tokens.refresh_token, expires_at
        )
        return tokens

    async def refresh(
        self, session: AsyncSession, refresh_token_str: str
    ) -> TokenResponse:
        payload = decode_token(refresh_token_str)
        if payload.get("type") != TOKEN_CLAIM_TYPE_REFRESH:
            raise UnauthorizedException("Invalid token type")

        user_id_str = payload.get("sub")
        if not user_id_str:
            raise UnauthorizedException("Invalid token payload")

        user_id = uuid.UUID(user_id_str)
        # One lock per user: all three surfaces (customer, partner, admin)
        # share this single JWT session, so the same refresh token can be
        # spent by parallel callers in the same tick. Without serialization
        # two requests can both observe the pre-rotation state and mint
        # parallel sequences — the reuse detector then kills the family and
        # signs everyone out with a valid session.
        lock = self._refresh_locks.setdefault(user_id, asyncio.Lock())
        async with lock:
            return await self._refresh_locked(
                session, refresh_token_str, user_id
            )

    async def _refresh_locked(
        self, session: AsyncSession, refresh_token_str: str, user_id: uuid.UUID
    ) -> TokenResponse:
        stored_rt = await self.auth_repository.get_refresh_token(
            session, refresh_token_str
        )
        if not stored_rt:
            raise UnauthorizedException("Refresh token not found or invalid")

        # FIX 28 (corrected): reuse detection must run BEFORE the revoked
        # short-circuit. Rotation marks the previous token ``is_revoked``,
        # so a replayed rotated token used to die on that early exit without
        # ever reaching the family-revocation branch — the exact theft
        # signal this exists for. Now ANY already-revoked token, or any
        # token whose sequence is below the family's latest, is treated as
        # replay.
        family = stored_rt.token_family if stored_rt.token_family else uuid.uuid4()
        sequence = stored_rt.token_sequence if stored_rt.token_sequence else 1
        latest_sequence = await self.auth_repository.get_latest_sequence(
            session, family
        )
        now = datetime.now(timezone.utc)
        grace = timedelta(seconds=settings.REFRESH_REUSE_GRACE_SECONDS)

        if stored_rt.is_revoked or latest_sequence > sequence:
            # Benign-replay grace window: a parallel surface may legally
            # spend the same token milliseconds after the winner rotated it.
            # Inside the window the replay gets the SAME pair the winner
            # received (or, across processes, a fresh rotation) instead of
            # a family-wide revocation.
            cached = self._grace_cache.get(str(family))
            if cached is not None and now - cached[1] <= grace:
                logger.info(
                    "Refresh token reuse for family %s within grace window — "
                    "returning the last issued pair",
                    family,
                )
                return cached[0]

            latest_rt = await self.auth_repository.get_latest_refresh_token(
                session, family
            )
            recent_rotation = (
                latest_rt is not None
                and latest_rt.created_at is not None
                and now - latest_rt.created_at <= grace
            )
            if not recent_rotation:
                await self.auth_repository.revoke_family(session, family)
                # Persist BEFORE raising: get_db() rolls back on exception,
                # so an uncommitted revocation would make this 401 a lie —
                # the family stays live and the theft signal is lost.
                await session.commit()
                logger.warning(
                    "Refresh token reuse detected for family %s — family revoked",
                    family,
                )
                raise UnauthorizedException(
                    "Refresh token reuse detected; session has been revoked"
                )
            logger.info(
                "Refresh token reuse for family %s within grace window "
                "(recent rotation) — rotating without family revocation",
                family,
            )

        user = await self.user_repository.get_by_id(session, user_id)
        if not user or not user.is_active:
            raise UnauthorizedException("User account not found or disabled")
        # A session can only be extended while the gate is still satisfied —
        # e.g. an admin un-verifying an account kills its refresh chain.
        if not user.is_email_verified:
            await self.auth_repository.revoke_family(session, family)
            # Same durability rule as the reuse branch: get_db() rolls back
            # on exception, so commit the gate revocation before raising.
            await session.commit()
            raise ForbiddenException(
                "Email address is not verified.",
                details={"code": EMAIL_NOT_VERIFIED_CODE},
            )

        tokens = self._generate_token_pair(user.id)
        expires_at = datetime.now(timezone.utc) + timedelta(
            days=settings.REFRESH_TOKEN_EXPIRE_DAYS
        )
        await self.auth_repository.create_refresh_token(
            session,
            user.id,
            tokens.refresh_token,
            expires_at,
            token_family=family,
            token_sequence=max(sequence, latest_sequence) + 1,
        )
        if stored_rt:
            await self.auth_repository.revoke_refresh_token(session, refresh_token_str)
        self._grace_cache[str(family)] = (tokens, datetime.now(timezone.utc))
        self._prune_grace_cache(now)
        return tokens

    def _prune_grace_cache(self, now: datetime) -> None:
        """Bound the in-memory grace cache to expired entries + a hard cap."""
        grace = timedelta(seconds=settings.REFRESH_REUSE_GRACE_SECONDS)
        stale = [k for k, (_, at) in self._grace_cache.items() if now - at > grace]
        for key in stale:
            self._grace_cache.pop(key, None)
        if len(self._grace_cache) > 2048:
            for key in list(self._grace_cache)[: len(self._grace_cache) - 2048]:
                self._grace_cache.pop(key, None)

    async def logout(self, session: AsyncSession, refresh_token_str: str) -> None:
        await self.auth_repository.revoke_refresh_token(session, refresh_token_str)


auth_service = AuthService()
