#!/usr/bin/env python3
"""Audit a published availability record.

Three checks, in the order that makes them cheapest to run:

  1. WINDOW MONOTONICITY   Nested windows must return non-decreasing
                           observation counts, and identical aggregates across
                           nested windows mean those windows are describing one
                           identical set of observations.

  2. HISTORY DEPTH         count x interval is how long the returned history
                           actually spans. Compare it with the longest window
                           the record offers.

  3. OBSERVATION DENSITY   observed / expected per window. A density that
                           falls as the window grows is the signature of
                           shallow history, not of a failing endpoint.

Optionally, --estimators compares three ways of recovering the probe interval
from a bucketed timeline. The first is the estimator RELIASTRA shipped and got
wrong; the other two are resolution-independent.

Stdlib only. Runs offline against the captured payloads in ./data, or live
against the public measurement API with --base/--vendor.

Exit status is 0 when every check passes, 1 when any fails - so this can run
as a continuous control rather than a one-off investigation.

Paper: https://reliastra.com/research/measurement-integrity/availability-record-audit
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"

#: The windows the measurement API aggregates, in seconds. Mirrors
#: `_WINDOW_HOURS` in backend/app/modules/vendors/service.py.
WINDOW_SECONDS = {
    "1h": 3600,
    "6h": 21600,
    "24h": 86400,
    "7d": 604800,
    "30d": 2592000,
    "90d": 7776000,
}

#: Seconds per bucket, keyed by the resolution label the API reports.
RESOLUTION_SECONDS = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600, "6h": 21600}

#: A window whose density falls below this is reported as under-filled.
DENSITY_FLOOR = 0.90


# ── Loading ────────────────────────────────────────────────────────────────


def load_captured() -> tuple[dict, dict]:
    """The two captured payloads this audit is built on."""
    metrics = json.loads(
        (DATA / "reliastra-openai-metrics-2026-09-11T1134Z.json").read_text()
    )
    timeline = json.loads(
        (DATA / "reliastra-openai-timeline-1h-1m-2026-09-11T1139Z.json").read_text()
    )
    return metrics, timeline


def fetch(base: str, vendor: str, window: str, resolution: str) -> tuple[dict, dict]:
    """Read the same two payloads live. Read-only; no state is mutated."""

    def get(path: str) -> dict:
        req = urllib.request.Request(
            f"{base.rstrip('/')}{path}", headers={"Accept": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())

    metrics = get(f"/vendors/{vendor}/metrics")
    timeline = get(f"/vendors/{vendor}/timeline?window={window}&resolution={resolution}")
    return metrics, timeline


# ── Interval estimators ────────────────────────────────────────────────────


def estimate_density(timeline: dict) -> int | None:
    """bucket / mean observations per occupied bucket.

    The estimator RELIASTRA shipped. Bounded above by the bucket length: an
    occupied bucket holds at least one observation, so the mean is never below
    1 and the quotient never exceeds the bucket. For any schedule sparser than
    the resolution it returns the resolution.
    """
    bucket = RESOLUTION_SECONDS.get(timeline.get("resolution", ""))
    points = timeline.get("points") or []
    if not bucket or not points:
        return None
    counts = [p["observation_count"] for p in points if p["observation_count"] > 0]
    if not counts:
        return None
    return round(bucket / (sum(counts) / len(counts)))


def estimate_spacing(timeline: dict) -> int | None:
    """Median delta between consecutive occupied bucket starts.

    Resolution-independent in the regime that matters: it reads how far apart
    observations are, not how many share a bucket.
    """
    from datetime import datetime

    starts = []
    for p in timeline.get("points") or []:
        if p["observation_count"] > 0:
            ts = p["timestamp"].replace("Z", "+00:00")
            starts.append(datetime.fromisoformat(ts).timestamp())
    if len(starts) < 2:
        return None
    starts.sort()
    deltas = [b - a for a, b in zip(starts, starts[1:]) if b - a > 0]
    if not deltas:
        return None
    return round(statistics.median(deltas))


def estimate_count(timeline: dict) -> int | None:
    """Window length / total observations.

    Also resolution-independent, but assumes the window is fully covered by
    history - which a brand-new dependency's window is not.
    """
    from datetime import datetime

    points = timeline.get("points") or []
    total = sum(p["observation_count"] for p in points)
    if not total:
        return None
    try:
        a = datetime.fromisoformat(timeline["from"].replace("Z", "+00:00"))
        b = datetime.fromisoformat(timeline["to"].replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return None
    return round((b - a).total_seconds() / total)


def true_interval(timeline: dict) -> int | None:
    """The interval read directly off the captured bucket starts."""
    return estimate_spacing(timeline)


# ── The three checks ───────────────────────────────────────────────────────


def audit(metrics: dict, interval: int) -> tuple[list[list[str]], list[str]]:
    """Return (audit table, list of failures)."""
    rows: list[list[str]] = []
    failures: list[str] = []
    aggregates: dict[str, tuple] = {}

    for label, window_seconds in WINDOW_SECONDS.items():
        m = (metrics.get("metrics") or {}).get(label)
        if not m:
            failures.append(f"window {label} absent from the metrics response")
            continue

        observed = int(m["total_observations"])
        expected = max(1, window_seconds // interval)
        density = observed / expected

        aggregates[label] = (
            observed,
            round(float(m["avg_latency_ms"]), 2),
            None if m.get("p95_latency_ms") is None else round(float(m["p95_latency_ms"]), 2),
        )

        rows.append(
            [
                label,
                f"{window_seconds:,}",
                f"{expected:,}",
                f"{observed:,}",
                f"{density * 100:.1f}%",
                f"{float(m['uptime_percentage']):.1f}%",
            ]
        )

        if density < DENSITY_FLOOR:
            failures.append(
                f"window {label}: density {density * 100:.1f}% "
                f"({observed:,} observed / {expected:,} expected)"
            )

    # Check 1 - monotonicity and aggregate identity across nested windows.
    ordered = [w for w in WINDOW_SECONDS if w in aggregates]
    previous = None
    for label in ordered:
        count = aggregates[label][0]
        if previous is not None and count < previous:
            failures.append(
                f"window {label}: {count:,} observations, fewer than a shorter window"
            )
        previous = count

    identical = [
        (a, b)
        for i, a in enumerate(ordered)
        for b in ordered[i + 1 :]
        if aggregates[a] == aggregates[b]
    ]
    for a, b in identical:
        failures.append(
            f"windows {a} and {b} return identical count, mean and p95 - "
            "they are aggregating one identical set of observations"
        )

    # Check 2 - history depth implied by the deepest window that has data.
    if ordered:
        deepest = ordered[-1]
        count = aggregates[deepest][0]
        hours = count * interval / 3600
        offered_hours = WINDOW_SECONDS[deepest] / 3600
        print(
            f"\nHistory depth: {count:,} observations x {interval}s "
            f"= {hours:.1f} h ({hours / 24:.2f} days)\n"
            f"               longest window offered: {offered_hours:.0f} h "
            f"({offered_hours / 24:.0f} days)\n"
            f"               the '{deepest}' availability figure is computed over "
            f"{count * interval / WINDOW_SECONDS[deepest] * 100:.1f}% of its labelled window"
        )
        if hours < offered_hours:
            failures.append(
                f"the '{deepest}' window offers {offered_hours:.0f} h of labelled "
                f"history over {hours:.1f} h of actual observations"
            )

    return rows, failures


# ── Output ─────────────────────────────────────────────────────────────────


def print_table(rows: list[list[str]]) -> None:
    head = ["window", "seconds", "expected", "observed", "density", "availability"]
    widths = [max(len(h), *(len(r[i]) for r in rows)) for i, h in enumerate(head)]
    def render(cells: list[str]) -> str:
        return "  ".join(c.ljust(widths[i]) for i, c in enumerate(cells)).rstrip()

    print("\n" + render(head))
    print("  ".join("-" * w for w in widths))
    for r in rows:
        print(render(r))


def print_estimators(timeline: dict) -> None:
    truth = true_interval(timeline)
    print("\nInterval estimators over the captured series")
    print("-" * 62)
    for name, fn in (
        ("occupied-bucket density (shipped)", estimate_density),
        ("median inter-bucket delta (adopted)", estimate_spacing),
        ("window length / observation count", estimate_count),
    ):
        value = fn(timeline)
        mark = ""
        if value is not None and truth is not None:
            mark = "  correct" if value == truth else f"  off by {truth / value:.1f}x"
        print(f"  {name:<36} {str(value) + 's' if value else 'n/a':>6}{mark}")
    print(f"\n  interval read off the bucket starts: {truth}s")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--base", help="live API base, e.g. https://api.reliastra.com/v1")
    ap.add_argument("--vendor", default="openai")
    ap.add_argument("--window", default="1h")
    ap.add_argument("--resolution", default="1m")
    ap.add_argument(
        "--interval",
        type=int,
        default=300,
        help="probe interval in seconds (default 300, the declared default)",
    )
    ap.add_argument(
        "--estimators",
        action="store_true",
        help="compare the three interval estimators over the timeline",
    )
    ap.add_argument(
        "--csv",
        metavar="PATH",
        help="write the audit table as CSV, e.g. data/expected_observations.csv",
    )
    args = ap.parse_args()

    if args.base:
        print(f"live read: {args.base}/vendors/{args.vendor}")
        metrics, timeline = fetch(args.base, args.vendor, args.window, args.resolution)
    else:
        print(f"offline audit against captured payloads in {DATA}")
        metrics, timeline = load_captured()

    print(f"interval used for expected counts: {args.interval}s")
    rows, failures = audit(metrics, args.interval)
    print_table(rows)

    if args.csv:
        import csv

        head = ["window", "window_seconds", "expected_observations",
                "total_observations", "density_ratio", "uptime_percentage"]
        with open(args.csv, "w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(head)
            for r in rows:
                w.writerow([r[0], r[1].replace(",", ""), r[2].replace(",", ""),
                            r[3].replace(",", ""),
                            f"{float(r[4].rstrip('%')) / 100:.4f}", r[5].rstrip("%")])
        print(f"\nwrote {args.csv}")

    if args.estimators:
        print_estimators(timeline)

    print("\nChecks")
    print("-" * 62)
    if failures:
        for f in failures:
            print(f"  FAIL  {f}")
        print(f"\n{len(failures)} check(s) failed.")
        return 1
    print("  PASS  all windows monotonic, dense and distinct")
    return 0


if __name__ == "__main__":
    sys.exit(main())
