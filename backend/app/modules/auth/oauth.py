"""GitHub OAuth sign-in / sign-up.

Flow (authorization-code, server-side secret):

1. The frontend fetches ``GET /v1/auth/github/config`` and redirects the
   visitor to ``https://github.com/login/oauth/authorize`` itself. The
   client ID is public by design; the secret never leaves this process.
2. GitHub redirects back to the frontend callback page
   (``GITHUB_REDIRECT_URI``, e.g. ``https://reliastra.com/auth/github/callback``)
   with ``?code=``. The CSRF ``state`` is generated and verified by the
   frontend against ``sessionStorage`` - the backend never sees it.
3. The frontend POSTs the code to ``/v1/auth/github/exchange``. This
   service swaps it for a token, reads the GitHub identity, links or
   creates the Reliastra account, and returns the standard session pair.

Account rules, chosen to match the email flow's guarantees:

- The GitHub identity must expose a **verified** email. OAuth proves
  control of the GitHub account, not of an unverified address typed into
  it, so an unverified address cannot mint a session (the email login's
  hard gate, applied at the provider boundary).
- An existing ``github_id`` signs in. An existing **email** links: the
  GitHub id, avatar and verified flag are attached, the password is kept,
  so both sign-in methods keep working.
- A new address creates a full account (user + free org + owner
  membership + default application), already verified - there is no
  password to verify against and the address arrived verified.
"""

import logging
import secrets
from dataclasses import dataclass

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import get_password_hash
from app.modules.auth.schemas import GitHubAuthResponse
from app.modules.organizations.repository import OrganizationRepository
from app.modules.users.repository import UserRepository
from app.platform.web.errors import (
    ForbiddenException,
    ResourceNotFoundException,
    ServiceUnavailableException,
    UnauthorizedException,
)

logger = logging.getLogger(__name__)

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_EMAILS_URL = "https://api.github.com/user/emails"
OAUTH_TIMEOUT_SECONDS = 10.0
OAUTH_SCOPES = ("read:user", "user:email")


@dataclass(frozen=True)
class GitHubIdentity:
    github_id: str
    login: str
    full_name: str
    email: str
    avatar_url: str | None


