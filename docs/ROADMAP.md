# Engineering roadmap

This is a small set of reviewable work items, not a release schedule or a claim
that the capabilities are already complete. Issues carry scope, acceptance
criteria, implementation references, and open design questions. Challenge those
assumptions before adding another subsystem; see the
[contributor guide](../.github/CONTRIBUTING.md).

## Observability

- [OpenTelemetry export and telemetry integration contracts — #55](https://github.com/ReliaAstra/Reliastra/issues/55): choose observation semantics and validate Collector interoperability without compromising probe persistence or tenant isolation.
- [Extend existing Prometheus metrics — #56](https://github.com/ReliaAstra/Reliastra/issues/56): queue/heartbeat health, API and attribution instrumentation, bounded labels, and trustworthy worker scraping.

## Dependency Intelligence

- [Vendor adapter contract — #61](https://github.com/ReliaAstra/Reliastra/issues/61): reuse the vendor catalogue and safe HTTP transport; distinguish vendor-reported status from independent observations.
- [Dependency/incident modeling](engineering/discussion-starters.md#how-should-dependency-incidents-be-represented): review identities, windows, provenance, and revisable interpretations before selecting a new storage model. Discussion draft; no schema change is decided.
- [Deterministic incident replay — #58](https://github.com/ReliaAstra/Reliastra/issues/58): freeze complete inputs and compare methodologies without live probes or changes to issued artifacts.
- [Traceable attribution explanations — #60](https://github.com/ReliaAstra/Reliastra/issues/60): show derivations, contradictory evidence, missing inputs, and the limits of confidence scores.

## Developer Experience

- [Extend the existing CLI and compatible APIs — #57](https://github.com/ReliaAstra/Reliastra/issues/57): configuration updates and bounded, complete exports; fix paging contracts before claiming full-history extraction.
- SDK/integration tooling: use the [API compatibility work in #57](https://github.com/ReliaAstra/Reliastra/issues/57) and [telemetry contract in #55](https://github.com/ReliaAstra/Reliastra/issues/55) to identify concrete consumers. A new SDK is not yet an implementation commitment.

## Infrastructure

- [Independent probe region — #59](https://github.com/ReliaAstra/Reliastra/issues/59): registered origin identity, routing, ingestion, health, deployment security, and failure isolation; additional labels alone do not count as regions.
- Worker/scheduler reliability: [operational coverage in #56](https://github.com/ReliaAstra/Reliastra/issues/56) and [regional failure tests in #59](https://github.com/ReliaAstra/Reliastra/issues/59), preserving the current single-host behavior and one authoritative Beat scheduler.

Architectural review starts with the [four engineering questions](engineering/discussion-starters.md).
GitHub Discussions is pending administrator enablement; use the linked issues for
implementation work and interim design review. None of these items is implicitly
assigned or labeled as a beginner task.
