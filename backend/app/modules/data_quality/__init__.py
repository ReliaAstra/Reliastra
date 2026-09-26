"""Data quality: derived ops views over the measurement registry.

Phase 10 of the intelligence rollout. Three scan families, all DERIVED -
this module owns no tables, because a finding that disagrees with the
current rows is worse than no finding:

* ``dead_target``     - an active endpoint whose probe attempts in the
  window all failed (first contact never succeeded is the degenerate
  case). The registry risk table calls for flagging exactly this: a
  target that has never answered our probes is a registry mistake until
  proven otherwise, and measuring it silently poisons "no incidents"
  with "we never reached it".
* ``stale_registry``  - active endpoints never checked past a grace
  window, active checkpoints overdue by a multiple of their interval,
  and public vendors left with no active endpoints at all.
* ``broken_identity`` - malformed identity links (scheme/netloc), a
  plain-HTTP probe target, an empty display name, or a category outside
  the canonical taxonomy.

Report-only by design: the scan never mutates vendor or endpoint rows.
Deactivating a dead target suppresses measurement, so that decision
stays human, taken from this report.
"""

from app.modules.data_quality.service import (
    DATA_QUALITY_GENERATOR,
    BrokenIdentityFinding,
    DataQualityReport,
    DataQualityService,
    DeadTargetFinding,
    StaleRegistryFinding,
    data_quality_service,
)

__all__ = [
    "DATA_QUALITY_GENERATOR",
    "BrokenIdentityFinding",
    "DataQualityReport",
    "DataQualityService",
    "DeadTargetFinding",
    "StaleRegistryFinding",
    "data_quality_service",
]
