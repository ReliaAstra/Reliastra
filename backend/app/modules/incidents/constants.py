from enum import Enum


class IncidentSeverity(str, Enum):
    CRITICAL = "critical"
    MAJOR = "major"
    MINOR = "minor"


class IncidentStatus(str, Enum):
    OPEN = "open"
    RESOLVED = "resolved"
    FALSE_POSITIVE = "false_positive"


class RootCause(str, Enum):
    VENDOR_FAILURE = "vendor_failure"
    NETWORK_ISSUE = "network_issue"
    CONFIG_ERROR = "config_error"
    UNKNOWN = "unknown"


class EvidenceStatus(str, Enum):
    """Where an incident is in the evidence-generation lifecycle.

    A closed set, mirrored by the ``ck_incidents_evidence_status_known`` check
    constraint. ``NOT_ENTITLED`` is a deliberate product state - the plan does
    not include evidence generation - and is deliberately *not* an error, so a
    Free workspace never looks broken and no background job is queued to fail.
    """

    #: No attempt has been made yet (the incident is still open).
    PENDING = "pending"
    #: A generation attempt is in flight.
    GENERATING = "generating"
    #: An artifact exists and ``evidence_report_id`` points at it.
    AVAILABLE = "available"
    #: The last attempt failed. ``evidence_error`` says why; retry is safe.
    FAILED = "failed"
    #: The plan excludes evidence generation. Nothing was queued.
    NOT_ENTITLED = "not_entitled"


class CorrelationMethod(str, Enum):
    TEMPORAL = "temporal"
    MANUAL = "manual"
    ML = "ml"


DEFAULT_CORRELATION_CONFIDENCE: float = 0.85
TEMPORAL_WINDOW_SECONDS: int = 300
