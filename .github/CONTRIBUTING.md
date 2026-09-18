# Contributing to RELIASTRA

RELIASTRA is building infrastructure for understanding dependencies and producing
evidence around incidents involving external systems. The engineering problem is
not simply detecting an error: it is distinguishing application failure,
dependency failure, shared causes, regional or transient effects, and coincidence.

**Favor evidence over assertion.** Disagreement with the current methodology is
useful. Technically justified criticism, counterexamples, and reproducible
negative results are welcome. A deterministic score is not a calibrated
probability; a signed artifact is not proof of causality; a region label is not
proof of an independent observation point.

## Where to start

This is the canonical [ReliaAstra/Reliastra](https://github.com/ReliaAstra/Reliastra)
repository. The earlier Frontend and Reliastra-backend repositories are references,
not the place for new implementation work. The default branch is `main`.

- [README and development setup](../README.md)
- [Architecture and source map](../docs/architecture/OVERVIEW.md)
- [Check execution contract](../docs/checks-operating-model.md)
- [Incident and evidence lifecycle](../docs/operations/incident-evidence-lifecycle.md)
- [Existing CLI](../cli/README.md)
- [Engineering roadmap](../docs/ROADMAP.md)

Useful contributions include observability integrations and telemetry, probe
infrastructure, vendor adapters, incident analysis, attribution methodology, APIs,
CLI and SDK/integration tooling, data modeling, reliability, testing, security,
and documentation grounded in actual implementation. A well-supported report of
an incorrect conclusion can be as useful as new code.

## From a question to a change

1. **Search first.** Inspect the code, open/closed
   [issues](https://github.com/ReliaAstra/Reliastra/issues), pull requests, and
   [Discussions](https://github.com/ReliaAstra/Reliastra/discussions) before opening
   another thread. Reuse an existing issue where the work overlaps.
2. **Discuss architectural questions.** Open or join a Discussion for a data
   model, attribution assumption, evidence requirement, or cross-cutting design.
   Explain alternatives, failure cases, and what would disprove the proposal.
   **Discussions is pending administrator enablement**; the
   [initial questions and setup status](../docs/engineering/discussion-starters.md)
   are available now. Until it is enabled, use an engineering proposal issue
   and state that you are requesting design review rather than implementation;
   maintainers can apply the `question` label.
3. **Use an issue for concrete work.** State the observed problem, why it matters,
   proposed scope, affected modules, acceptance criteria, and testing strategy.
   Link the design discussion when one exists. Comment before starting a large
   change to reduce conflicting work; do not assume a roadmap item is assigned.
4. **Submit a focused pull request against `main`.** Link its issue and discussion.
   Explain design decisions, alternatives, limitations, and compatibility rather
   than only listing changed files. Keep unrelated refactors separate.
5. **Include tests and operational consequences.** Report the commands you ran,
   their results, and anything untested. Document migrations, configuration,
   resource cost, failure behavior, observability, deployment, and rollback when
   relevant. Never present a mocked test as evidence of production operation.

## Report a concrete problem

Use the bug-report form for incorrect behavior. Include the revision, component,
UTC incident/observation windows, topology, expected and actual result, and the
smallest sanitized reproduction. For an attribution problem, include both
supporting and contradictory observations, missing data, and methodology version
if available. A synthetic fixture is preferable to a customer dataset.

State whether an observation is from a real independent origin or just a
configured label. An empty history can mean the probe pipeline never ran; it
must not automatically be reported as dependency health or downtime.

Do not paste `.env` files, headers, tokens, signed download URLs, private hostnames,
customer identifiers, request/response bodies, or unredacted logs. Replace them
with synthetic values. Report vulnerabilities through the
[private security channel](SECURITY.md), not a public issue or Discussion.

## Implementation conventions

- The FastAPI backend uses domain modules under `backend/app/modules/`, usually
  `router.py → service.py → repository.py → models.py`, with Pydantic schemas.
  Keep authorization at API boundaries and tenant constraints in data access.
- Extend the existing `/v1/*` API and [`cli/`](../cli/), rather than creating a
  parallel client protocol. API changes belong in the
  [API changelog](../backend/docs/API_CHANGELOG.md); assess existing frontend,
  CLI, webhook, and other client compatibility.
- Checks run through Celery workers and **Celery Beat is the only scheduler**.
  Do not add an API-process fallback. Customer observations use the existing
  transactional outbox; account for retries, redelivery, and commit order.
- Preserve the distinction between public `vendor_probe` data and tenant-scoped
  `customer_check` data. A new integration must not publish private telemetry.
- Attribution already stores signal breakdowns and a methodology version.
  Evidence already has snapshots, canonical hashes, optional signatures, and
  explicit unsigned behavior. Extend these contracts instead of bypassing them.
  Record methodology changes and make missing/contradictory evidence visible.

## Local checks

Follow the README for runtime setup. Use isolated test configuration, not a
production database or production provider credentials. Python 3.11+ is required;
CI uses Python 3.12 and Node.js 20. The CLI supports Node.js 18.17+.

```bash
# Backend: from the repository root, after creating/activating a virtualenv
(cd backend && python -m pip install -r requirements.txt && python -m pip install -e '.[dev]')
python -m pip install ruff
(cd backend && python -m pytest -v)
(cd backend && python -m ruff check app/ tests/)
(cd backend && python -m ruff format --check app/ tests/)

# Frontend
(cd frontend && npm install && npx prisma generate)
(cd frontend && npm run lint && npm run typecheck && npm test)

# Existing CLI: no runtime or test dependencies to install
(cd cli && npm test && npm run lint)
node cli/bin/reliastra.mjs --help
```

Backend fixtures use embedded PostgreSQL (`pgserver`), FakeRedis, an in-memory
Celery transport, and provider mocks. They are not proof of a live regional
fleet or a working production collector. Read
[`backend/tests/conftest.py`](../backend/tests/conftest.py) before adding external
services to a test. Frontend unit tests use Vitest; browser tests live in
`frontend/e2e/` and need the setup appropriate to the affected workflow. CLI tests
exercise commands against a local mock HTTP server.

For a focused change, start with the affected tests, then run the relevant suites.
Document any pre-existing failures without claiming they passed. Current workflow
behavior is defined in [CI](workflows/ci.yml); do not assume every command above is
already enforced there. Documentation-only changes should check links, commands,
source references, and any issue-form YAML.

## Engineering review checklist

- **Evidence and reproducibility:** fix the input window, source identity, time
  semantics, ordering, missing-data rules, and methodology version. Add fixtures
  for false positives/negatives, gaps, conflicting regions, and empty windows.
  Freeze external inputs for replay; do not silently use today's mutable state.
- **Tests and compatibility:** cover new behavior and regressions, API response
  shapes/status codes, schema migrations, retries, and old artifacts/clients.
  Explain any intentional behavior change and migration/rollback path.
- **Authentication and authorization:** use existing session/API-key scopes,
  organization membership and RBAC. Test denied access and cross-tenant resource
  access, not only successful requests. A resource ID is not authorization.
- **Input validation and SSRF:** preserve pinned DNS resolution and validation of
  every redirect in `backend/app/core/ssrf_protection.py` and the HTTP probe path.
  Never weaken private/loopback/link-local/metadata-address protections to make a
  test or new adapter work. Do not forward credentials across redirect origins.
- **Rate limits and isolation:** bound timeouts, retries, queues, pagination,
  payload sizes, vendor requests, metric cardinality, and export cost. Handle
  backpressure without inventing observations or changing dependency conclusions.
- **Auditability and operations:** record security-relevant changes and provenance
  without credentials or customer payloads. Explain worker/scheduler effects,
  failure isolation, health checks, retention, and safe rollback. A probe-system
  failure must remain distinguishable from a dependency failure.

## Licensing scope

Public repository visibility is not a blanket license grant. The root README
currently declares proprietary terms; `cli/package.json` declares Apache-2.0,
and research subdirectories contain their own licenses. Check the applicable
scope and ask maintainers to clarify any ambiguity before reusing or contributing
material whose terms are unclear. This guide does not change licensing, impose
a new contributor agreement, or grant rights over someone else's data or code.
