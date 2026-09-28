import math
from collections import Counter
from typing import Any, Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.attribution.models import AttributionResult
from app.modules.incidents.repository import IncidentRepository

#: Transport outcomes where **no HTTP response was received at all**.
#:
#: These are the failure modes that are genuinely ambiguous about *whose* fault
#: the outage is. A 503 is evidence about the vendor: they answered us, and the
#: answer was a refusal. A DNS failure, a TLS failure or a connection error is
#: equally consistent with "the vendor is unreachable" and "our single
#: observation point cannot reach anything at all" - including a resolver
#: outage, an expired trust store, or our own egress being blocked.
#:
#: Under one observation point those two states are indistinguishable, so
#: blaming a vendor on this evidence alone is a guess. The signal exists to
#: refuse that guess rather than to manufacture confidence.
OBSERVER_INCONCLUSIVE_TRANSPORT = frozenset(
    {"dns_error", "tls_error", "connection_error", "timeout", "unknown"}
)


class AttributionEngine:
    """Deterministic multi-signal attribution engine. No AI is involved."""

    WEIGHTS = {
        "temporal": 0.20,
        "endpoint_overlap": 0.25,
        "latency_correlation": 0.25,
        "error_pattern": 0.15,
        "infrastructure_baseline": 0.15,
    }
    METHODOLOGY_VERSION = "v1.1"

    #: Signals that require a second, independent source of evidence.
    #:
    #: ``temporal`` (another incident open in the same window) and
    #: ``endpoint_overlap`` (a correlated incident on a shared endpoint) are the
    #: corroboration pair. With one observation point watching one dependency
    #: they are both 0.0, so the highest score reachable in that configuration is
    #: ``latency + error_pattern + infrastructure_baseline`` = 0.55 -> 55.0.
    #:
    #: That is not a bug and the threshold is deliberately left where it is: one
    #: probe failing twice is weak evidence about whose fault an outage is, so
    #: ``vendor_failure`` at 75 requires a second source. Recording the ceiling
    #: alongside the score stops a reader from treating 55.0 as a missed verdict
    #: rather than the honest maximum for what was observed.
    CORROBORATION_SIGNALS = ("temporal", "endpoint_overlap")

    @classmethod
    def max_achievable(cls, scores: dict[str, float]) -> float:
        """Highest score the observed signal set could have produced."""
        return round(
            sum(
                cls.WEIGHTS[name]
                for name in cls.WEIGHTS
                if name not in cls.CORROBORATION_SIGNALS
            )
            * 100,
            2,
        )

    async def compute_attribution(
        self,
        session: AsyncSession,
        incident: Any,
        observations: Sequence[Any],
        infrastructure_ok: bool | None = None,
    ) -> AttributionResult:
        """Compute five normalized signals and a reproducible confidence score.

        ``infrastructure_ok`` overrides the observer-health signal. Leave it
        ``None`` - the only correct default - and the signal is *measured* from
        the observations: it reports degraded when every failure in the window
        is a transport failure that received no HTTP response, which is the
        state in which this system cannot tell a vendor outage from its own
        inability to reach anything.

        It previously defaulted to ``True`` and was never passed, so the signal
        was a constant 1.0: a free 0.15 of "confidence" that measured nothing,
        with ``infrastructure_issue`` unreachable dead code while the public site
        advertised the classification.
        """
        observer_ok = (
            self._signal_infrastructure(observations)
            if infrastructure_ok is None
            else bool(infrastructure_ok)
        )
        scores = {
            "temporal": await self._signal_temporal(session, incident),
            "endpoint_overlap": await self._signal_endpoint_overlap(
                session, incident
            ),
            "latency_correlation": self._signal_latency_correlation(
                observations
            ),
            "error_pattern": self._signal_error_pattern(observations),
            "infrastructure_baseline": 1.0 if observer_ok else 0.0,
        }
        scores = {name: round(value, 4) for name, value in scores.items()}
        confidence = round(
            sum(scores[name] * self.WEIGHTS[name] for name in self.WEIGHTS)
            * 100,
            2,
        )
        if confidence >= 75:
            classification = "vendor_failure"
        elif confidence >= 50:
            classification = "multi_cause"
        elif not observer_ok:
            classification = "infrastructure_issue"
        else:
            classification = "unknown"

        return AttributionResult(
            incident_id=incident.id,
            org_id=incident.org_id,
            suspected_dependency_id=incident.dependency_id,
            classification=classification,
            confidence_score=confidence,
            signal_breakdown=scores,
            supporting_evidence=self._collect_supporting(
                observations, scores
            ),
            contradicting_evidence=self._collect_contradicting(scores),
            methodology_version=self.METHODOLOGY_VERSION,
        )
    async def _signal_temporal(
        self, session: AsyncSession, incident: Any
    ) -> float:
        from app.modules.incidents.constants import TEMPORAL_WINDOW_SECONDS

        others = await IncidentRepository.list_open_in_window(
            session,
            incident.org_id,
            incident.started_at,
            window_seconds=TEMPORAL_WINDOW_SECONDS,
            exclude_incident_id=incident.id,
        )
        return 1.0 if others else 0.0

    async def _signal_endpoint_overlap(
        self, session: AsyncSession, incident: Any
    ) -> float:
        """Was a failing endpoint shared with the suspected dependency?

        Binary on purpose. The signal answers "did a correlated failure touch an
        endpoint this dependency also serves", and a correlation existing *is*
        that answer; the correlation's own ``correlation_confidence`` is separate
        information and is reported alongside, not folded in here.

        Folding it in left the signal mathematically unable to reach its own
        weight: every auto-created correlation carries
        ``DEFAULT_CORRELATION_CONFIDENCE`` (0.85), so the signal contributed at
        most 0.2125 of a stated 0.25. The published weight was unreachable in
        exactly the case the weight exists to reward.
        """
        correlations = await IncidentRepository.get_correlations(
            session, incident.id
        )
        return 1.0 if correlations else 0.0

    @staticmethod
    def _signal_latency_correlation(observations: Sequence[Any]) -> float:
        """Score latency instability using a bounded coefficient of variation."""
        latencies = [
            max(0.0, float(item.latency_ms))
            for item in observations
            if item is not None and item.latency_ms is not None
        ]
        if len(latencies) < 2:
            return 0.0
        mean = sum(latencies) / len(latencies)
        variance = sum((value - mean) ** 2 for value in latencies) / len(
            latencies
        )
        coefficient = math.sqrt(variance) / (mean + 1.0)
        return min(1.0, max(0.0, coefficient))

    @staticmethod
    def _signal_infrastructure(observations: Sequence[Any]) -> bool:
        """Was the observation point itself plausibly healthy during the window?

        Measured, not asserted. The test is whether the probe managed to talk to
        *anyone*:

        * A failure that came back as an HTTP response proves the request left
          our host, resolved, completed a TLS handshake and reached the far end.
          The observer was working, so ``True`` regardless of what the status
          said.
        * A window with at least one successful check also proves the observer
          was working, which is what makes a *later* transport failure
          attributable to the dependency rather than to us.
        * Otherwise every failure is a transport failure with no response, and
          this single observation point has no way to tell a vendor outage from
          its own resolver, trust store or egress failing. ``False``.

        An empty window is ``True``: with nothing observed there is no evidence
        of observer failure, and defaulting to ``False`` would make the signal
        assert a degradation nobody measured.
        """
        usable = [o for o in observations if o is not None]
        if not usable:
            return True
        for observation in usable:
            if getattr(observation, "status_code", None) is not None:
                return True
        for observation in usable:
            if getattr(observation, "error_type", None) in (None,):
                return True

        transport = set()
        for observation in usable:
            error_type = getattr(observation, "error_type", None)
            metadata = getattr(observation, "observation_metadata", None)
            kind = None
            if isinstance(metadata, dict):
                inner = metadata.get("observation")
                if isinstance(inner, dict):
                    kind = inner.get("transport_status")
            if kind is None:
                kind = (
                    "http_response"
                    if getattr(observation, "status_code", None) is not None
                    else error_type or "unknown"
                )
            transport.add(kind)

        return not transport.issubset(OBSERVER_INCONCLUSIVE_TRANSPORT)

    @staticmethod
    def _signal_error_pattern(observations: Sequence[Any]) -> float:
        errors = [
            str(item.error_type)
            for item in observations
            if item is not None and item.error_type
        ]
        if not errors:
            return 0.0
        counts = Counter(errors)
        # A single dominant error pattern across regions strongly supports a
        # shared external cause; mixed failures reduce the score.
        return max(counts.values()) / len(errors)

    @staticmethod
    def _collect_supporting(
        observations: Sequence[Any], scores: dict[str, float]
    ) -> list[dict[str, Any]]:
        evidence = [
            {
                "observation_id": str(item.id),
                "timestamp": item.timestamp.isoformat(),
                "region": item.region,
                "error_type": item.error_type,
            }
            for item in observations
            if item is not None
            and (item.error_type is not None or item.status_code is None)
        ]
        for signal, score in scores.items():
            if score >= 0.5:
                evidence.append(
                    {"type": "signal", "signal": signal, "score": score}
                )
        return evidence

    @staticmethod
    def _collect_contradicting(
        scores: dict[str, float]
    ) -> list[dict[str, Any]]:
        return [
            {"type": "signal", "signal": signal, "score": score}
            for signal, score in scores.items()
            if score < 0.5
        ]


attribution_engine = AttributionEngine()