class GitHubOAuthService:
    def __init__(
        self,
        user_repository: UserRepository = UserRepository(),
        org_repository: OrganizationRepository = OrganizationRepository(),
    ) -> None:
        self.user_repository = user_repository
        self.org_repository = org_repository

    # ── gating ──────────────────────────────────────────────────────

    def _require_config(self) -> tuple[str, str, str]:
        """Client triple, or 404 when the feature is not switched on.

        A disabled provider is *absent*, not broken: 404 keeps it out of
        scanners' interesting list and tells the frontend to hide the
        button rather than show an error.
        """
        if (
            not settings.GITHUB_AUTH_ENABLED
            or not settings.GITHUB_CLIENT_ID
            or not settings.GITHUB_CLIENT_SECRET
            or not settings.GITHUB_REDIRECT_URI
        ):
            raise ResourceNotFoundException("GitHub sign-in is not enabled")
        return (
            settings.GITHUB_CLIENT_ID,
            settings.GITHUB_CLIENT_SECRET,
            settings.GITHUB_REDIRECT_URI,
        )

    def public_config(self) -> dict[str, str | bool | None]:
        """What the frontend needs to build the authorize URL itself."""
        try:
            client_id, _, redirect_uri = self._require_config()
        except ResourceNotFoundException:
            return {"enabled": False, "client_id": None, "redirect_uri": None}
        return {"enabled": True, "client_id": client_id, "redirect_uri": redirect_uri}

    # ── provider calls ──────────────────────────────────────────────

    async def _exchange_code(self, client_id: str, client_secret: str, redirect_uri: str, code: str) -> str:
        try:
            async with httpx.AsyncClient(timeout=OAUTH_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    GITHUB_TOKEN_URL,
                    data={
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "code": code,
                        "redirect_uri": redirect_uri,
                    },
                    headers={"Accept": "application/json"},
                )
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            raise ServiceUnavailableException(
                "GitHub did not answer. Try again in a moment."
            ) from exc
        body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
        token = body.get("access_token") if isinstance(body, dict) else None
        if response.status_code != 200 or not token:
            # Wrong/expired/replayed code. Same sentence for all of them:
            # distinguishing them turns the endpoint into a code oracle.
            raise UnauthorizedException("That GitHub sign-in attempt has expired. Try again.")
        return str(token)

    async def _fetch_identity(self, token: str) -> GitHubIdentity:
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        try:
            async with httpx.AsyncClient(timeout=OAUTH_TIMEOUT_SECONDS) as client:
                user_response = await client.get(GITHUB_USER_URL, headers=headers)
                emails_response = await client.get(GITHUB_EMAILS_URL, headers=headers)
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            raise ServiceUnavailableException(
                "GitHub did not answer. Try again in a moment."
            ) from exc
        if user_response.status_code != 200 or emails_response.status_code != 200:
            raise ServiceUnavailableException(
                "GitHub did not answer. Try again in a moment."
            )
        user = user_response.json()
        emails = emails_response.json()
        email = self._verified_email(emails)
        if not email:
            raise ForbiddenException(
                "Your GitHub account has no verified email address, so it cannot "
                "open a Reliastra account. Verify an email on GitHub and try again."
            )
        raw_id = user.get("id")
        if raw_id is None:
            raise ServiceUnavailableException(
                "GitHub did not answer. Try again in a moment."
            )
        login = str(user.get("login") or "")
        return GitHubIdentity(
            github_id=str(raw_id),
            login=login,
            full_name=str(user.get("name") or login or email),
            email=email,
            avatar_url=user.get("avatar_url"),
        )

    @staticmethod
    def _verified_email(emails: object) -> str | None:
        if not isinstance(emails, list):
            return None
        primary_verified: str | None = None
        first_verified: str | None = None
        for entry in emails:
            if not isinstance(entry, dict):
                continue
            address = entry.get("email")
            if not address or entry.get("verified") is not True:
                continue
            if first_verified is None:
                first_verified = str(address)
            if entry.get("primary") is True:
                primary_verified = str(address)
                break
        return primary_verified or first_verified

    # ── account resolution ──────────────────────────────────────────

    async def authenticate(self, session: AsyncSession, code: str) -> GitHubAuthResponse:
        """Full code-to-session flow. Returns the standard token pair plus
        ``is_new_user`` so the client can route first-timers to onboarding."""
        from app.modules.auth.service import auth_service

        client_id, client_secret, redirect_uri = self._require_config()
        token = await self._exchange_code(client_id, client_secret, redirect_uri, code)
        identity = await self._fetch_identity(token)

        user = await self.user_repository.get_by_github_id(session, identity.github_id)
        is_new_user = False
        if user is None:
            user = await self.user_repository.get_by_email(session, identity.email)
            if user is not None:
                # Link: the address is proven by GitHub, the password stays,
                # both doors keep working.
                await self.user_repository.update(
                    session,
                    user,
                    github_id=identity.github_id,
                    avatar_url=identity.avatar_url,
                    is_email_verified=True,
                )
            else:
                user = await self._create_oauth_user(session, identity)
                is_new_user = True

        if not user.is_active:
            raise UnauthorizedException("User account is disabled")

        tokens = await auth_service.issue_session(session, user.id)
        return GitHubAuthResponse(
            access_token=tokens.access_token,
            refresh_token=tokens.refresh_token,
            token_type=tokens.token_type,
            expires_in=tokens.expires_in,
            is_new_user=is_new_user,
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
        )

    async def _create_oauth_user(self, session: AsyncSession, identity: GitHubIdentity):
        # No password exists for this account. The column is non-nullable,
        # so it stores an unusable random hash - password login can never
        # validate against it, and the value itself is never returned.
        user = await self.user_repository.create(
            session=session,
            email=identity.email,
            password_hash=get_password_hash(secrets.token_urlsafe(48)),
            full_name=identity.full_name[:150],
            is_email_verified=True,
            github_id=identity.github_id,
            avatar_url=identity.avatar_url,
            auth_provider="github",
        )
        slug = f"org-{user.id.hex[:8]}"
        existing_slug = await self.org_repository.get_by_slug(session, slug)
        suffix = 2
        while existing_slug:
            slug = f"org-{user.id.hex[:8]}-{suffix}"
            existing_slug = await self.org_repository.get_by_slug(session, slug)
            suffix += 1
        org = await self.org_repository.create(
            session=session,
            name=f"{identity.full_name[:120]}'s Organization",
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
        return user


github_oauth_service = GitHubOAuthService()
