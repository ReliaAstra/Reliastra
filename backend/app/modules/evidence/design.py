"""Presentation contract for the evidence artifact.

An evidence report is the only document this product produces that a customer
hands to somebody who has decided, in advance, not to believe them. The data
layer (``metrics``, ``chart``, ``signing``) decides what is true. This module
decides only how it is *stated*, and it exists so the two cannot be confused:

* **No raw enum in a document.** ``vendor_failure``, ``dep_01J8…`` and
  ``single.consecutive_failures`` are storage tokens. A reader who is not
  inside our database gets a label, and an unmapped token is title-cased rather
  than printed verbatim - a document that leaks an internal identifier reads
  like a log export, and a document that silently invents a friendly name for
  one reads like marketing.
* **No float artefacts.** ``0.73 * 100`` is ``73.00000000000001``, and that
  number used to be printed in a document whose entire purpose is to be
  quoted. Every numeric here goes through one formatter with an explicit
  precision, and every unavailable figure renders as an explicit absence.
* **A finding before a dataset.** The verdict block is derived only from
  measurements that already exist. It contains no recommendation, no liability
  language, and no number that is not on the same page. Where the record cannot
  support a statement, the statement is not made.

The wording rules are the ones the artifact has always honoured, now in one
place: measured, never extrapolated; single observation point, never called a
quorum; context, never an incident measurement.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from collections.abc import Iterable
from typing import Any

from app.config import settings

MONTHS = (
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)

#: Attribution classifications, as a reader meets them. Keys are the engine's
#: tokens (`app/modules/attribution/service.py`); the frontend contract test
#: asserts the set, so an added branch shows up here as a missing label.
CLASSIFICATION_LABELS = {
    "vendor_failure": "Vendor failure",
    "multi_cause": "Multi-cause",
    "infrastructure_issue": "Customer infrastructure",
    "unknown": "Unattributed",
}

SEVERITY_LABELS = {
    "critical": "Critical",
    "major": "Major",
    "minor": "Minor",
}

STATUS_LABELS = {
    "open": "Open",
    "resolved": "Resolved",
    "false_positive": "False positive",
}

CORRELATION_METHOD_LABELS = {
    "temporal": "Time window overlap",
    "time_window": "Time window overlap",
    "endpoint_overlap": "Shared endpoint",
    "latency_correlation": "Latency correlation",
}

#: ``-`` is the typographic absence marker in this document. A blank cell in a
#: report of record looks like a lost value; a dash looks like a stated one.
ABSENT = "—"


def share_percent(value: Any, digits: int = 1) -> str:
    """A 0-1 share, printed as a percentage - without float residue.

    ``correlation_confidence`` and the attribution signal weights are stored as
    fractions. Multiplied in markup they produced ``55.00000000000001%`` in a
    document about precision, so the multiplication lives here with the
    rounding that goes with it.
    """
    if value is None:
        return ABSENT
    try:
        return f"{float(value) * 100.0:.{digits}f}%"
    except (TypeError, ValueError):
        return ABSENT


def verification_base_url() -> str:
    """Origin a recipient can open, for links printed into documents."""
    override = str(getattr(settings, "EVIDENCE_VERIFICATION_BASE_URL", "") or "").strip()
    if override:
        return override.rstrip("/")
    return str(getattr(settings, "SITE_URL", "") or "https://reliastra.com").rstrip("/")


def label(token: Any, mapping: dict[str, str]) -> str:
    """Human label for an enum token, never the raw token."""
    if token is None or token == "":
        return ABSENT
    key = str(token)
    if key in mapping:
        return mapping[key]
    # Unmapped token: readable, and visibly a fallback rather than a lie.
    return key.replace("_", " ").strip().capitalize()


def _aware(value: Any) -> datetime | None:
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def utc_stamp(value: Any, *, seconds: bool = True) -> str:
    """``11 Sep 2026, 09:44:00 UTC`` - the format the whole document uses.

    Month-day-year with an explicit zone, because the readers of this document
    are in a dispute about *when* something happened and ``2026-09-11T09:44``
    invites a local-time misread in the one place it would be expensive.
    """
    dt = _aware(value)
    if dt is None:
        return ABSENT
    utc = dt.astimezone(timezone.utc)
    hms = f"{utc:%H:%M:%S}" if seconds else f"{utc:%H:%M}"
    return f"{utc.day} {MONTHS[utc.month - 1]} {utc.year}, {hms} UTC"


def utc_date(value: Any) -> str:
    dt = _aware(value)
    if dt is None:
        return ABSENT
    utc = dt.astimezone(timezone.utc)
    return f"{utc.day} {MONTHS[utc.month - 1]} {utc.year}"


def int_grouped(value: Any) -> str:
    try:
        return f"{int(value):,}"
    except (TypeError, ValueError):
        return ABSENT


def percent(value: Any, digits: int = 4) -> str:
    """Percentage with explicit precision. ``None`` is an absence, not 0."""
    if value is None:
        return ABSENT
    try:
        return f"{float(value):.{digits}f}%"
    except (TypeError, ValueError):
        return ABSENT


def milliseconds(value: Any, digits: int = 1) -> str:
    if value is None:
        return ABSENT
    try:
        return f"{float(value):.{digits}f} ms"
    except (TypeError, ValueError):
        return ABSENT


def seconds(value: Any) -> str:
    """Seconds, formatted as seconds - never a raw float with 17 digits."""
    if value is None:
        return ABSENT
    try:
        return f"{float(value):.0f} s"
    except (TypeError, ValueError):
        return ABSENT


def duration(value: Any) -> str:
    """``35 min 25 s``. Duration of an outage is quoted in words, not seconds."""
    if value is None:
        return ABSENT
    try:
        total = round(float(value))
    except (TypeError, ValueError):
        return ABSENT
    if total < 60:
        return f"{total} s"
    days, rest = divmod(total, 86400)
    hours, rest = divmod(rest, 3600)
    minutes, secs = divmod(rest, 60)
    parts: list[str] = []
    if days:
        parts.append(f"{days} d")
    if hours:
        parts.append(f"{hours} h")
    if minutes:
        parts.append(f"{minutes} min")
    if secs and not days:
        parts.append(f"{secs} s")
    return " ".join(parts) or "0 s"


def window_phrase(start: Any, end: Any) -> str:
    start_dt, end_dt = _aware(start), _aware(end)
    if start_dt is None or end_dt is None:
        return ABSENT
    same_day = start_dt.astimezone(timezone.utc).date() == end_dt.astimezone(
        timezone.utc
    ).date()
    tail = utc_stamp(end_dt)
    if same_day:
        end_utc = end_dt.astimezone(timezone.utc)
        tail = f"{end_utc:%H:%M:%S} UTC"
    return f"{utc_stamp(start_dt)} \u2013 {tail}"


def report_reference(
    dependency_name: str, started_at: Any, incident_id: str, *, issuer: str = "RA"
) -> str:
    """A citation handle a human can say out loud: ``RA-20260911-OPENAI-3BD6A``.

    Deterministic from the incident, so re-generating the same facts produces
    the same reference, and a reference quoted in an email resolves to a record
    without exposing a UUID. The tail is the incident id, not a random token:
    two documents describing one incident must not look like two incidents.
    """
    dt = _aware(started_at)
    stamp = dt.astimezone(timezone.utc).strftime("%Y%m%d") if dt else "00000000"
    slug = "".join(
        ch for ch in (dependency_name or "dependency").upper() if ch.isalnum()
    )[:10] or "DEP"
    tail = str(incident_id).replace("-", "")[-5:].upper()
    return f"{issuer}-{stamp}-{slug}-{tail}"


def api_base_url() -> str:
    """Origin of the JSON API as a browser can reach it.

    The document prints both addresses a reader may want: the human page and
    the raw record. They are not the same path, because the API is reached
    through the web app's proxy rather than at the API service's own origin -
    a link that only works inside our network is not a link.
    """
    return f"{verification_base_url()}/api"


def verify_api_url(verification_id: str) -> str:
    return f"{api_base_url()}/v1/verify/{verification_id}"


def keys_api_url() -> str:
    return f"{api_base_url()}/v1/verify/keys"


def verification_url(verification_id: str) -> str:
    """The public URL a recipient can actually open.

    This used to be missing entirely: the artifact printed a verification id and
    no address, so the one claim it made that anyone could check was not
    checkable without reading our API docs.
    """
    return f"{verification_base_url()}/reports/{verification_id}"


def latency_line(metrics: dict[str, Any]) -> str:
    """One line of latency statistics, from the window's own measurements."""
    if metrics.get("avg_latency_ms") is None:
        return f"no successful measurement in window{'' if metrics.get('measured_checks') else ' (no measured checks)'}"
    return (
        f"mean {milliseconds(metrics.get('avg_latency_ms'))} · "
        f"p50 {milliseconds(metrics.get('p50_latency_ms'))} · "
        f"p95 {milliseconds(metrics.get('p95_latency_ms'))} · "
        f"min {milliseconds(metrics.get('min_latency_ms'))} · "
        f"max {milliseconds(metrics.get('max_latency_ms'))}"
    )


