"""Digest content builders: canonical records in, draft text out.

Pure functions, no I/O, no wall-clock: every value in the output is a fact
of the input records or the explicitly passed window. The newsletter and
the social post are renderers over the same canonical incident detail
objects that power the public API, the HTML pages, the RSS feeds, and the
GitHub dataset - a fourth renderer, not a second source of truth.

The measurement statement is word-for-word the one the RSS builder emits
(``incidentItemDescription`` in the frontend's feed.ts): one claim phrasing
across every renderer, so a newsletter reader, a feed reader, and a dataset
consumer all see the same sentence for the same incident.
"""

from __future__ import annotations

import hashlib
import html
from datetime import date
from typing import Any

DIGEST_GENERATOR = "reliastra-digest/1.0"

#: Public digests link to the observatory; the path shape matches the
#: frontend's SHARE_ROUTES.observatoryIncident (vendor slug + incident id:
#: stable, human-readable, never a bare DB id in isolation).
OBSERVATORY_INCIDENTS_PATH = "/observatory/incidents"


def measurement_statement(detail: Any) -> str:
    """The exact observed-fact sentence for one incident.

    Mirrors feed.ts ``incidentItemDescription``: target preference, the
    consecutive-failures claim, the region, the window with an explicit
    open marker. No causes, no speculation.
    """
    target = detail.target_name or detail.endpoint_url
    started = _iso(detail.started_at)
    resolved = _iso(detail.resolved_at) if detail.resolved_at is not None else None
    window = f"{started} to {resolved}" if resolved else f"{started} (open)"
    return (
        f"RELIASTRA observed consecutive failed probes against {target} for "
        f"{detail.vendor_display_name} from {detail.region} during {window}."
    )


def incident_title(detail: Any) -> str:
    """Short headline, mirroring feed.ts ``incidentItemTitle``."""
    target = detail.target_name or detail.endpoint_url
    state = "resolved" if detail.resolved_at is not None else "open"
    return f"{detail.vendor_display_name} {target} failure window ({state})"


def incident_url(detail: Any, site_url: str) -> str:
    """Canonical public URL for one incident (vendor slug + incident id)."""
    return (
        f"{site_url.rstrip('/')}/observatory/"
        f"{detail.vendor_name}/incidents/{detail.incident_id}"
    )


def build_weekly_newsletter(
    details: list[Any],
    period_start: date,
    period_end: date,
    *,
    site_url: str,
) -> dict[str, str | None]:
    """Newsletter draft parts for one window.

    ``details`` are canonical incident detail objects (oldest first). An
    empty window produces an explicit "no confirmed incidents" issue: the
    absence is a fact about our records and is publishable as such.
    """
    start_s = period_start.isoformat()
    end_s = period_end.isoformat()
    if details:
        subject = (
            f"RELIASTRA weekly digest: {len(details)} confirmed "
            f"incident{'' if len(details) == 1 else 's'}, {start_s} to {end_s}"
        )
    else:
        subject = (
            f"RELIASTRA weekly digest: no confirmed incidents, "
            f"{start_s} to {end_s}"
        )

    lines = [
        "RELIASTRA weekly incident digest",
        f"Window: {start_s} to {end_s}",
        "",
    ]
    if details:
        for detail in details:
            lines.append(f"* {incident_title(detail)} [{detail.status}]")
            lines.append(f"  {measurement_statement(detail)}")
            lines.append(f"  Details and evidence: {incident_url(detail, site_url)}")
            lines.append("")
    else:
        lines.append(
            "No confirmed incidents were recorded in this window: RELIASTRA's "
            "probes observed no failure windows for the monitored public "
            "vendors during this period."
        )
        lines.append("")
    lines.append(
        "Every claim above comes from RELIASTRA's own endpoint-scoped probe "
        "observations in the listed region - not from vendor status pages. "
        f"Search all measured incidents: {site_url.rstrip('/')}"
        f"{OBSERVATORY_INCIDENTS_PATH}"
    )
    text_body = "\n".join(lines)

    html_body = _newsletter_html(details, period_start, period_end, site_url)
    return {"subject": subject, "text_body": text_body, "html_body": html_body}


def build_incident_social(detail: Any, *, site_url: str) -> dict[str, str | None]:
    """Social draft parts for one incident: facts plus the canonical link.

    A short post, suitable for any character-limited platform; nothing in
    it except the measurement statement, the lifecycle status, and the URL.
    """
    text_body = (
        f"{measurement_statement(detail)}\n"
        f"Status: {detail.status}.\n"
        f"Details and evidence: {incident_url(detail, site_url)}"
    )
    return {"subject": None, "text_body": text_body, "html_body": None}


def digest_content_hash(parts: dict[str, str | None]) -> str:
    """SHA-256 over the content tuple; the draft idempotency key.

    NUL-separated so field boundaries can never alias; html may be None
    (social drafts) and hashes as an explicit marker, not as empty.
    """
    digest = hashlib.sha256()
    for key in ("subject", "text_body", "html_body"):
        value = parts.get(key)
        if value is None:
            digest.update(b"\x00none")
        else:
            digest.update(value.encode("utf-8"))
        digest.update(b"\x00")
    return digest.hexdigest()


def _newsletter_html(
    details: list[Any],
    period_start: date,
    period_end: date,
    site_url: str,
) -> str:
    def esc(value: str) -> str:
        return html.escape(value, quote=True)

    parts = [
        "<h1>RELIASTRA weekly incident digest</h1>",
        (
            f"<p>Window: {esc(period_start.isoformat())} to "
            f"{esc(period_end.isoformat())}</p>"
        ),
    ]
    if details:
        parts.append("<ul>")
        for detail in details:
            url = incident_url(detail, site_url)
            parts.append(
                f"<li><strong>{esc(incident_title(detail))}</strong> "
                f"[{esc(detail.status)}]<br>"
                f"{esc(measurement_statement(detail))}<br>"
                f'<a href="{esc(url)}">Details and evidence</a></li>'
            )
        parts.append("</ul>")
    else:
        parts.append(
            "<p>No confirmed incidents were recorded in this window: "
            "RELIASTRA's probes observed no failure windows for the monitored "
            "public vendors during this period.</p>"
        )
    footer = (
        "Every claim above comes from RELIASTRA's own endpoint-scoped probe "
        "observations in the listed region - not from vendor status pages. "
        f'<a href="{esc(site_url.rstrip("/") + OBSERVATORY_INCIDENTS_PATH)}">'
        "Search all measured incidents</a>."
    )
    parts.append(f"<p>{footer}</p>")
    return "\n".join(parts)


def _iso(value: Any) -> str:
    """ISO-8601 rendering of datetimes (the API's own wire format)."""
    return value.isoformat()
