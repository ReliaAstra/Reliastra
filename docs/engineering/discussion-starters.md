# Engineering discussion starters

## Publication status

These are **unpublished discussion drafts**, not records of community participation.
The repository was inspected on 2026-09-18 at
[`1bfc565`](https://github.com/ReliaAstra/Reliastra/commit/1bfc56570aa1d724fd51f88f4ad4e85423d0fe60).
Discussions was disabled and the GitHub integration returned
`403 Resource not accessible by integration` when asked to enable it. The exposed
GraphQL schema has discussion-post mutations but no category-creation mutation.
No Discussion posts or categories were created. See the
[GitHub setup follow-up](github-setup.md) for the remaining administrator actions
and issue-label mapping.

A repository administrator can finish setup without changing the technical drafts:

1. Enable **Discussions** in the repository's Settings → General → Features.
2. Inspect the categories GitHub creates. Rename/reuse them where possible to
   produce the six categories below; do not keep redundant defaults.
3. Use open-ended discussion format for the first five categories and Q&A format
   for Questions. Do not create announcements or promotional categories for these
   engineering topics.
4. Check existing titles again, then publish each draft below in its indicated
   category. The heading is the post title; omit the publication/category notes.
5. Replace draft links in the engineering issues with the actual Discussion URLs,
   add the Discussions contact link to the issue chooser, and remove the pending
   notices in the README and contributor guide. Keep this page as an index with
   links rather than a second live conversation.

| Category | Description |
| --- | --- |
| Engineering Research | Discuss the technical foundations of dependency intelligence, incident attribution, synthetic observations, evidence, correlation, confidence, and reliability. |
| Attribution | Challenge how RELIASTRA determines whether a dependency contributed to an incident. |
| Observability | Discuss telemetry, OpenTelemetry, Prometheus, synthetic checks, regional observations, and integrations. |
| Architecture | Discuss system architecture, storage, workers, queues, APIs, collectors, probes, and scaling. |
| Ideas | Propose features, integrations, workflows, and improvements that should be considered by the project. |
| Questions | Ask technical questions about running, integrating, extending, or understanding RELIASTRA. |

## Challenge RELIASTRA's Attribution Model

Intended category: **Attribution**.

When an application and an external dependency fail around the same time, what
would justify saying the dependency contributed? Application failure, dependency
failure, a shared cause, regional degradation, a transient observation, and
coincidence are different explanations. RELIASTRA needs to distinguish them,
not merely assign a plausible label.

The current implementation is a hypothesis to examine, not a validated causal
model. [`AttributionEngine`](../../backend/app/modules/attribution/service.py)
uses five weighted signals under methodology `v1.0`:

| Signal | Weight | What the implementation currently measures |
| --- | --- | --- |
| Temporal | 0.20 | Whether another incident is currently open in the same organization with a start time within ±300 seconds. |
| Endpoint overlap | 0.25 | The maximum stored correlation confidence, including temporal/manual correlations; it does not directly compare endpoint sets. |
| Latency correlation | 0.25 | A bounded coefficient of variation within the observations, not correlation between application and dependency time series. |
| Error pattern | 0.15 | The fraction of errors sharing the most common error type; distinct regional origins are not established by this calculation. |
| Infrastructure baseline | 0.15 | A boolean argument that defaults to healthy, not an independently measured application-health baseline. |

The weighted score is scaled to 0–100. Scores of at least 75 become
`vendor_failure`, and at least 50 become `multi_cause`; lower scores become
`infrastructure_issue` when the baseline argument is false, otherwise `unknown`.
Those are implementation labels, **not proof of responsibility or calibrated
probabilities**. The resolution path in
[`IncidentService`](../../backend/app/modules/incidents/service.py) currently
loads at most 100 incident-window observations and leaves the baseline argument
at its default. Determinism with fixed inputs does not establish correctness,
and repository queries are additional inputs that can change over time.

SRE, observability, platform, distributed-systems, and reliability engineers:
please criticize this methodology, including whether these signals belong in
an attribution model at all.

- What evidence would you require before claiming a third-party dependency
  contributed to an incident? What separates contribution from sole cause?
- Which current signals are too weak or misleadingly named? Which should carry
  more weight? Are temporal and endpoint-overlap scores double-counting evidence?
- How should false positives be measured and handled? What negative controls or
  labeled incident examples would make a useful evaluation set?
- How should regional divergence, missing observations, clock skew, sampling,
  and probe-infrastructure failures affect confidence or force abstention?
- How should unknown application health differ from a measured healthy baseline?
- What would convince you that correlation is causal enough for an incident
  report, and what wording would still be unjustified?
- What would make the resulting evidence artifact trustworthy?

A useful reply can be a counterexample, a competing model, or a small sanitized
trace showing a wrong conclusion. Please distinguish measurements from
assumptions and explain how you would test an alternative. Do not post private
endpoints, credentials, customer records, or unredacted production logs.

## How Should Dependency Incidents Be Represented?

Intended category: **Architecture**.

How would you model an incident that involves an application and one or more
external dependencies without embedding an unproven causal conclusion in the
schema?

RELIASTRA already has a relational starting point:

- [`Dependency`](../../backend/app/modules/dependencies/models.py) belongs to an
  organization and can reference an application. It stores endpoint and check
  configuration.
- [`CheckResult`](../../backend/app/modules/checks/models.py) records customer
  probe execution. [`Observation`](../../backend/app/modules/observations/models.py)
  records source, timestamp, region, endpoint, result, latency, and errors;
  customer checks reach it through a transactional outbox, while public vendor
  probes have a separate source type.
- [`Incident`](../../backend/app/modules/incidents/models.py) is tied to one
  dependency with a start/resolution window and detection metadata.
  `IncidentCorrelation` links an incident to another dependency with a method
  and score.
- [`AttributionResult`](../../backend/app/modules/attribution/models.py) stores a
  classification, signal scores, supporting/contradicting entries, and a
  methodology version. [`EvidenceSnapshot`](../../backend/app/modules/evidence/models.py)
  records artifact identity and provenance.

This is not yet a general model of application-side impact or multi-party
causality. A configured region label also does not establish an independent
observation location.

Questions for people who have modeled this in production:

- Which concepts must have stable identities: **application, dependency,
  observation, incident, failure window, region, signal, evidence, correlation,
  attribution, confidence**? Which should be immutable facts and which are
  revisable interpretations?
- Should this be a graph, event stream, relational model, incident object, or
  some combination? What query or failure mode justifies each choice?
- How would you represent one application incident with several implicated
  dependencies, a shared upstream provider, conflicting observations, and
  intervals that overlap without having the same start/end?
- Do we need event time and ingestion time, interval uncertainty, and an
  explicit distinction between probe location, provider region, and failure
  region? What happens when observations arrive late or are duplicated?
- How should a revised attribution coexist with the earlier conclusion and an
  already-issued evidence artifact? What must be captured to replay it?
- How do retention, raw-data references, schema evolution, tenant isolation,
  and selective public evidence sharing constrain the model?

Please describe a concrete production-shaped example, the queries an on-call
engineer must answer, and the trade-offs you would accept. An anonymized schema
or event sequence is more useful than choosing a database by preference.

## What Should a Dependency Evidence Artifact Contain?

Intended category: **Engineering Research**.

RELIASTRA is interested in producing independently verifiable evidence around
dependency incidents. What should another engineer be able to verify without
trusting the report's conclusion or having access to our database?

There is already an implementation to review, not just a proposed PDF.
[`EvidenceService`](../../backend/app/modules/evidence/service.py) builds a
canonical JSON payload and PDF, stores a data hash and document checksum, and
records a verification identifier, observation-window metrics, detection
provenance, attribution, and methodology version. Snapshots have ORM-level
update/delete guards; that is not by itself proof of storage-level immutability.
[`signing.py`](../../backend/app/modules/evidence/signing.py) supports optional
Ed25519 signatures over the canonical payload. Unsigned deployments are an
explicit supported state. The
[incident/evidence lifecycle](../operations/incident-evidence-lifecycle.md)
describes truncation, missing-data handling, and public verification.

Hash agreement proves byte consistency. A valid signature can establish that a
particular key signed a payload; neither proves that the observation was truthful,
the probe independent, or the attribution causal. What additional guarantees are
needed, and which cannot reasonably be provided?

Potential contents to examine:

- Observation **timestamp**, clock accuracy, event/ingestion time, observation
  location, **region**, and stable probe identity.
- Sanitized **endpoint**, request method/result, **latency**, status/error,
  timeout policy, and measurement limitations without credentials or bodies
  containing customer data.
- **Repeated observations**, sample counts, gaps, retry policy, and comparison
  **baseline**, including healthy or contradictory observations.
- **Application incident window**, dependency observation window, overlap,
  regional divergence, and the **correlation data** actually used.
- Raw observation references with integrity checks, access/retention rules, and
  an explicit indication when rows are unavailable, redacted, or truncated.
- **Methodology version**, parameters/weights, confidence meaning, unsupported
  assumptions, and conditions where no conclusion is justified.
- **Provenance**, canonicalization/schema version, immutable identifier, hashes,
  signing-key history, and a verification procedure independent of the renderer.

**What would you need to see before you would trust this artifact during an
incident review?**

Would you require an offline-verifiable bundle? How should key rotation,
expiration, deletion obligations, corrected data, and disagreements between the
application and probes appear? What would a deliberately misleading artifact
look like even if every hash and signature verified?

Please propose checks that could fail an artifact, not just more fields to add.
Use synthetic or sanitized examples; public verifiability must not require
publishing tenant-private observations.

## Would You Trust Cross-Region Synthetic Observations?

Intended category: **Observability**.

Independent synthetic probes could help distinguish a dependency problem from
an application's local failure. But several region strings in a database are
not several independent observations, and several cloud regions may still
share a resolver, network path, provider, or control plane.

The [current operating model](../operations/incident-evidence-lifecycle.md#observation-topology)
is explicitly single-origin. Customer tasks accept region labels on a common
worker queue; public vendor scheduling uses `CHECK_WORKER_REGION`.
[`checks/detection.py`](../../backend/app/modules/checks/detection.py) already
supports both a consecutive-failure rule for single topology and a quorum rule
for multi topology (currently two distinct observation-point labels in a
60-second window). The multi rule does not prove independent physical origins.
A real regional fleet, verified worker identity, and routing are prerequisites,
not capabilities we should imply are already deployed.

For engineers operating regional systems:

- How many regions are meaningful, and how do you select independent vantage
  points rather than maximize the number of labels?
- How should regional network anomalies and probe/control-plane failures be
  separated from vendor failures? What control targets or caller-side signals
  would help, and what dependencies do those controls introduce?
- How should quorum/agreement work when probes are missing, delayed, correlated,
  unhealthy, or disagree? When should the system abstain?
- What latency variance is normal for a given endpoint, region, route, and time
  of day? How should baselines handle retries, cold starts, and anycast changes?
- How should CDN, DNS, routing, TLS, and regional edge failures affect
  interpretation? Does a healthy status page say anything about an authenticated
  application API path?
- What constitutes sufficient evidence that a dependency is degraded globally
  versus regionally? What is the strongest claim a limited probe fleet can make?

Please share practical production examples: topology, sampled window, conflicting
signals, and what ultimately distinguished local, shared-network, and vendor
causes. Sanitized counterexamples to a simple majority vote are especially useful.
No private infrastructure details are needed.
