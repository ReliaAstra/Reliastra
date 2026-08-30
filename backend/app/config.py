from __future__ import annotations

import base64
import hashlib
import logging
from typing import Literal
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

_LOCAL_DB_HOSTS = {
    "localhost",
    "127.0.0.1",
    "::1",
    "postgres",
    "reliastra-postgres",
}


def _normalise_db_url_for_parse(url: str) -> str:
    """Strip the SQLAlchemy driver suffix so urlparse can read the host."""
    if url.startswith("postgresql+"):
        rest = url.split("://", 1)[-1]
        return f"postgresql://{rest}"
    return url


def _hostname_from_db_url(url: str) -> str:
    return (urlparse(_normalise_db_url_for_parse(url)).hostname or "").lower()


def _is_supabase_postgres_host(host: str) -> bool:
    host = (host or "").lower()
    return (
        host.endswith(".supabase.co")
        or host.endswith(".supabase.com")
        or host.endswith("supabase.co")
        or host.endswith("supabase.com")
        or "pooler.supabase" in host
    )


_KNOWN_INSECURE_SECRETS = {
    "reliastra-super-secret-key-that-is-at-least-32-characters-long-for-security",
    "reliastra-dev-only-change-in-production-key",
    "changeme",
    "secret",
    "your-secret-key-here",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/reliastra",
        description="Supabase Postgres connection URL with the asyncpg driver. "
        "SQLite and in-cluster PostgreSQL are not supported. "
        "Use the URI from Supabase → Project Settings → Database "
        "(pooler on port 6543 is preferred for the API). "
        "For SSL databases, set DATABASE_SSL_MODE=require.",
    )
    DATABASE_SSL_MODE: str = Field(
        default="",
        description="PostgreSQL SSL mode: disable | allow | prefer | require | "
        "verify-ca | verify-full. Appended to DATABASE_URL if set. "
        "Empty defaults to 'require' when DATABASE_URL points at "
        "Supabase. 'prefer' negotiates TLS opportunistically "
        "(asyncpg default); 'disable' forces plaintext.",
    )
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL",
    )
    SECRET_KEY: str = Field(
        default="reliastra-super-secret-key-that-is-at-least-32-characters-long-for-security",
        min_length=32,
        description="Secret key for JWT and encryption",
    )
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=15,
        description="Access token expiration time in minutes",
    )
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(
        default=7,
        description="Refresh token expiration time in days",
    )
    REFRESH_REUSE_GRACE_SECONDS: int = Field(
        default=20,
        ge=10,
        le=30,
        description=(
            "Seconds after a refresh rotation during which a replayed "
            "previous token is treated as a benign parallel refresh (the "
            "last issued pair is returned) instead of family-wide theft "
            "revocation. Three frontend surfaces share one session and can "
            "legitimately refresh the same token within milliseconds."
        ),
    )
    ADMIN_TOKEN_SECRET: str = Field(
        default="",
        min_length=0,
        description="Signing key (>= 32 chars) for ADMIN-console JWTs. "
        "Must be set together with ADMIN_USERNAME/ADMIN_PASSWORD; the admin "
        "console is disabled while it is missing. The frontend admin proxy "
        "uses the same value to verify admin session cookies server-side.",
    )
    # Supabase Storage S3 API — the ONLY object-storage backend.
    SUPABASE_S3_ENDPOINT: str = Field(
        default="",
        description="Supabase Storage S3 endpoint URL, e.g. "
        "'https://<project-ref>.supabase.co/storage/v1/s3'. "
        "Copy the full endpoint from the Supabase dashboard "
        "(Storage → S3 Access Keys).",
    )
    SUPABASE_S3_REGION: str = Field(
        default="",
        description="Supabase project region (e.g. 'eu-west-3', 'us-east-1'). "
        "Required — there is no default region.",
    )
    SUPABASE_S3_ACCESS_KEY_ID: str | None = Field(
        default=None,
        description="Supabase Storage S3 access key id (Storage → S3 Access "
        "Keys). NOT the anon/service-role API keys.",
    )
    SUPABASE_S3_SECRET_ACCESS_KEY: str | None = Field(
        default=None,
        description="Supabase Storage S3 secret access key (Storage → S3 "
        "Access Keys). NOT the anon/service-role API keys.",
    )
    SUPABASE_S3_BUCKET: str = Field(
        default="",
        description="Supabase Storage bucket name. Buckets are created in the "
        "Supabase dashboard — the app never creates them.",
    )
    SMTP_HOST: str = Field(
        default="localhost",
        description="SMTP server host",
    )
    SMTP_PORT: int = Field(
        default=1025,
        description="SMTP server port",
    )
    SMTP_FROM: str = Field(
        default="noreply@reliastra.com",
        description="Default sender email address",
    )
    CORS_ORIGINS: list[str] = Field(
        default=[
            "http://localhost:3000",
            "http://localhost:8000",
            "https://reliastra.com",
            "https://www.reliastra.com",
        ],
        description="Allowed CORS origins (must be explicit when credentials=True)",
    )
    CORS_ALLOW_CREDENTIALS: bool = Field(
        default=True,
        description="Whether to allow cookies/credentials in CORS requests",
    )
    PAYSTACK_SECRET_KEY: str = Field(
        default="",
        description="Paystack secret key used for API calls and webhook signing",
    )
    PAYSTACK_PUBLIC_KEY: str = Field(
        default="",
        description="Paystack public key for payment initialization",
    )
    PAYSTACK_BASE_URL: str = Field(
        default="https://api.paystack.co",
        description="Paystack API base URL",
    )
    PAYSTACK_CURRENCY: str = Field(
        default="NGN",
        description="ISO currency code sent with Paystack transaction "
                    "initialization, and the currency every payment decision "
                    "surface discloses to the customer. The current merchant "
                    "account processes in Nigerian Naira (NGN); USD settlement "
                    "is pending legal/regulatory enablement. Without an "
                    "explicit currency Paystack charges in the account default, "
                    "which silently reprices USD-denominated plans.",
    )
    PAYSTACK_NGN_PLAN_PRICES: dict[str, int | dict[str, int]] | None = Field(
        default_factory=lambda: {
            # Explicit, business-published PAYMENT prices in NGN kobo. These
            # are commercial decisions for the Nigerian merchant account, NOT
            # an FX conversion of the USD list price: the application never
            # derives them from a rate, and changing the USD price does not
            # move these figures. Override per environment via the
            # PAYSTACK_NGN_PLAN_PRICES env var (JSON) to reprice; set it to
            # "{}" to publish no prices and disable self-serve checkout.
            "pro": {"monthly": 6000000, "annual": 60000000},
        },
        description="Business-published PAYMENT prices in NGN kobo (minor "
        "units), separate from the USD product price list. Default: "
        '{"pro": {"monthly": 6000000, "annual": 60000000}} — i.e. ₦60,000 '
        "per month and ₦600,000 per year, the published NGN prices. These are "
        "explicit operator decisions \u2014 the application never derives them "
        "from an exchange rate. When PAYSTACK_CURRENCY is NGN and a plan is "
        "absent here, self-serve checkout for that plan is disabled rather "
        "than charging the USD minor-unit amount as Naira.",
    )
    # ── PAYMENT CHANNEL POLICY (global checkout) ─────────────────────────────
    # Paystack shows the methods enabled on the dashboard unless a transaction
    # declares its own. RELIASTRA serves customers worldwide, so it declares:
    # card only. See app/core/payment_channels.py for the full rationale.
    PAYSTACK_DEFAULT_CHANNEL: str = Field(
        default="card",
        description="The channel RELIASTRA's global checkout enables when "
        "PAYSTACK_CHECKOUT_CHANNELS is unset. Card is the only Paystack "
        "channel documented as available on all accounts and all markets.",
    )
    PAYSTACK_CHECKOUT_CHANNELS: list[str] | None = Field(
        default=None,
        description="Explicit `channels` array sent to "
        "POST /transaction/initialize. Unset -> ['card']. Entries that are "
        "not Paystack channels, or that are country-restricted for the active "
        "currency, are dropped and logged rather than sent — a global customer "
        "is never shown USSD, Pay with Bank, QR or mobile money. Accepts a "
        'JSON array (["card"]) or a comma list (card) via env.',
    )
    PAYSTACK_ENABLE_LOCAL_CHANNELS: bool = Field(
        default=False,
        description="Escape hatch for a deployment that really bills local "
        "customers (e.g. a Ghanaian entity charging GHS, where mobile money "
        "genuinely works). Allows market-specific channels already permitted "
        "for the active currency. Leaving this false is what keeps the global "
        "checkout card-only even if someone edits the dashboard preferences.",
    )
    # ── SECURE PAYMENT EXPERIENCE (InlineJS popup) ───────────────────────────
    # The transaction is always initialized server-side with the secret key;
    # only the public key and the returned access code reach the browser. No
    # card number, expiry or CVC is ever posted to RELIASTRA — Paystack's
    # Cards API requires PCI-DSS attestation and RELIASTRA is not a
    # PCI-attested merchant, so the raw-card path is not implemented by design.
    PAYSTACK_INLINE_JS_ENABLED: bool = Field(
        default=True,
        description="Complete payment inside RELIASTRA's checkout using "
        "Paystack InlineJS (popup + resumeTransaction with the access code), "
        "so the customer stays on a RELIASTRA page instead of being redirected. "
        "When false — or if the provider script cannot load — the checkout "
        "falls back to the hosted authorization URL.",
    )
    PAYSTACK_INLINE_JS_URL: str = Field(
        default="https://js.paystack.co/v1/inline.js",
        description="URL of Paystack's InlineJS library. Only ever loaded in "
        "the browser; kept in config so a provider domain change is not a "
        "code edit.",
    )

    # ── FX REFERENCE (display context ONLY — never a pricing input) ─────────
    # The customer-facing pages may show a reference USD→NGN rate so the gap
    # between the $39 list price and the ₦ payment price is not a mystery.
    # It is labelled an estimate, attributed to a verifiable public source,
    # timestamped, and read through a cache. No charge ever consults it.
    FX_REFERENCE_ENABLED: bool = Field(
        default=True,
        description="Fetch and display a reference FX estimate on payment "
        "surfaces. Set false to hide the panel entirely; pricing is "
        "unaffected either way.",
    )
    FX_REFERENCE_URL: str = Field(
        default="https://open.er-api.com/v6/latest/USD",
        description="Verifiable public JSON endpoint used for the reference "
        "rate only. ExchangeRate-API's open endpoint requires no key, names "
        "itself in responses and carries an update timestamp "
        "(time_last_update_utc). Any endpoint returning "
        '{"base","rates","time_last_update_utc"} works.',
    )
    FX_REFERENCE_PROVIDER: str = Field(
        default="ExchangeRate-API",
        description="Source name shown beside the estimate.",
    )
    FX_REFERENCE_PROVIDER_URL: str = Field(
        default="https://www.exchangerate-api.com",
        description="Human-checkable URL for the source shown beside the "
        "estimate.",
    )
    FX_REFERENCE_TIMEOUT_SECONDS: float = Field(
        default=4.0,
        description="Hard timeout for the reference-rate fetch. On failure "
        "the estimate is simply not shown — nothing falls back to a guess.",
    )
    FX_REFERENCE_CACHE_TTL_SECONDS: int = Field(
        default=3600,
        description="How long a fetched reference rate is reused (Redis, or "
        "process memory when Redis is unavailable).",
    )
    IPINFO_TOKEN: str = Field(
        default="",
        description="ipinfo.io token for visitor country resolution. "
                    "Optional: Cloudflare/Vercel edge headers take priority "
                    "when present, and a free ipapi.co fallback is used "
                    "without a token (rate-limited). Results cached 7 days.",
    )
    SMTP_USE_TLS: bool = Field(
        default=False,
        description="Whether to negotiate SMTP TLS when supported",
    )
    ENVIRONMENT: str = Field(
        default="development",
        description="Current environment (development, staging, production)",
    )
    LOG_JSON: bool = Field(
        default=False,
        description="Emit structured JSON logs. Production always uses JSON "
        "(see app.core.logging); set this to force JSON in other environments.",
    )
    CHECK_SCHEDULE_SECONDS: float = Field(
        default=30.0,
        ge=5,
        le=3600,
        description="Celery beat interval (seconds) for dispatching due dependency checks.",
    )
    CELERY_TASK_SOFT_TIME_LIMIT: int = Field(
        default=240,
        ge=10,
        description="Soft time limit (seconds) for Celery tasks. SoftTimeLimitExceeded is raised first.",
    )
    CELERY_TASK_TIME_LIMIT: int = Field(
        default=300,
        ge=15,
        description="Hard time limit (seconds) for Celery tasks. The worker process is killed after this.",
    )
    RUN_IN_PROCESS_SCHEDULER: bool = Field(
        default=False,
        description="When true, the API process also polls due checks. "
        "Keep false when Celery Beat + workers own scheduling.",
    )
    TRUSTED_PROXY_HOPS: int = Field(
        default=1,
        description="Number of trusted reverse-proxy hops used when parsing "
        "X-Forwarded-For for rate limiting",
    )
    # ── Supabase Authentication ──────────────────────────────────────────
    SUPABASE_URL: str = Field(
        default="",
        description="Supabase project URL (e.g. https://xyz.supabase.co). "
        "When set, the API accepts Supabase JWTs in addition to "
        "native Reliastra tokens.",
    )
    SUPABASE_JWT_SECRET: str = Field(
        default="",
        description="Supabase JWT secret (the `SUPABASE_JWT_SECRET` from "
        "project settings -> API -> JWT Settings). Used to verify "
        "RS256 JWTs issued by Supabase Auth.",
    )

    # ── Reliastra-managed LLM ────────────────────────────────────────────
    # AI explanations are produced by the LLM Reliastra operates. Customers
    # never bring their own endpoint, model or key: the platform owns the
    # provider, and an organization may only opt out of AI explanations
    # (organizations.ai_explanations_enabled).
    RELIASTRA_AI_ENABLED: bool = Field(
        default=True,
        description="Master switch for the Reliastra-managed LLM. When false, "
        "evidence reports are generated without AI explanations.",
    )
    RELIASTRA_AI_PROVIDER_TYPE: Literal["openai_compatible", "anthropic", "google"] = (
        Field(
            default="openai_compatible",
            description="Wire format of the Reliastra-managed LLM endpoint.",
        )
    )
    RELIASTRA_AI_ENDPOINT_URL: str = Field(
        default="https://api.openai.com/v1/chat/completions",
        description="Chat-completions endpoint of the Reliastra-managed LLM. "
        "Defaults to OpenAI; override only when Reliastra moves "
        "its own inference to another provider.",
    )
    RELIASTRA_AI_MODEL: str = Field(
        default="gpt-4o-mini",
        description="Model served by the Reliastra-managed LLM endpoint.",
    )
    RELIASTRA_AI_API_KEY: SecretStr | None = Field(
        default=None,
        description="Reliastra's own LLM credential. The only value that must "
        "be supplied to turn AI explanations on — endpoint, model "
        "and parameters already have production defaults.",
    )
    RELIASTRA_AI_MAX_TOKENS: int = Field(
        default=1024,
        ge=1,
        le=100000,
        description="Maximum tokens requested from the Reliastra-managed LLM.",
    )
    RELIASTRA_AI_TEMPERATURE: float = Field(
        default=0.3,
        ge=0,
        le=2,
        description="Sampling temperature for the Reliastra-managed LLM. "
        "Kept low: explanations restate pre-computed facts.",
    )
    RELIASTRA_AI_TIMEOUT_SECONDS: float = Field(
        default=30.0,
        ge=1,
        le=300,
        description="Per-request timeout (seconds) for LLM calls.",
    )

    @field_validator("RELIASTRA_AI_ENDPOINT_URL")
    @classmethod
    def _validate_ai_endpoint(cls, value: str) -> str:
        value = (value or "").strip()
        if value and not value.startswith(("https://", "http://")):
            raise ValueError("RELIASTRA_AI_ENDPOINT_URL must be an HTTP(S) URL")
        return value

    @field_validator("PAYSTACK_CHECKOUT_CHANNELS", mode="before")
    @classmethod
    def _parse_paystack_channels(cls, value: object) -> object:
        """Accept a JSON array or a comma/space list; blank means "use policy".

        ``PAYSTACK_CHECKOUT_CHANNELS=`` must read as *unset* — RELIASTRA then
        falls back to the card-only default in ``app.core.payment_channels``.
        Reading a blank as an empty list would be the dangerous version: an
        empty ``channels`` array is not "card only", it is Paystack choosing.
        """
        if value is None:
            return None
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return None
            if text.startswith("["):
                try:
                    import json

                    value = json.loads(text)
                except ValueError as exc:
                    raise ValueError(
                        "PAYSTACK_CHECKOUT_CHANNELS must be a JSON array, "
                        'e.g. ["card"]'
                    ) from exc
            else:
                return [part for part in text.replace(",", " ").split() if part]
        if isinstance(value, (list, tuple, set)):
            cleaned = [str(item).strip() for item in value if str(item).strip()]
            return cleaned or None
        raise ValueError(
            "PAYSTACK_CHECKOUT_CHANNELS must be a list of Paystack channel names"
        )

    @field_validator("PAYSTACK_NGN_PLAN_PRICES", mode="before")
    @classmethod
    def _parse_paystack_price_catalog(cls, value: object) -> object:
        """Accept a dict (already parsed) or a JSON string; blank means None.

        A blank ``PAYSTACK_NGN_PLAN_PRICES=`` env value must not crash the
        application and must not be read as "0" or as the USD price: it is the
        explicit no-catalog state, in which self-serve checkout stays disabled
        for the NGN plans until the operator publishes prices.
        """
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return None
            try:
                import json

                value = json.loads(value)
            except ValueError as exc:
                raise ValueError(
                    "PAYSTACK_NGN_PLAN_PRICES must be a JSON object mapping "
                    'plan -> amount, e.g. {"pro": {"monthly": 6000000}}'
                ) from exc
        if value is None:
            return None
        if not isinstance(value, dict):
            raise ValueError(
                "PAYSTACK_NGN_PLAN_PRICES must be a JSON object mapping "
                "plan -> amount in minor units"
            )
        return value

    @property
    def ai_api_key(self) -> str | None:
        """Plaintext Reliastra LLM key, or None when unset."""
        if self.RELIASTRA_AI_API_KEY is None:
            return None
        return self.RELIASTRA_AI_API_KEY.get_secret_value() or None

    @property
    def ai_available(self) -> bool:
        """True when the Reliastra-managed LLM can actually be called."""
        return bool(
            self.RELIASTRA_AI_ENABLED
            and self.RELIASTRA_AI_ENDPOINT_URL
            and self.RELIASTRA_AI_MODEL
            and self.ai_api_key
        )

    @property
    def database_url_with_ssl(self) -> str:
        """Return DATABASE_URL with SSL parameters applied if configured.

        Only PostgreSQL URLs get sslmode appended. Bare ``postgresql://``
        URLs are normalised to ``postgresql+asyncpg://`` so that
        ``create_async_engine`` picks the correct driver even when the
        environment variable omits it.
        """
        url = self.DATABASE_URL
        # Normalise bare postgresql:// → postgresql+asyncpg://
        if url.startswith("postgresql://") and not url.startswith("postgresql+"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        if not self.DATABASE_SSL_MODE or not url.startswith("postgresql"):
            return url
        parsed = urlparse(url)
        existing_params = parse_qs(parsed.query, keep_blank_values=True)
        existing_params["sslmode"] = [self.DATABASE_SSL_MODE]
        new_query = urlencode(existing_params, doseq=True)
        return urlunparse(parsed._replace(query=new_query))

    @model_validator(mode="after")
    def _require_postgres_database_url(self) -> Settings:
        """SQLite and non-Postgres drivers are not supported."""
        url = (self.DATABASE_URL or "").strip()
        scheme = url.split(":", 1)[0].lower()
        if not url or not scheme.startswith("postgresql"):
            raise ValueError(
                "DATABASE_URL must be a PostgreSQL URL (Supabase Postgres). "
                "SQLite and other drivers are not supported. "
                f"Got scheme {scheme!r}."
            )
        return self

    @model_validator(mode="after")
    def _default_ssl_mode_for_supabase(self) -> Settings:
        """Supabase always serves TLS — default sslmode to require."""
        if self.DATABASE_SSL_MODE:
            return self
        if _is_supabase_postgres_host(_hostname_from_db_url(self.DATABASE_URL)):
            self.DATABASE_SSL_MODE = "require"
        return self

    @model_validator(mode="after")
    def _validate_supabase_s3_endpoint(self) -> Settings:
        """Enforce the Supabase Storage S3 endpoint shape.

        Only the Supabase S3 API is supported: the endpoint must be an
        https:// URL ending in ``/storage/v1/s3``.  A trailing slash is
        stripped.  An empty endpoint is allowed outside production
        (storage is simply unconfigured).
        """
        endpoint = self.SUPABASE_S3_ENDPOINT.strip()
        if not endpoint:
            return self
        if urlparse(endpoint).scheme != "https":
            raise ValueError(
                "SUPABASE_S3_ENDPOINT must be an https:// URL, e.g. "
                "'https://<project-ref>.supabase.co/storage/v1/s3'."
            )
        if not endpoint.rstrip("/").endswith("/storage/v1/s3"):
            raise ValueError(
                "SUPABASE_S3_ENDPOINT must end in '/storage/v1/s3'. "
                "Only Supabase Storage's S3-compatible API is supported."
            )
        self.SUPABASE_S3_ENDPOINT = endpoint.rstrip("/")
        return self

    @model_validator(mode="after")
    def _validate_admin_credentials(self) -> Settings:
        username = self.ADMIN_USERNAME.strip()
        password = self.ADMIN_PASSWORD.get_secret_value() if self.ADMIN_PASSWORD else ""

        if not username and not password:
            # Disabled by default — admin console endpoints fail closed.
            return self
        if not username or not password:
            raise ValueError(
                "ADMIN_USERNAME and ADMIN_PASSWORD must be set together. "
                "The admin console is disabled while either is missing."
            )
        if len(password) < 16:
            raise ValueError(
                "ADMIN_PASSWORD must be at least 16 characters long."
            )
        if password in _KNOWN_INSECURE_SECRETS or password.lower() in {
            "changeme", "password", "admin", "secret", "reliastra"
        }:
            raise ValueError(
                "ADMIN_PASSWORD is a known insecure value. Choose a "
                "cryptographically strong, unique password."
            )
        if not self.ADMIN_TOKEN_SECRET:
            raise ValueError(
                "ADMIN_TOKEN_SECRET must be set together with "
                "ADMIN_USERNAME/ADMIN_PASSWORD."
            )
        if len(self.ADMIN_TOKEN_SECRET) < 32:
            raise ValueError(
                "ADMIN_TOKEN_SECRET must be at least 32 characters long."
            )
        return self

    @property
    def admin_console_enabled(self) -> bool:
        """True only when the dedicated admin credential is fully configured."""
        username = self.ADMIN_USERNAME.strip()
        password = (
            self.ADMIN_PASSWORD.get_secret_value()
            if self.ADMIN_PASSWORD
            else ""
        )
        return bool(username and password and self.ADMIN_TOKEN_SECRET)

    @property
    def admin_service_email(self) -> str:
        return self.ADMIN_SERVICE_EMAIL.strip().lower()

    @model_validator(mode="after")
    def _reject_insecure_defaults_in_production(self) -> Settings:
        if self.ENVIRONMENT != "production":
            return self
        if self.SECRET_KEY in _KNOWN_INSECURE_SECRETS:
            raise ValueError(
                "SECRET_KEY must be changed from the default value in production. "
                "Set a cryptographically random SECRET_KEY environment variable."
            )
        missing = [
            name
            for name, value in (
                ("SUPABASE_S3_ENDPOINT", self.SUPABASE_S3_ENDPOINT),
                ("SUPABASE_S3_REGION", self.SUPABASE_S3_REGION),
                ("SUPABASE_S3_ACCESS_KEY_ID", self.SUPABASE_S3_ACCESS_KEY_ID),
                (
                    "SUPABASE_S3_SECRET_ACCESS_KEY",
                    self.SUPABASE_S3_SECRET_ACCESS_KEY,
                ),
                ("SUPABASE_S3_BUCKET", self.SUPABASE_S3_BUCKET),
            )
            if not value
        ]
        if missing:
            raise ValueError(
                "Production is missing required Supabase Storage S3 configuration. "
                f"Missing: {', '.join(missing)}. "
                "Configure them from the Supabase dashboard "
                "(Storage → S3 Access Keys)."
            )
        host = _hostname_from_db_url(self.DATABASE_URL)
        if host in _LOCAL_DB_HOSTS or not _is_supabase_postgres_host(host):
            raise ValueError(
                "DATABASE_URL must point at Supabase Postgres in production "
                "(host ending in .supabase.co / .supabase.com), not a "
                "local or in-cluster database."
            )
        return self

    # Google OAuth settings
    GOOGLE_CLIENT_ID: str | None = Field(
        default=None,
        description="Google OAuth 2.0 client ID",
    )
    GOOGLE_CLIENT_SECRET: str | None = Field(
        default=None,
        description="Google OAuth 2.0 client secret",
    )
    GOOGLE_REDIRECT_URI: str | None = Field(
        default=None,
        description="Google OAuth redirect URI (e.g. https://yourapp.com/auth/google/callback)",
    )
    GOOGLE_AUTH_ENABLED: bool = Field(
        default=False,
        description="Enable/disable Google OAuth authentication",
    )

    # GitHub OAuth settings
    GITHUB_CLIENT_ID: str | None = Field(
        default=None,
        description="GitHub OAuth client ID",
    )
    GITHUB_CLIENT_SECRET: str | None = Field(
        default=None,
        description="GitHub OAuth client secret",
    )
    GITHUB_REDIRECT_URI: str | None = Field(
        default=None,
        description="GitHub OAuth redirect URI (e.g. https://yourapp.com/auth/github/callback)",
    )
    GITHUB_AUTH_ENABLED: bool = Field(
        default=False,
        description="Enable/disable GitHub OAuth authentication",
    )

    # Email verification & password reset
    FRONTEND_BASE_URL: str = Field(
        default="http://localhost:3000",
        description="Frontend base URL for email verification and password reset links",
    )
    EMAIL_VERIFICATION_EXPIRE_MINUTES: int = Field(
        default=60,
        description="Email verification token lifetime in minutes",
    )
    PASSWORD_RESET_EXPIRE_MINUTES: int = Field(
        default=15,
        description="Password reset token lifetime in minutes",
    )
    REPORT_TOKEN_TTL_DAYS: int = Field(
        default=7,
        description="Evidence report_token lifetime in days",
    )

    # ── Admin console (dedicated secret credentials) ─────────────────────────
    # The admin control plane is NOT driven by user accounts. Access requires
    # these dedicated credentials, configured as secrets. They are verified in
    # constant time and only ever mint ADMIN-scoped JWTs (type=admin_access /
    # admin_refresh, audience=reliastra-admin) that no user/partner/API-key
    # endpoint will accept. Both must be set together; when unset the admin
    # console is disabled (fail closed).
    ADMIN_USERNAME: str = Field(
        default="",
        min_length=0,
        max_length=64,
        description="Admin console username (secret). Set together with "
        "ADMIN_PASSWORD. Empty disables the admin console.",
    )
    ADMIN_PASSWORD: SecretStr = Field(
        default=SecretStr(""),
        description="Admin console password (secret, >= 16 chars). Set together "
        "with ADMIN_USERNAME. Empty disables the admin console.",
    )
    ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=15,
        ge=5,
        le=120,
        description="Admin access token lifetime in minutes.",
    )
    ADMIN_REFRESH_TOKEN_EXPIRE_DAYS: int = Field(
        default=1,
        ge=1,
        le=14,
        description="Admin refresh token lifetime in days.",
    )
    ADMIN_SERVICE_EMAIL: str = Field(
        default="system-admin@reliastra.internal",
        max_length=255,
        description=(
            "Email of the non-login-able service account used as the FK "
            "anchor for admin-created records and the admin audit trail. "
            "This account cannot sign in: its password hash is a random "
            "value generated at seed time and never revealed."
        ),
    )

    # ── Partner Network / Distribution Infrastructure ────────────────────────
    # Canonical public origin used to build partner referral links. NEVER
    # hardcode "https://reliastra.com" anywhere in the codebase — read it here.
    RELIASTRA_PUBLIC_URL: str = Field(
        default="https://reliastra.com",
        description="Canonical public website origin used to build partner "
        "referral links (https://<origin>/r/{code}).",
    )
    PARTNER_REFERRAL_PATH_PREFIX: str = Field(
        default="/r",
        description="Path prefix for canonical partner referral links.",
    )
    PARTNER_COMMISSION_RATE: int = Field(
        default=30,
        ge=0,
        le=100,
        description="Recurring partner commission rate, as an integer "
        "percentage of the customer's eligible subscription "
        "revenue. 30 == 30%.",
    )
    PARTNER_COMMISSION_HOLD_DAYS: int = Field(
        default=30,
        ge=0,
        le=365,
        description="Holding period (days) between a commission being earned "
        "and becoming payable, covering refunds and chargebacks.",
    )
    PARTNER_MINIMUM_PAYOUT_MINOR: int = Field(
        default=5000,
        ge=0,
        description="Minimum payable balance (integer minor units) required "
        "before a partner's balance can be settled as a payout.",
    )
    PARTNER_PAYOUT_DESTINATION_COOLDOWN_HOURS: int = Field(
        default=24,
        ge=0,
        le=168,
        description="Hours a partner must wait after changing their payout "
        "destination before a payout can be requested to it. Turns "
        "an account takeover into something the partner can still "
        "catch before money moves. Set to 0 to disable.",
    )
    PARTNER_DEFAULT_CURRENCY: str = Field(
        default="USD",
        description="Default ISO-4217 currency for partner money amounts. "
        "All amounts are stored as integer minor units.",
    )

    @property
    def partner_referral_base_url(self) -> str:
        """Canonical base for partner referral links, without trailing slash."""
        origin = self.RELIASTRA_PUBLIC_URL.rstrip("/")
        prefix = "/" + self.PARTNER_REFERRAL_PATH_PREFIX.strip("/")
        return f"{origin}{prefix}"

    @property
    def fernet_key(self) -> bytes:
        """Derive a 32-byte url-safe base64-encoded key from SECRET_KEY for Fernet encryption."""
        key_hash = hashlib.sha256(self.SECRET_KEY.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(key_hash)


settings = Settings()