@dataclass(frozen=True)
class Tile:
    """One of the four figures at the top of the document."""

    label: str
    value: str
    note: str


def metric_tiles(
    metrics: dict[str, Any], impact: dict[str, Any], attribution: dict[str, Any] | None
) -> list[Tile]:
    """The four numbers the reader is looking for, stated before the detail.

    Availability and downtime come from the incident window; the availability
    note carries the denominator, because a percentage without one is the exact
    defect RELIASTRA's own measurement-integrity paper describes.
    """
    measured = metrics.get("measured_checks") or 0
    availability = metrics.get("availability_pct")
    tiles = [
        Tile(
            "Incident window",
            duration(metrics.get("window_seconds")),
            utc_stamp(metrics.get("window_start"), seconds=False)
            + " \u2192 "
            + (
                utc_stamp(metrics.get("window_end"), seconds=False)
                if metrics.get("window_end")
                else "open"
            ),
        ),
        Tile(
            "Measured availability",
            percent(availability, 2) if availability is not None else ABSENT,
            (
                f"{int_grouped(metrics.get('up_checks'))} of {int_grouped(measured)} "
                f"measured checks reached the target"
            ),
        ),
        Tile(
            "Measured downtime",
            duration(impact.get("measured_downtime_seconds")),
            f"inside a {duration(metrics.get('window_seconds'))} window, "
            f"{int_grouped(metrics.get('down_checks'))} failed check(s)",
        ),
        Tile(
            "Attribution",
            label(attribution.get("classification"), CLASSIFICATION_LABELS)
            if attribution
            else "Not asserted",
            (
                f"{percent(attribution.get('confidence_score'), 2)} confidence · "
                f"{attribution.get('methodology_version', 'methodology unstated')}"
                if attribution
                else "no attribution result was recorded for this incident"
            ),
        ),
    ]
    return tiles


