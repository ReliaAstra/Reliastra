import re
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, field_validator

#: Control characters and characters that have no business in campaign data.
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
_MULTI_SPACE = re.compile(r"\s+")
_HOST_RE = re.compile(r"^[a-z0-9.-]+\.[a-z]{2,}$")

SEARCH_ENGINE_HOSTS = {
    "google.com",
    "www.google.com",
    "bing.com",
    "duckduckgo.com",
    "search.yahoo.com",
    "yahoo.com",
    "baidu.com",
    "yandex.com",
    "ecosia.org",
    "startpage.com",
}


def _clean(value: str | None, max_length: int) -> str | None:
    """Normalize an untrusted attribution string.

    Strips control chars/whitespace noise, lowercases (UTM values are
    conventionally lowercase; case adds nothing but query friction), and
    clamps length. Empty becomes None so we never store empty strings.
    """
    if not value:
        return None
    cleaned = _MULTI_SPACE.sub(" ", _CONTROL_CHARS.sub("", value)).strip().lower()
    if not cleaned:
        return None
    return cleaned[:max_length]


def clean_host(value: str | None) -> str | None:
    """Extract and validate just the hostname of a referrer URL.

    Never stores paths/query strings from the referrer - they can contain
    private URL contents.
    """
    if not value:
        return None
    try:
        host = (urlparse(value.strip()).hostname or "").lower()
    except ValueError:
        return None
    if not host or len(host) > 200 or not _HOST_RE.match(host):
        return None
    return host


def clean_landing_path(value: str | None) -> str | None:
    """Keep only the PATH portion of a landing URL.

    Query strings are dropped entirely: they may carry emails, tokens or
    other sensitive parameters, and only UTMs matter for attribution.
    """
    if not value:
        return None
    raw = value.strip()
    if not raw.startswith("/"):
        return None
    path = raw.split("?", 1)[0].split("#", 1)[0]
    if not path or len(path) > 300:
        return None
    return path


class AcquisitionTouchInput(BaseModel):
    """One observed touch. Client sends this from the arriving page.

    No pydantic ``max_length`` constraints here on purpose: they would REJECT
    oversized values with a 422 and break registration. Validators are the
    single clamping authority - absurd input is silently truncated to the
    stored column limits (failure isolation: malformed UTMs must never break
    signup).
    """

    source: str | None = None
    medium: str | None = None
    campaign: str | None = None
    content: str | None = None
    term: str | None = None
    landing_path: str | None = None
    referrer_host: str | None = None

    @field_validator("source", "medium", "campaign")
    @classmethod
    def _clean120(cls, v: str | None) -> str | None:
        return _clean(v, 120)

    @field_validator("content", "term")
    @classmethod
    def _clean200(cls, v: str | None) -> str | None:
        return _clean(v, 200)

    @field_validator("landing_path")
    @classmethod
    def _clean_path(cls, v: str | None) -> str | None:
        return clean_landing_path(v)

    @field_validator("referrer_host")
    @classmethod
    def _clean_ref(cls, v: str | None) -> str | None:
        # Accept either a bare host or a full referrer URL; store host only.
        if v and "://" in v:
            return clean_host(v)
        return _clean(v, 200)


class AcquisitionAttributionInput(BaseModel):
    """Payload attached to ``POST /v1/auth/register``.

    ``first`` is write-once (the original acquisition). ``last`` is the most
    recent touch when signup happens after earlier visits. Both optional;
    signup must succeed without either.
    """

    first: AcquisitionTouchInput | None = None
    last: AcquisitionTouchInput | None = None


class AcquisitionRead(BaseModel):
    """Admin-facing read model (existing admin patterns consume this)."""

    model_config = ConfigDict(from_attributes=True)

    channel: str
    source: str | None = None
    medium: str | None = None
    campaign: str | None = None
    content: str | None = None
    term: str | None = None
    landing_path: str | None = None
    referrer_host: str | None = None
    first_touch_at: str | None = None
    last_channel: str | None = None
    last_source: str | None = None
    last_campaign: str | None = None
    last_touch_at: str | None = None
