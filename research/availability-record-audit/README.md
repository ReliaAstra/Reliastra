# Availability-record audit

Reproducible artifact for
**[How much evidence stands behind a published availability figure?](https://reliastra.com/research/measurement-integrity/availability-record-audit)**
and **[Why an interval estimated from bucketed telemetry converges on the bucket length](https://reliastra.com/research/measurement-integrity/probe-interval-from-bucketed-telemetry)**,
published by RELIASTRA Research on 11 September 2026.

The canonical research lives on reliastra.com. This directory is the work: the
captured data, the audit that reads it, and the reproduction steps.

---

## Problem

Availability percentages are published without their denominators. A reader of
`100.00% over 90 days` cannot tell a figure computed from 25,920 observations
from one computed from 595. Both render identically, and both are quoted
identically by humans and by retrieval systems.

RELIASTRA publishes availability records. Before asking anyone to rely on one,
it is worth knowing whether the record can be audited from the outside. This
artifact audits RELIASTRA's own public record.

## Research question

> Can a reader of a published availability record determine, from the record
> itself, how much evidence stands behind each percentage it publishes?

## What is here

```
research/availability-record-audit/
├── README.md                 this file
├── audit.py                  the audit - stdlib Python 3, no dependencies
└── data/
    ├── reliastra-vendors-2026-09-11T1134Z.json            captured, unmodified
    ├── reliastra-openai-metrics-2026-09-11T1134Z.json     captured, unmodified
    ├── reliastra-openai-detail-2026-09-11T1139Z.json      captured, unmodified
    ├── reliastra-openai-timeline-1h-1m-2026-09-11T1139Z.json  captured, unmodified
    ├── openai-statuspage-summary-2026-09-11T1136Z.json    captured, unmodified
    └── expected_observations.csv                          derived by audit.py --csv
```

`data/` holds the raw responses exactly as returned. `expected_observations.csv`
is derived, not written by hand: it is the output of `audit.py --csv`, so it
cannot drift from the arithmetic.

## Architecture of the audit

The audit reads three things and computes three checks.

| Input | Source | Used for |
|---|---|---|
| Per-window aggregates | `GET /v1/vendors/{name}/metrics` | Checks 1-3 |
| Observation timeline | `GET /v1/vendors/{name}/timeline` | Interval estimation |
| Probe interval | declared default in the measurement system's source | Expected counts |

**Check 1 - window monotonicity.** Nested windows must return non-decreasing
observation counts. Identical count *and* mean *and* p95 across nested windows
means those windows aggregate one identical set of observations: two different
samples of a few hundred observations do not share a mean and a 95th percentile
to two decimal places.

**Check 2 - history depth.** `count x interval` is how long the returned
history actually spans. Compared against the longest window the record offers.

**Check 3 - observation density.** `observed / expected` per window. Flat
density means deep history. Falling density means the window extends past the
data - and that is a different diagnosis from a failing endpoint, which would
depress availability rather than observation count.

## Methodology

Six read-only HTTP GET requests against public, unauthenticated endpoints on
11 September 2026 between 11:34 and 11:39 UTC. No authenticated endpoint was
used. No request mutated state. No customer data was accessed. Each response
body was stored as returned.

Derivation rules:

```
expected_observations = floor(window_seconds / interval)
density               = total_observations / expected_observations
history_depth         ~ total_observations x interval
```

The interval is taken from the measurement system's declared default
(`check_interval_seconds = 300`, in
`backend/app/modules/dependencies/schemas.py`) and corroborated against bucket
timestamps in the captured timeline. It is a script argument, not a constant,
because a deployment may override it - and because the record's *stated* cadence
turned out to be wrong (see below).

## Environment

Python 3.9 or newer. Standard library only - `argparse`, `json`, `csv`,
`statistics`, `urllib`, `datetime`. No install step.

## Experiment

### Offline, against the captured payloads

```bash
python3 research/availability-record-audit/audit.py --estimators
```

### Live, against the public API

```bash
python3 research/availability-record-audit/audit.py \
  --base https://api.reliastra.com/v1 \
  --vendor openai \
  --interval 300 \
  --estimators
```

### Regenerate the derived dataset

```bash
python3 research/availability-record-audit/audit.py \
  --csv research/availability-record-audit/data/expected_observations.csv
```

## Results

Output as produced by `audit.py` against the captured payloads:

```
interval used for expected counts: 300s

History depth: 595 observations x 300s = 49.6 h (2.07 days)
               longest window offered: 2160 h (90 days)
               the '90d' availability figure is computed over 2.3% of its labelled window

window  seconds    expected  observed  density  availability
------  ---------  --------  --------  -------  ------------
1h      3,600      12        12        100.0%   100.0%
6h      21,600     72        69        95.8%    100.0%
24h     86,400     288       277       96.2%    100.0%
7d      604,800    2,016     595       29.5%    100.0%
30d     2,592,000  8,640     595       6.9%     100.0%
90d     7,776,000  25,920    595       2.3%     100.0%

Interval estimators over the captured series
--------------------------------------------------------------
  occupied-bucket density (shipped)       60s  off by 5.0x
  median inter-bucket delta (adopted)    300s  correct
  window length / observation count      300s  correct

  interval read off the bucket starts: 300s

Checks
--------------------------------------------------------------
  FAIL  window 7d: density 29.5% (595 observed / 2,016 expected)
  FAIL  window 30d: density 6.9% (595 observed / 8,640 expected)
  FAIL  window 90d: density 2.3% (595 observed / 25,920 expected)
  FAIL  windows 7d and 30d return identical count, mean and p95 - ...
  FAIL  windows 7d and 90d return identical count, mean and p95 - ...
  FAIL  windows 30d and 90d return identical count, mean and p95 - ...
  FAIL  the '90d' window offers 2160 h of labelled history over 49.6 h of actual observations

7 check(s) failed.
```

Exit status is `1` when any check fails, so the script works as a continuous
control rather than a one-off investigation.

### The interval estimator

The second finding is a defect, not a disclosure gap. RELIASTRA's public record
estimated its own probe cadence as `bucket_length / mean observations per
occupied bucket`. That estimator is bounded above by the bucket length: an
occupied bucket holds at least one observation, so the mean is never below 1
and the quotient never exceeds the bucket. For any schedule sparser than the
resolution - a 300-second probe aggregated into one-minute buckets, which is the
deployed case - it returns the resolution.

The record printed "about every 60 seconds" for a dependency probed every 300
seconds, and printed 300 seconds for the same schedule elsewhere on the same
page, because a second component ran the same estimator over a 5-minute series
whose bucket length coincides with the true interval.

The estimator in `frontend/src/lib/track-api.ts` (`observedCadenceSeconds`) now
selects by regime: density when several observations share a bucket, median
inter-bucket spacing when they do not. The captured 12-point series is committed
as the regression fixture in
`frontend/src/lib/__tests__/observed-cadence.test.ts`, so the test cannot be
satisfied by a dense synthetic fixture that does not express the failure mode.

## Limitations

- One dependency, one endpoint, one observation origin, one read session.
- The 2.1-day history depth is inferred from aggregate identity plus
  count-over-interval arithmetic. A retention job, an aggregation cap and a
  scheduler that was not running are indistinguishable from the public API.
- The 300-second interval comes from a source default, corroborated against
  bucket timestamps - not from a public endpoint. Every expected count scales
  with it, which is why `--interval` is an argument.
- A 100.0% availability figure over 595 observations is not a weak measurement
  of a healthy endpoint. It is a weak measurement of a 90-day period. Nothing
  here claims the endpoint was unavailable at any point.
- RELIASTRA audited its own record. The captures are versioned so a third party
  can check the arithmetic independently.

## Related

- Paper: <https://reliastra.com/research/measurement-integrity/availability-record-audit>
- Paper: <https://reliastra.com/research/measurement-integrity/probe-interval-from-bucketed-telemetry>
- Paper: <https://reliastra.com/research/ai-infrastructure/status-page-payload-anatomy>
- The record under audit: <https://reliastra.com/track/openai>
- Measurement methodology: <https://reliastra.com/research/how-reliastra-measures-vendor-reliability>

## References

1. RELIASTRA public measurement API - vendor metrics, timeline and detail
   endpoints. Captured 11 September 2026. Versioned in `data/`.
2. `backend/app/modules/dependencies/schemas.py` - `check_interval_seconds`
   default of 300 seconds.
3. `backend/app/modules/vendors/service.py` - `_WINDOW_HOURS`, the six windows
   the API aggregates.
4. *Site Reliability Engineering*, chapter 4: Service Level Objectives.
   O'Reilly Media, 2016. <https://sre.google/sre-book/service-level-objectives/>
5. ISO 8601-1:2019, date and time representations. All timestamps here are UTC.
6. Prometheus documentation, `rate()` and the sampling-interval constraint.
   <https://prometheus.io/docs/prometheus/latest/querying/functions/#rate>

## License

Code: MIT. See [LICENSE](./LICENSE).

Captured payloads in `data/` are reproduced verbatim from public endpoints for
analysis. Copyright in the underlying material remains with its publisher. The
derived `expected_observations.csv` is RELIASTRA's own work and is released
under CC-BY-4.0.