def verdict_sentences(
    *,
    dependency_name: str,
    endpoint_url: str,
    metrics: dict[str, Any],
    impact: dict[str, Any],
    attribution: dict[str, Any] | None,
    detection: dict[str, Any],
    topology: dict[str, Any],
    incident: dict[str, Any],
) -> list[str]:
    """What happened, in the document's own words, from measured facts only.

    Every sentence here is a restatement of a figure that appears below it. No
    sentence may add a fact: no causation claim beyond the attribution engine's
    own, no liability language, no "guaranteed", nothing about the vendor's
    intent. Where the record is thin, that is said, because the alternative is
    a confident paragraph on top of a cautious table.
    """
    out: list[str] = []
    down = metrics.get("down_checks") or 0
    measured = metrics.get("measured_checks") or 0
    availability = metrics.get("availability_pct")
    span = duration(metrics.get("window_seconds"))

    if measured == 0:
        out.append(
            f"Between {utc_stamp(metrics.get('window_start'))} and "
            f"{utc_stamp(metrics.get('window_end'))}, RELIASTRA recorded no check "
            f"that reached {dependency_name}. This document therefore states no "
            f"availability figure for the window, and none is implied by its "
            f"absence."
        )
        return out

    out.append(
        f"{down} of {measured} checks issued to {endpoint_url} failed inside a "
        f"{span} window beginning {utc_stamp(metrics.get('window_start'))}. "
        f"Measured availability for the window is {percent(availability)}, "
        f"computed from these checks only."
    )

    run = metrics.get("longest_failure_run") or 0
    if run > 1:
        out.append(
            f"The longest unbroken run of failed checks was {run}, at "
            f"{topology.get('observation_point_count', 1)} observation point(s). "
            f"The detection rule that opened this incident was recorded as "
            f"\u201c{detection.get('rule_label') or 'not recorded'}\u201d."
        )

    # Both spellings: the dataclass attribute is ``blocked_checks``, the
    # canonical payload key is ``blocked_checks_excluded``. The exclusion must be
    # disclosed whichever object a caller passes, because a withheld exclusion is
    # a silent narrowing of the record.
    blocked = metrics.get("blocked_checks") or metrics.get("blocked_checks_excluded") or 0
    if blocked:
        out.append(
            f"{blocked} scheduled check(s) were refused by RELIASTRA's outbound "
            f"security policy and are excluded from every figure above. They are "
            f"not counted as downtime at the dependency: they were never issued."
        )

    if attribution:
        out.append(
            f"The attribution engine classified this as "
            f"\u201c{label(attribution.get('classification'), CLASSIFICATION_LABELS)}"
            f"\u201d at {percent(attribution.get('confidence_score'), 2)} confidence "
            f"under methodology {attribution.get('methodology_version', 'v1.0')}. "
            f"That classification describes what the timelines support, not "
            f"fault or liability."
        )
    else:
        out.append(
            "No deterministic attribution result was recorded for this incident, "
            "so this document asserts none. The measurements above stand on their "
            "own."
        )

    if not topology.get("independent_confirmation"):
        out.append(
            "Every observation here was issued from a single RELIASTRA "
            "observation point. Confirmation is by persistence of failure over "
            f"{span}, not by agreement between independent points, and no "
            "cross-verification is claimed."
        )
    return out


def headline(
    *, incident: dict[str, Any], metrics: dict[str, Any], dependency_name: str
) -> str:
    """The one line a reader quotes. Derived, never templated with a fake."""
    status = label(incident.get("status"), STATUS_LABELS)
    measured = metrics.get("measured_checks") or 0
    if measured == 0:
        return f"{dependency_name}: no measurement inside the recorded window"
    availability = percent(metrics.get("availability_pct"), 2)
    severity = label(incident.get("severity"), SEVERITY_LABELS)
    verb = "resolved" if status == "Resolved" else status.lower()
    return (
        f"{severity} dependency event on {dependency_name} - {verb}: "
        f"{availability} measured availability over {duration(metrics.get('window_seconds'))}"
    )


def rows_for_table(pairs: Iterable[tuple[str, Any]]) -> list[dict[str, str]]:
    """``[{term, value}]`` with every value already formatted."""
    return [{"term": term, "value": str(value)} for term, value in pairs]
