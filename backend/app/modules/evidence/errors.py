"""Evidence errors: the failure contract callers decide on.

``EvidenceNotEntitledError`` (a 403, never retried) vs
``EvidenceGenerationError`` (retryable). Split out so every collaborator
can raise them without importing the service facade.
"""

from __future__ import annotations

from app.core.exceptions import ForbiddenException


class EvidenceNotEntitledError(ForbiddenException):
    """The organization's plan does not include evidence generation.

    Raised (rather than logged and swallowed) so the *caller* decides what it
    means: the HTTP surface turns it into a 403 with an upgrade message, and
    the background task records ``evidence_status = not_entitled`` and does not
    retry. A permission problem is not a transient failure and must not be
    retried three times.
    """


class EvidenceGenerationError(RuntimeError):
    """Generation failed in a way that is safe to retry."""
