import type { ResearchPaper } from './types';

/**
 * The published research corpus: structured front matter, keyed by slug.
 *
 * Every number in here was captured from a live, public endpoint on the date
 * shown, or read out of this repository. Nothing is estimated to fill a gap.
 * Where a figure could not be obtained it is absent and the paper says so.
 *
 * ── Captures this corpus is built on ──────────────────────────────────────
 * All reads performed 11 September 2026, UTC. Raw payloads are versioned
 * under `research/availability-record-audit/data/` at the repository root so
 * the arithmetic in the papers can be re-run against the same bytes.
 *
 *  A  GET https://api.reliastra.com/v1/vendors?limit=100            ~11:34Z
 *  B  GET https://api.reliastra.com/v1/vendors/openai/metrics       ~11:34Z
 *  C  GET https://api.reliastra.com/v1/vendors/openai               11:39:38Z
 *  D  GET …/vendors/openai/timeline?window=1h&resolution=1m         11:39:46Z
 *  E  GET https://status.openai.com/api/v2/summary.json             ~11:36Z
 *  F  GET https://reliastra.com/track/openai  (rendered record)     ~11:24Z
 */

export const RESEARCH_PAPERS: readonly ResearchPaper[] = [
  /* ── Measurement integrity ─────────────────────────────────────────────── */
  {
    slug: 'availability-record-audit',
    researchQuestion:
      'Can a reader of a published availability record determine, from the record itself, how much evidence stands behind each percentage it publishes?',
    abstract:
      'Availability percentages are published without their denominators, so a reader cannot tell a 90-day figure computed from 25,920 observations from one computed from 595. ' +
      'RELIASTRA audited its own public availability record for OpenAI on 11 September 2026 and found three properties that are invisible on the rendered page but recoverable from the measurement API: ' +
      'the 30-day and 90-day windows return aggregates byte-identical to the 7-day window; the returned history covers roughly 2.1 days of observations for an endpoint that has been configured for 26.5 days; ' +
      'and the observation cadence the record states is five times shorter than the cadence its own timeline implies. ' +
      'None of the three is a defect in the arithmetic. All three are defects in what the record discloses. ' +
      'This paper gives the three checks that expose them - window monotonicity, history depth, and expected-versus-observed density - as a reproducible audit any engineer can run against any availability record, including their own monitoring vendor’s.',
    keyFindings: [
      {
        claim:
          'The 30-day and 90-day windows of the public record returned observation counts, availability, mean latency and 95th-percentile latency identical to the 7-day window: 595 observations, 100.0%, 570.67 ms mean, 840.33 ms p95. The three windows describe the same set of observations.',
        basis: 'measured',
      },
      {
        claim:
          'At the configured 300-second interval, 595 observations span about 49.6 hours. The record’s "90 days" availability figure is therefore computed over roughly 2.1 days of evidence - 2.3% of the 25,920 observations the label implies.',
        basis: 'derived',
      },
      {
        claim:
          'The 24-hour window returned 277 observations against 288 expected at a 300-second interval (96.2% density, 11 observations missing). The 7-day window returned 595 against 2,016 expected (29.5%). Density falls with window length, which is the signature of shallow history rather than of a failing endpoint.',
        basis: 'derived',
      },
      {
        claim:
          'The rendered public record states that checks arrive "about every 60 seconds per region". The same record’s timeline for the same hour contains 12 points, each holding one observation, spaced 300 seconds apart. The stated cadence is five times shorter than the measured one.',
        basis: 'measured',
      },
      {
        claim:
          'Availability was 100.0% in every window. Nothing in this audit contradicts that figure - the endpoint responded to every probe that was issued. The finding is about the size of the sample the figure was computed from, not about its correctness.',
        basis: 'measured',
      },
      {
        claim:
          'A record that publishes availability without observation count, window bounds and probe interval cannot be audited by a reader. RELIASTRA publishes the first two on the rendered page and does not publish the third on any public endpoint.',
        basis: 'measured',
      },
    ],
    scope:
      'The publicly readable availability record for one dependency (OpenAI, observed via https://status.openai.com) on the RELIASTRA public measurement API, read on 11 September 2026. ' +
      'The audit method itself is general and applies to any availability record that exposes per-window aggregates. ' +
      'This paper does not evaluate the endpoint’s reliability, does not evaluate OpenAI, and does not claim the record is inaccurate - it claims the record is under-described, and quantifies the gap.',
    methodologySummary:
      'Six read-only GET requests against public endpoints, captured with their raw JSON at fixed UTC timestamps and versioned in this repository. ' +
      'Expected observation counts are computed from the configured probe interval declared in this repository’s source, not from the record’s stated cadence. ' +
      'History depth is inferred from the identity of aggregates across windows plus count-over-interval arithmetic. ' +
      'Every claim is labelled measured, derived, sourced or reasoned; the audit script re-derives all of it from the captured bytes.',
    domains: ['Measurement integrity', 'Observability', 'Reliability'],
    researchType: 'Audit',
    evidenceBasis: 'measured',
    entities: [
      { role: 'vendor', name: 'OpenAI', note: 'the dependency under observation' },
      {
        role: 'endpoint',
        name: 'https://status.openai.com',
        note: 'the single observed endpoint for this vendor record',
      },
      { role: 'region', name: 'us-east', note: 'the only observation origin in the record' },
      {
        role: 'system',
        name: 'RELIASTRA public measurement API',
        note: 'GET /v1/vendors/{name}/metrics, /timeline, and the vendor catalog',
      },
      {
        role: 'system',
        name: 'RELIASTRA public vendor record',
        note: 'the rendered page at /track/openai',
      },
    ],
    observation: {
      target: 'RELIASTRA’s public availability record for the OpenAI dependency',
      source: 'https://api.reliastra.com/v1/vendors/openai/metrics',
      protocol: 'HTTPS GET, JSON response, unauthenticated',
      regions: ['us-east'],
      startedAt: '2026-09-11T11:34:00Z',
      endedAt: '2026-09-11T11:39:46Z',
      observations: 595,
      method:
        'Single-session read of the vendor catalog, the six-window metrics aggregate, the vendor detail record and a one-hour/one-minute timeline, each captured verbatim with its response body.',
    },
    dataset: {
      name: 'RELIASTRA availability-record audit, OpenAI, 11 September 2026',
      description:
        'Raw public API responses plus the derived per-window expected-versus-observed observation table used for every figure in this paper.',
      path: 'research/availability-record-audit/data',
      format: 'application/json, text/csv',
      license: 'CC-BY-4.0',
      variables: [
        { name: 'window', type: 'string', description: 'Aggregate window label as returned by the API: 1h, 6h, 24h, 7d, 30d, 90d.' },
        { name: 'total_observations', type: 'integer', description: 'Observations the API counted inside the window.' },
        { name: 'uptime_percentage', type: 'float', unit: 'percent', description: 'Availability as published.' },
        { name: 'avg_latency_ms', type: 'float', unit: 'milliseconds', description: 'Arithmetic mean response time.' },
        { name: 'p95_latency_ms', type: 'float', unit: 'milliseconds', description: '95th-percentile response time.' },
        { name: 'expected_observations', type: 'integer', description: 'Derived: window length in seconds divided by the configured probe interval.' },
        { name: 'density_ratio', type: 'float', description: 'Derived: total_observations divided by expected_observations.' },
      ],
    },
    limitations: [
      'One dependency, one endpoint, one observation origin, one read session. Nothing here establishes that the same properties hold for other dependencies or at other times.',
      'The inference that the stored history is about 2.1 days deep rests on aggregate identity across the 7-, 30- and 90-day windows plus a constant 300-second interval. A retention job, an aggregation cap and a scheduler that was not running for most of the period are indistinguishable from the public API alone.',
      'The configured probe interval of 300 seconds is read from this repository’s schema default, not from a public endpoint. If the deployed dependency overrides it, every expected-count figure in this paper scales with it - the script takes the interval as an argument for exactly that reason.',
      'A 100.0% availability figure over 595 observations is not a weak measurement of a healthy endpoint. It is a weak measurement of a 90-day period. This paper does not claim the endpoint was unavailable at any point.',
      'RELIASTRA audited its own record. That is a conflict of interest in the reader’s favour but it is still self-assessment, and the captures are versioned so a third party can check the arithmetic independently.',
    ],
    recommendations: [
      {
        title: 'Publish the denominator beside every percentage',
        detail:
          'An availability figure without its observation count, window bounds and probe interval is a claim a reader cannot check. Render all four together, or suppress the percentage for windows whose density falls below a stated threshold.',
      },
      {
        title: 'Refuse to render a window the store cannot fill',
        detail:
          'If the 30-day aggregate is identical to the 7-day aggregate, the record should say "history covers 2.1 days" instead of printing a 30-day figure. A window label that the data cannot honour is a defect, not a rounding issue.',
      },
      {
        title: 'Alarm on observation density, not on availability',
        detail:
          'Availability is blind to a scheduler that stopped. Observation count against expected count is not. A density ratio below 0.95 on a 24-hour window means probes were not issued, and that is a different incident from an endpoint failing.',
      },
      {
        title: 'Never take the cadence from the record',
        detail:
          'Derive expected counts from the configured interval in your own source of truth. This audit would have been wrong by a factor of five had it trusted the cadence the record states - see the companion paper on interval estimation.',
      },
    ],
    references: [
      {
        id: 'reliastra-metrics',
        kind: 'reliastra-measurement',
        title: 'RELIASTRA public measurement API - vendor metrics aggregate, openai',
        publisher: 'Reliastra, Inc.',
        url: 'https://api.reliastra.com/v1/vendors/openai/metrics',
        accessedAt: '2026-09-11',
        note: 'Captured 11 September 2026 at approximately 11:34 UTC; raw response versioned at research/availability-record-audit/data/.',
      },
      {
        id: 'reliastra-timeline',
        kind: 'reliastra-measurement',
        title: 'RELIASTRA public measurement API - vendor timeline, openai, 1h at 1-minute resolution',
        publisher: 'Reliastra, Inc.',
        url: 'https://api.reliastra.com/v1/vendors/openai/timeline?window=1h&resolution=1m',
        accessedAt: '2026-09-11',
        note: 'Captured 11 September 2026 at 11:39:46 UTC. Twelve one-minute buckets, one observation each.',
      },
      {
        id: 'reliastra-record',
        kind: 'reliastra-measurement',
        title: 'RELIASTRA public vendor record - OpenAI',
        publisher: 'Reliastra, Inc.',
        url: 'https://reliastra.com/track/openai',
        accessedAt: '2026-09-11',
        note: 'The rendered page a reader actually sees, captured 11 September 2026.',
      },
      {
        id: 'reliastra-schemas',
        kind: 'source-code',
        title: 'backend/app/modules/dependencies/schemas.py - check_interval_seconds default',
        publisher: 'Reliastra, Inc.',
        url: 'https://github.com/ReliaAstra/Reliastra/blob/main/backend/app/modules/dependencies/schemas.py',
        accessedAt: '2026-09-11',
        note: 'check_interval_seconds: int = Field(default=300, ge=1, le=86400). Source of the 300-second interval used for every expected count.',
      },
      {
        id: 'reliastra-windows',
        kind: 'source-code',
        title: 'backend/app/modules/vendors/service.py - _WINDOW_HOURS',
        publisher: 'Reliastra, Inc.',
        url: 'https://github.com/ReliaAstra/Reliastra/blob/main/backend/app/modules/vendors/service.py',
        accessedAt: '2026-09-11',
        note: 'The six windows the API aggregates: 1h, 6h, 24h, 7d (168h), 30d (720h), 90d (2160h).',
      },
      {
        id: 'usenet-sli',
        kind: 'standard',
        title: 'Site Reliability Engineering, chapter 4: Service Level Objectives',
        publisher: "O'Reilly Media / Google SRE",
        publishedAt: '2016-03-23',
        url: 'https://sre.google/sre-book/service-level-objectives/',
        accessedAt: '2026-09-11',
        note: 'The standard treatment of why an SLI must state its aggregation window and its valid-request denominator.',
      },
      {
        id: 'iso-8601',
        kind: 'standard',
        title: 'ISO 8601-1:2019 - Date and time, representations for information interchange',
        publisher: 'International Organization for Standardization',
        identifier: 'ISO 8601-1:2019',
        accessedAt: '2026-09-11',
        note: 'All timestamps in this paper and its dataset are UTC in ISO 8601 extended format.',
      },
    ],
    artifacts: [
      {
        kind: 'script',
        label: 'audit.py - availability-record audit',
        description:
          'Stdlib-only Python. Reads the captured API payloads, recomputes expected observation counts, window monotonicity and history depth, and prints the audit table. Runs offline against the versioned data.',
        path: 'research/availability-record-audit/audit.py',
      },
      {
        kind: 'dataset',
        label: 'Captured payloads and derived audit table',
        description:
          'The six raw responses this paper is built on, plus expected_observations.csv - the derived per-window table behind every figure.',
        path: 'research/availability-record-audit/data',
        format: 'application/json, text/csv',
      },
      {
        kind: 'repository',
        label: 'Availability-record audit',
        description:
          'Problem statement, research question, method, environment, results, limitations and reproduction steps for this paper’s experiment.',
        path: 'research/availability-record-audit/README.md',
      },
    ],
    relatedEvidence: [
      {
        href: '/track/openai',
        label: 'The live OpenAI record',
        description: 'The public availability record this paper audits, as it renders now.',
      },
      {
        href: '/research/how-reliastra-measures-vendor-reliability',
        label: 'How RELIASTRA measures vendor reliability',
        description: 'The published measurement methodology: scheduling, failure definition, retention.',
      },
      {
        href: '/research/measurement-integrity/probe-interval-from-bucketed-telemetry',
        label: 'Estimating probe interval from bucketed telemetry',
        description: 'Why the record states 60 seconds for a 300-second schedule, and the fix.',
      },
      {
        href: '/research/reliastra-research-agenda',
        label: 'The RELIASTRA research agenda',
        description: 'What this corpus will and will not publish.',
      },
    ],
    publishedAt: '2026-09-11',
  },

  {
    slug: 'probe-interval-from-bucketed-telemetry',
    researchQuestion:
      'Why does an observation interval estimated from bucketed telemetry converge on the bucket length, and what does that do to a published monitoring record?',
    abstract:
      'RELIASTRA’s public vendor record derives the probe cadence it prints from the density of non-empty buckets in a timeline series: bucket length divided by the mean observations per occupied bucket. ' +
      'On 11 September 2026 that estimator printed "about every 60 seconds" for a dependency probed every 300 seconds - a fivefold understatement, on the same page where a second component of the same record printed 300 seconds for the same schedule. ' +
      'The cause is not a coding slip. An estimator built from occupied-bucket density is mathematically bounded above by the bucket length: when the true interval exceeds the bucket, every occupied bucket holds exactly one observation, the mean is 1, and the estimator returns the bucket length exactly. ' +
      'The estimator therefore computes min(interval, bucket) and cannot report an interval longer than the resolution it is fed. ' +
      'This paper states the bound, proves it from the captured series, shows the two cadences the production record published simultaneously, and gives the corrected estimator - median inter-bucket delta - now implemented in the observatory with a regression test built from the captured payload.',
    keyFindings: [
      {
        claim:
          'The one-hour timeline captured at 11:39:46 UTC on 11 September 2026 contains 12 points, each with observation_count = 1, at bucket starts 300 seconds apart (one gap of 360 seconds). Median inter-bucket delta: 300 s. Mean: 305.5 s.',
        basis: 'measured',
      },
      {
        claim:
          'The deployed estimator returns round(bucket_length / mean_observations_in_occupied_buckets). On that series: round(60 / 1.0) = 60 seconds. The published record therefore stated an interval five times shorter than the measured one.',
        basis: 'derived',
      },
      {
        claim:
          'The same rendered page simultaneously stated "about every 60 seconds per region" in its summary and observation-network table and "≈ every 300 seconds in this window" in its telemetry panel. Both figures came from the same estimator, applied to timelines at 1-minute and 5-minute resolution respectively.',
        basis: 'measured',
      },
      {
        claim:
          'For any regular schedule, the estimator returns min(interval, bucket_length). It is exact when the interval divides the bucket length, and saturates at the bucket length whenever the interval is longer. No input can make it report an interval above its resolution.',
        basis: 'reasoned',
      },
      {
        claim:
          'The API returns only occupied buckets: a one-hour window at one-minute resolution returned 12 points, not 60. Empty buckets - the actual evidence of a sparse schedule - never reach the estimator.',
        basis: 'measured',
      },
      {
        claim:
          'Two estimators recover the true interval from the same 12 points: median inter-bucket delta (300 s) and window length over observation count (3600 / 12 = 300 s). Neither depends on bucket resolution.',
        basis: 'derived',
      },
    ],
    scope:
      'One estimator, one production record, one captured series. The bound is proven for regular schedules and stated as approximate for irregular ones. ' +
      'This paper does not evaluate the probe schedule itself, does not claim the dependency was under-monitored relative to its contract, and does not generalise to estimators that operate on raw event timestamps rather than aggregates.',
    methodologySummary:
      'The estimator is read from source in this repository. The series it was fed is captured verbatim from the public API with its response body versioned in this repository. ' +
      'The bound is derived analytically and then checked against the captured series at two resolutions. The corrected estimator is implemented and its regression test is built from the captured payload, so the test fails if the captured behaviour is ever reintroduced.',
    domains: ['Observability', 'Measurement integrity', 'Distributed systems'],
    researchType: 'Measurement',
    evidenceBasis: 'measured',
    entities: [
      { role: 'system', name: 'observedCadenceSeconds', note: 'the estimator, in frontend/src/lib/track-api.ts' },
      { role: 'system', name: 'RELIASTRA public vendor record', note: '/track/openai, the page that prints the cadence' },
      { role: 'endpoint', name: 'https://status.openai.com', note: 'the dependency whose cadence was misreported' },
      { role: 'region', name: 'us-east', note: 'the observation origin of the captured series' },
    ],
    observation: {
      target: 'RELIASTRA one-hour observation timeline for the OpenAI dependency at one-minute resolution',
      source: 'https://api.reliastra.com/v1/vendors/openai/timeline?window=1h&resolution=1m',
      protocol: 'HTTPS GET, JSON response, unauthenticated',
      regions: ['us-east'],
      startedAt: '2026-09-11T10:39:46Z',
      endedAt: '2026-09-11T11:39:46Z',
      observations: 12,
      method: 'Single captured response, parsed for bucket starts and per-bucket observation counts.',
    },
    limitations: [
      'The bound min(interval, bucket_length) is exact for a perfectly regular schedule. Under jitter, retries or a schedule that changed mid-window, the estimator’s output depends on the distribution of gaps and can land anywhere at or below the bucket length.',
      'Median inter-bucket delta is itself an estimate. It reports the interval at which observations were recorded, which is the dispatch interval only if the scheduler is punctual; a worker backlog produces a longer median without any change of configuration.',
      'The corrected estimator inherits the resolution ceiling of the data it is given. A series returned at five-minute resolution cannot establish a 30-second schedule, and this paper does not claim otherwise.',
      'One dependency, one region, one hour. The captured series is regular enough that both corrected estimators agree; that agreement is a property of this window, not a guarantee.',
      'The fix changes what the record prints. It does not change how often probes are issued.',
    ],
    recommendations: [
      {
        title: 'Estimate rate from timestamps, never from post-aggregation counts',
        detail:
          'Bucketing destroys the information a rate estimate needs. If you must estimate from a bucketed series, use the delta between bucket starts, or window length over total count - both of which are resolution-independent.',
      },
      {
        title: 'Publish the configured interval instead of inferring it',
        detail:
          'RELIASTRA infers cadence because no public endpoint exposes the configured interval. Exposing it removes the estimation problem entirely; inference is a workaround for a missing field, and this paper documents what the workaround costs.',
      },
      {
        title: 'Compute one figure once, and render it everywhere from that one value',
        detail:
          'The production page published two cadences because two components each ran the estimator over a different window. A record that states a number twice should state it from one place.',
      },
      {
        title: 'Test estimators against captured payloads, not synthetic ones',
        detail:
          'A hand-written fixture with dense buckets cannot express the failure mode. The regression test added here is the captured 12-point series, verbatim.',
      },
    ],
    references: [
      {
        id: 'captured-series',
        kind: 'reliastra-measurement',
        title: 'RELIASTRA public measurement API - vendor timeline, openai, 1h at 1-minute resolution',
        publisher: 'Reliastra, Inc.',
        url: 'https://api.reliastra.com/v1/vendors/openai/timeline?window=1h&resolution=1m',
        accessedAt: '2026-09-11',
        note: 'Captured 11 September 2026 at 11:39:46 UTC; versioned at research/availability-record-audit/data/.',
      },
      {
        id: 'estimator-source',
        kind: 'source-code',
        title: 'frontend/src/lib/track-api.ts - observedCadenceSeconds',
        publisher: 'Reliastra, Inc.',
        url: 'https://github.com/ReliaAstra/Reliastra/blob/main/frontend/src/lib/track-api.ts',
        accessedAt: '2026-09-11',
        note: 'The estimator as deployed: round(bucket / mean observation_count over buckets with count > 0).',
      },
      {
        id: 'schedule-source',
        kind: 'source-code',
        title: 'backend/app/config.py - CHECK_SCHEDULE_SECONDS and OBSERVATION_TOPOLOGY',
        publisher: 'Reliastra, Inc.',
        url: 'https://github.com/ReliaAstra/Reliastra/blob/main/backend/app/config.py',
        accessedAt: '2026-09-11',
        note: 'Celery Beat dispatches due checks every 30 seconds by default; each dependency carries its own check_interval_seconds.',
      },
      {
        id: 'nygard-release',
        kind: 'web',
        title: 'Release It! - transparency and observability of production systems',
        publisher: 'Michael T. Nygard, Pragmatic Bookshelf',
        publishedAt: '2018-01-19',
        accessedAt: '2026-09-11',
        note: 'On why an operator-facing figure that cannot be traced to an observation is worse than no figure.',
      },
      {
        id: 'prometheus-rate',
        kind: 'vendor-documentation',
        title: 'Prometheus documentation - rate() and the sampling-interval constraint',
        publisher: 'Prometheus project',
        url: 'https://prometheus.io/docs/prometheus/latest/querying/functions/#rate',
        accessedAt: '2026-09-11',
        note: 'The same class of constraint in a different system: a rate computed over a range must span at least two samples, and its resolution bounds what it can express.',
      },
    ],
    artifacts: [
      {
        kind: 'dataset',
        label: 'Captured one-hour timeline, verbatim',
        description:
          'The 12-point series the deployed estimator was fed, stored as returned. Used directly as the fixture for the regression test.',
        path: 'research/availability-record-audit/data/reliastra-openai-timeline-1h-1m-2026-09-11T1139Z.json',
        format: 'application/json',
      },
      {
        kind: 'script',
        label: 'audit.py - interval estimators compared',
        description:
          'Runs the deployed estimator and both corrected estimators over the captured series and prints the three results side by side.',
        path: 'research/availability-record-audit/audit.py',
      },
    ],
    relatedEvidence: [
      {
        href: '/research/measurement-integrity/availability-record-audit',
        label: 'Auditing a published availability record',
        description: 'The audit that would have inherited this fivefold error as its denominator.',
      },
      {
        href: '/track/openai',
        label: 'The live OpenAI record',
        description: 'The page that published two cadences at once.',
      },
      {
        href: '/research/how-reliastra-measures-vendor-reliability',
        label: 'How RELIASTRA measures vendor reliability',
        description: 'Scheduling, the failure definition, and what is deliberately not claimed.',
      },
    ],
    publishedAt: '2026-09-11',
  },

  /* ── Cloud security ────────────────────────────────────────────────────── */
  {
    slug: 'ai-api-trust-boundary',
    researchQuestion:
      'What changes about an application’s trust boundary when its model is a network call to a third party, and which controls that boundary used to imply no longer exist?',
    abstract:
      'An AI API dependency is not a larger version of a SaaS API dependency. It moves prompt content, retrieval context and often customer data across a boundary the consuming organisation does not control, on a path whose routing the consumer cannot observe, at a cost model that makes retry behaviour a financial control as well as a reliability one. ' +
      'This paper enumerates the boundary as an architect would draw it - the zones, what crosses each of them, what is authenticated where, and what the consumer can and cannot verify - and derives the controls that follow. ' +
      'It is grounded in one concrete asymmetry that RELIASTRA’s own observatory makes visible: the endpoint RELIASTRA observes for OpenAI is https://status.openai.com, a status site in the provider’s reporting plane, while the endpoint an application actually depends on is the inference API. ' +
      'The two sit in different planes, fail independently, and only one of them is on any status page. ' +
      'The paper closes with the four properties that distinguish an AI API dependency from a conventional one, and the failure modes each introduces.',
    keyFindings: [
      {
        claim:
          'An AI API dependency exposes prompt content to a third-party trust domain. Unlike a payment or auth call, the payload is not a small structured record: it routinely contains retrieved documents, prior conversation turns and whatever the retrieval layer happened to fetch. Data-classification controls that were adequate for a card token are not adequate for a prompt.',
        basis: 'reasoned',
      },
      {
        claim:
          'Model routing is inside the provider’s trust domain and invisible to the consumer. A request addressed to a model name is served by whatever the provider routes it to, and the consumer observes only the response. A change of underlying model, region or serving tier is not observable at the API boundary unless the provider chooses to disclose it.',
        basis: 'reasoned',
      },
      {
        claim:
          'The status plane and the serving plane are separate failure domains with separate availability. RELIASTRA’s public record for OpenAI observes https://status.openai.com from one region; that record is evidence about the status site, and is not evidence about the inference API. Treating the two as one availability figure is a category error that survives into incident reports.',
        basis: 'measured',
      },
      {
        claim:
          'Retry behaviour against a model API is a cost control as well as a reliability control. Unbounded retries on a degraded upstream multiply token spend and can exhaust quota, so the backoff policy that a conventional API treats as an availability concern is here also a financial and authorisation control.',
        basis: 'reasoned',
      },
      {
        claim:
          'Zero-trust principles that stop at the service mesh do not cover this boundary. Mutual TLS and workload identity establish who is calling; they say nothing about what the callee does with prompt content, which model serves it, or where inference is executed. The consumer’s enforceable controls are contractual and architectural - data minimisation, redaction before egress, provider pinning and an egress record - not cryptographic.',
        basis: 'reasoned',
      },
      {
        claim:
          'Dependency-graph reachability is an attack surface, not only a reliability surface. Every component between the application and the model - gateway, router, DNS resolver, TLS terminator, provider edge - is a point at which prompt content can be observed or altered, and most of them are outside the application team’s review scope.',
        basis: 'reasoned',
      },
    ],
    scope:
      'The architecture of a production application that calls a hosted model API over HTTPS, with or without an intervening AI gateway. ' +
      'This paper does not evaluate any provider’s security posture, does not report a vulnerability, and makes no claim about any specific provider’s controls. ' +
      'It is an architectural analysis: every finding is reasoning from published documentation and standard trust-boundary practice, except the observation about RELIASTRA’s own observed endpoint, which is measured.',
    methodologySummary:
      'Trust-boundary decomposition of a reference architecture: enumerate zones, enumerate what crosses each boundary, state the authentication and authorisation that applies at each crossing, and identify the properties the consumer can verify versus those it must trust. ' +
      'Cross-referenced against NIST SP 800-207 for the zero-trust vocabulary, RFC 8446 for what TLS 1.3 does and does not establish about the peer application, and provider documentation for the disclosure boundary. ' +
      'The one measured element is the observed endpoint of RELIASTRA’s own OpenAI record, read from the public measurement API.',
    domains: ['Cloud security', 'AI infrastructure', 'Zero trust', 'Dependency security'],
    researchType: 'Architecture analysis',
    evidenceBasis: 'reasoned',
    entities: [
      { role: 'vendor', name: 'OpenAI', note: 'used as the reference provider; no evaluation of its posture is made or implied' },
      { role: 'endpoint', name: 'https://status.openai.com', note: 'the endpoint RELIASTRA observes - the status plane' },
      { role: 'endpoint', name: 'https://api.openai.com', note: 'the endpoint an application depends on - the serving plane' },
      { role: 'standard', name: 'NIST SP 800-207', note: 'zero-trust architecture vocabulary' },
      { role: 'standard', name: 'RFC 8446', note: 'TLS 1.3; what the handshake does and does not establish' },
    ],
    observation: {
      target: 'The observed endpoint of RELIASTRA’s OpenAI dependency record',
      source: 'https://api.reliastra.com/v1/vendors/openai',
      protocol: 'HTTPS GET, JSON response, unauthenticated',
      regions: ['us-east'],
      startedAt: '2026-09-11T11:39:38Z',
      endedAt: '2026-09-11T11:39:38Z',
      observations: 1,
      method: 'Read of the public vendor detail record, which lists one endpoint: https://status.openai.com, regions [us-east].',
    },
    limitations: [
      'This is an architectural analysis. No attack was performed, no vulnerability is reported, and no provider control was tested. Nothing here should be read as a finding about any provider.',
      'The reference architecture is deliberately generic. A deployment behind a corporate egress proxy, a private interconnect or a self-hosted gateway has a materially different boundary, and several of the recommendations here are already satisfied there.',
      'Provider behaviour changes faster than any paper. Claims about what a provider does or does not disclose are tied to the documentation accessed on the dates in the references and may not hold later.',
      'The paper argues from what a consumer can verify. Where it says a property is unobservable, that is a statement about the public API contract, not about the provider’s internal instrumentation.',
      'It does not address model output integrity - prompt injection, retrieval poisoning or output filtering - which is a distinct and larger subject.',
    ],
    recommendations: [
      {
        title: 'Draw the boundary before you choose the provider',
        detail:
          'Enumerate the zones and what crosses each one. The exercise usually shows that prompt content leaves the trust domain carrying data nobody classified, and that is cheaper to fix before integration than after.',
      },
      {
        title: 'Treat the status plane and the serving plane as separate dependencies',
        detail:
          'Monitor them separately, attribute them separately, and never roll them into one availability figure. A green status site is not evidence about the inference path, and an availability record that conflates them will misdirect an incident.',
      },
      {
        title: 'Make egress to the model boundary explicit and recorded',
        detail:
          'A single named egress point with a logged, redacted record of what left the domain turns an unenforceable contractual control into an auditable one, and gives incident response something to reconstruct from.',
      },
      {
        title: 'Bind retries to a budget, not only to a backoff curve',
        detail:
          'A token and cost budget per request path converts retry storms from a financial incident into a degraded-mode decision the application can make deliberately.',
      },
      {
        title: 'Pin what you can, and record what you cannot',
        detail:
          'Model name, API version and endpoint host are pinnable. The serving region and the underlying model version usually are not. Record both the pinned value and the observed response metadata, so a routing change is at least detectable after the fact.',
      },
    ],
    references: [
      {
        id: 'nist-800-207',
        kind: 'standard',
        title: 'Zero Trust Architecture',
        publisher: 'National Institute of Standards and Technology',
        identifier: 'NIST SP 800-207',
        publishedAt: '2020-08-11',
        url: 'https://csrc.nist.gov/pubs/sp/800/207/final',
        accessedAt: '2026-09-11',
        note: 'Trust boundaries, policy decision points and the requirement that no zone be trusted by virtue of its location.',
      },
      {
        id: 'rfc-8446',
        kind: 'rfc',
        title: 'The Transport Layer Security (TLS) Protocol Version 1.3',
        publisher: 'IETF',
        identifier: 'RFC 8446',
        publishedAt: '2018-08-01',
        url: 'https://www.rfc-editor.org/rfc/rfc8446',
        accessedAt: '2026-09-11',
        note: 'What a TLS 1.3 handshake establishes about the peer - and the fact that it says nothing about the application behind it.',
      },
      {
        id: 'openai-status-api',
        kind: 'vendor-documentation',
        title: 'OpenAI status site',
        publisher: 'OpenAI',
        url: 'https://status.openai.com/',
        accessedAt: '2026-09-11',
        note: 'The endpoint RELIASTRA observes. Enumerates provider-defined components; it is not the inference API.',
      },
      {
        id: 'openai-platform-docs',
        kind: 'vendor-documentation',
        title: 'OpenAI platform documentation - API reference and rate limits',
        publisher: 'OpenAI',
        url: 'https://platform.openai.com/docs',
        accessedAt: '2026-09-11',
        note: 'The request contract an application actually depends on, including the retry-after semantics that make backoff a quota control.',
      },
      {
        id: 'reliastra-observed-endpoint',
        kind: 'reliastra-measurement',
        title: 'RELIASTRA public measurement API - vendor detail, openai',
        publisher: 'Reliastra, Inc.',
        url: 'https://api.reliastra.com/v1/vendors/openai',
        accessedAt: '2026-09-11',
        note: 'Captured 11 September 2026 at 11:39:38 UTC. One endpoint: https://status.openai.com, regions [us-east].',
      },
      {
        id: 'owasp-llm',
        kind: 'security-advisory',
        title: 'OWASP Top 10 for Large Language Model Applications',
        publisher: 'OWASP',
        url: 'https://owasp.org/www-project-top-10-for-large-language-model-applications/',
        accessedAt: '2026-09-11',
        note: 'Referenced for scope only: this paper deliberately does not cover model output integrity.',
      },
    ],
    artifacts: [
      {
        kind: 'diagram',
        label: 'Figure 1 - the dependency chain from application to model serving plane',
        description:
          'Every hop between an application and a served token, annotated with what crosses the hop and where it can be observed or altered.',
      },
      {
        kind: 'diagram',
        label: 'Figure 2 - trust zones across an AI API boundary',
        description:
          'The application trust zone, the gateway, the provider control plane and the model serving plane, with the enforceable control at each boundary.',
      },
      {
        kind: 'diagram',
        label: 'Figure 3 - failure propagation from provider degradation to application saturation',
        description:
          'The cascade: upstream latency, retry amplification, connection pressure, queue growth, worker saturation, application degradation.',
      },
    ],
    relatedEvidence: [
      {
        href: '/research/ai-infrastructure',
        label: 'AI infrastructure status & reliability hub',
        description: 'Independently measured records for AI provider endpoints, with their stated limits.',
      },
      {
        href: '/track/openai',
        label: 'The live OpenAI record',
        description: 'The status-plane record this paper uses to separate the two planes.',
      },
      {
        href: '/external-dependency-intelligence',
        label: 'External Dependency Intelligence',
        description: 'The category: observing dependencies from outside both stacks.',
      },
      {
        href: '/security',
        label: 'RELIASTRA security',
        description: 'How RELIASTRA itself handles the data it observes.',
      },
    ],
    publishedAt: '2026-09-11',
  },

  {
    slug: 'aws-iam-policy-evaluation-order',
    researchQuestion:
      'What is the exact decision procedure AWS executes when identity-based and resource-based policies disagree, and which parts of that procedure can an engineer verify before deployment rather than after a denial?',
    abstract:
      'AWS evaluates every request against a single deterministic procedure spanning seven classes of policy, and the order is published: an explicit deny short-circuits across all of them, then Organizations resource control policies, then service control policies, then resource-based policies, then identity-based policies, then permissions boundaries, then session policies. ' +
      'Only two of the seven can grant anything; four are ceilings that can only subtract. ' +
      'This paper restates the procedure as an algebra - short-circuit, cap, grant - and works through three consequences that summaries of the documentation omit. ' +
      'First, the union of identity-based and resource-based permissions inside one account means a restrictive resource policy cannot tighten a permissive identity policy; reduction requires a ceiling or an explicit Deny. ' +
      'Second, whether a resource-based Allow survives an implicit deny in a permissions boundary or session policy depends on the principal form the policy names: a grant to an IAM user ARN or to a role session ARN is not capped, a grant to a role ARN is. ' +
      'Third, no verification route available before deployment evaluates all seven classes - the IAM Policy Simulator does not evaluate RCPs, does not accept session policies and does not simulate resource-based policies for IAM roles, while Access Analyzer custom policy checks take policy documents rather than request contexts. ' +
      'The paper closes with the attribution consequence: the decoded authorization message distinguishes an explicit deny from an absent allow but does not name the deciding class, so the CloudTrail principal type is the input that selects which branch of the procedure applied. ' +
      'Nothing here was measured. No AWS account was used, no simulator response was captured and no policy was evaluated against a live control plane; every finding is cited to an AWS primary source or argued from one, and the two places where the documentation does not settle a question are reported as unsettled rather than resolved.',
    keyFindings: [
      {
        claim:
          'The documented procedure evaluates seven policy classes in a fixed order - explicit deny first across all of them, then Organizations RCPs, then SCPs, then resource-based policies, then identity-based policies, then permissions boundaries, then session policies - and only two of the seven can grant anything. An Allow written into an SCP, an RCP, a permissions boundary or a session policy is inert by construction.',
        basis: 'sourced',
      },
      {
        claim:
          'Inside one account the two granting classes combine by union, so a restrictive resource-based policy cannot reduce what a permissive identity-based policy grants. The common design of a broad role policy plus a tight bucket policy does not narrow effective permissions; only a ceiling or an explicit Deny does.',
        basis: 'sourced',
      },
      {
        claim:
          'Whether a resource-based Allow survives an implicit deny in a permissions boundary or a session policy is a function of the principal form the policy names. A grant to an IAM user ARN or to an IAM role session ARN is not so limited; a grant to an IAM role ARN is; and a grant made through the aws:PrincipalArn condition key with a wildcard Principal is limited only by an explicit deny in the identity-based policies.',
        basis: 'sourced',
      },
      {
        claim:
          'The documented order of RCPs before SCPs cannot change any verdict. Both are ceilings that deny only when no applicable Allow exists, and an explicit Deny short-circuits the whole procedure at stage one, so the two commute. The order describes the implementation rather than a priority, which matters when a denial has to be attributed to one of them.',
        basis: 'reasoned',
      },
      {
        claim:
          'A cross-account request is two independent evaluations - the trusted account on the principal side and the trusting account on the resource side - and the request is allowed only if both return Allow. The same-account union rule does not survive the trust boundary, which is why a caller-side policy validated in isolation still produces a denial.',
        basis: 'sourced',
      },
      {
        claim:
          'No verification route available before deployment evaluates all seven classes. The IAM Policy Simulator does not evaluate RCPs, does not accept session policies, and - in AWS words - does not support simulation of resource-based policies for IAM roles; Access Analyzer custom policy checks compare policy documents and take no request context, so no principal and no ceiling is in scope.',
        basis: 'sourced',
      },
      {
        claim:
          'Attributing a denial requires more than the denial itself. The decoded authorization message states whether the request was denied by an explicit deny or by the absence of an explicit allow, and names the principal, action, resource and condition values, but it does not name the deciding policy class. The CloudTrail principal type is what selects the branch of the resource-based rule the request took, and it is usually read last.',
        basis: 'sourced',
      },
    ],
    scope:
      'The single-account authorisation procedure and the cross-account conjunction, as AWS documents them, together with the verification and attribution consequences of both. ' +
      'Per-service semantics, privilege escalation paths, VPC endpoint policies and attribute-based access control as a design pattern are out of scope. ' +
      'So is any measurement: no AWS account was used for this paper, no request was issued and no policy was evaluated against a live control plane.',
    methodologySummary:
      'Close reading of AWS primary documentation - the IAM User Guide pages on policy evaluation logic, cross-account evaluation and permissions boundaries, the Organizations User Guide pages on SCPs and RCPs, and the API and CLI references for each verification route - restated as an algebra over policy classes and then applied exhaustively to enumerate a decision matrix of twenty-six request contexts. ' +
      'The documented exceptions are expressed as predicates that fire before the general procedure is allowed to conclude anything about a grant. ' +
      'Verification routes are compared by the shape of question each can answer rather than by feature list, which is what exposes the gap. ' +
      'Peer-reviewed accounts of the engine AWS operates against its own policy language are cited for the complexity of the underlying problem. All sources were read on 13 September 2026.',
    domains: ['Cloud security', 'Zero trust', 'Dependency security'],
    researchType: 'Architecture analysis',
    evidenceBasis: 'sourced',
    entities: [
      { role: 'vendor', name: 'Amazon Web Services', note: 'the control plane whose authorisation procedure is analysed' },
      { role: 'system', name: 'AWS Identity and Access Management', note: 'the service that evaluates the request; the procedure under analysis' },
      { role: 'system', name: 'AWS Organizations', note: 'attaches the two organisational ceilings above the account' },
      { role: 'system', name: 'Resource control policy', note: 'ceiling attached on the resource side; evaluated second' },
      { role: 'system', name: 'Service control policy', note: 'ceiling attached on the principal side; evaluated third' },
      { role: 'system', name: 'IAM permissions boundary', note: 'ceiling on an IAM user or role; caps the identity-based grant' },
      { role: 'system', name: 'AWS STS session policy', note: 'ceiling carried by a temporary session; evaluated last' },
      { role: 'system', name: 'IAM Policy Simulator', note: 'SimulatePrincipalPolicy and SimulateCustomPolicy; a verification route, not the enforcement engine' },
      { role: 'system', name: 'IAM Access Analyzer', note: 'custom policy checks: check-no-new-access and check-access-not-granted' },
      { role: 'system', name: 'Zelkova', note: 'the SMT-based policy analysis engine behind Access Analyzer' },
      { role: 'system', name: 'AWS CloudTrail', note: 'the record from which the principal type is read' },
      { role: 'system', name: 'sts:DecodeAuthorizationMessage', note: 'returns explicit deny versus absent allow, not the deciding policy class' },
      { role: 'dependency', name: 'Amazon S3', note: 'the example resource carrying a resource-based policy' },
      { role: 'dependency', name: 'AWS KMS', note: 'the documented exception in which the key policy is authoritative' },
      { role: 'standard', name: 'NIST SP 800-207', note: 'zero-trust vocabulary: per-request authorisation, no trust by location' },
    ],
    limitations: [
      'AWS publishes the evaluation algorithm as a specification and does not publish the enforcement code. Every claim here is about documented behaviour, not about an implementation, and the difference is not recoverable from documentation.',
      'This paper measured nothing. No AWS account was used, no request was issued, no simulator response was captured and no policy was evaluated against a live control plane. Findings are cited or reasoned and are labelled as one or the other.',
      'Two cases are left unsettled because AWS does not settle them: whether a permissions boundary or session policy caps a resource-based grant written against an IAM role ARN in the presence of an identity-based implicit deny, and the third bullet of the session-policy stage, which read in sequence appears to allow a role session that the preceding bullet has already denied. Both are reported rather than resolved.',
      'Behaviour is service-specific. Which actions support resource-based policies, and how a given service combines them with identity-based policies, is documented per service. This paper names S3, KMS and IAM role trust policies as examples and does not enumerate services.',
      'The verification-capability matrix reflects published documentation and third-party reports as of the access dates shown. AWS changed the simulator surface in July 2026 and can change it again; two entries in that matrix rest on third-party reports and are labelled as reports at the point of use.',
      'No customer policy, account identifier, principal name or credential appears in this paper or in its artifact directory. Every ARN, principal name and bucket name in an example is an invented fixture and is presented as one.',
    ],
    recommendations: [
      {
        title: 'Decide which plane is primary, at design time',
        detail:
          'For a resource shared across accounts or teams the resource is the control plane and its policy is the authoritative statement; for a workload inside one account the identity is primary and resource policies are additions rather than constraints. Writing the choice down is the cheapest control available and it is what makes the other five reviewable.',
      },
      {
        title: 'Stop tightening with resource policies inside one account',
        detail:
          'A restrictive bucket policy against a permissive role policy is a union, and the permissive side wins. Use a permissions boundary, a service control policy, a resource control policy or an explicit Deny - the only four mechanisms that reduce effective permissions inside an account.',
      },
      {
        title: 'Name the principal form deliberately in every resource-based policy',
        detail:
          'A grant to a role ARN is capped by the boundary and session policy attached to that role; a grant to the role session ARN is not. If the boundary is meant to apply, the policy has to name the role, and that decision is currently made in code and reviewed nowhere.',
      },
      {
        title: 'Gate policy changes with a diff check rather than a simulation',
        detail:
          'check-no-new-access answers the question a pipeline can actually ask, and it answers it formally. Reserve the simulator for request-shaped questions and accept that it cannot answer the ones involving RCPs, session policies or resource-based grants to IAM roles.',
      },
      {
        title: 'Write Deny conditions with BoolIfExists',
        detail:
          'Bool treats an absent context key as no match, so a Deny guarding MFA written with Bool does not fire for the session that has no MFA context - the session the statement was written to stop. BoolIfExists treats the absent key as a match.',
      },
      {
        title: 'Attribute a denial from the record, not from the message',
        detail:
          'Read the CloudTrail principal type first, then the decoded authorization message if the operation returned one, then the policy inventory. Reading policies first is how an hour disappears into a permissions boundary that never applied to the principal that made the request.',
      },
    ],
    references: [
      {
        id: 'iam-eval-logic',
        kind: 'vendor-documentation',
        title: 'Policy evaluation logic',
        publisher: 'Amazon Web Services',
        url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html',
        accessedAt: '2026-09-13',
        note: 'The union of identity-based and resource-based permissions inside one account; the intersection of identity-based policies with a permissions boundary; the intersection of all three with an SCP.',
      },
      {
        id: 'iam-eval-denyallow',
        kind: 'vendor-documentation',
        title: 'How AWS enforcement code logic evaluates requests to allow or deny access',
        publisher: 'Amazon Web Services',
        url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic_policy-eval-denyallow.html',
        accessedAt: '2026-09-13',
        note: 'The stage order quoted in this paper, the root-user exception, RCPFullAWSAccess, and the principal-type branch of the resource-based stage.',
      },
      {
        id: 'iam-eval-cross-account',
        kind: 'vendor-documentation',
        title: 'Cross-account policy evaluation logic',
        publisher: 'Amazon Web Services',
        url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic-cross-account.html',
        accessedAt: '2026-09-13',
        note: 'Trusted and trusting accounts, the two evaluations, and the requirement that both return Allow. Also notes that RAM policy fragments can affect evaluation.',
      },
      {
        id: 'iam-boundaries',
        kind: 'vendor-documentation',
        title: 'Permissions boundaries for IAM entities',
        publisher: 'Amazon Web Services',
        url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html',
        accessedAt: '2026-09-13',
        note: 'Evaluating effective permissions with boundaries, by principal form; and the warning that a Deny carrying NotPrincipal always denies a principal with a boundary attached.',
      },
      {
        id: 'iam-role-principals',
        kind: 'vendor-documentation',
        title: 'AWS JSON policy elements: Principal - role and role session principals',
        publisher: 'Amazon Web Services',
        url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_principal.html',
        accessedAt: '2026-09-13',
        note: 'The ARN forms distinguished in Table 2: role, assumed-role session, and federated user session.',
      },
      {
        id: 'iam-cross-account-resource-access',
        kind: 'vendor-documentation',
        title: 'Cross account resource access in IAM',
        publisher: 'Amazon Web Services',
        url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies-cross-account-resource-access.html',
        accessedAt: '2026-09-13',
        note: 'Why role trust policies and KMS key policies are exceptions to the union rule.',
      },
      {
        id: 'org-rcps',
        kind: 'vendor-documentation',
        title: 'Resource control policies',
        publisher: 'Amazon Web Services',
        url: 'https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_rcps.html',
        accessedAt: '2026-09-13',
        note: 'RCPs attach on the resource side of the account where they are applied.',
      },
      {
        id: 'org-scps',
        kind: 'vendor-documentation',
        title: 'Service control policies',
        publisher: 'Amazon Web Services',
        url: 'https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html',
        accessedAt: '2026-09-13',
        note: 'SCPs attach on the principal side; they filter permissions and never grant them.',
      },
      {
        id: 'kms-key-policies',
        kind: 'vendor-documentation',
        title: 'Key policies',
        publisher: 'Amazon Web Services',
        url: 'https://docs.aws.amazon.com/kms/latest/developerguide/key-policies.html',
        accessedAt: '2026-09-13',
        note: 'The key policy is authoritative for a customer managed key: an identity-based Allow is insufficient unless the key policy grants or delegates.',
      },
      {
        id: 'iam-notprincipal',
        kind: 'vendor-documentation',
        title: 'AWS JSON policy elements: NotPrincipal',
        publisher: 'Amazon Web Services',
        url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_notprincipal.html',
        accessedAt: '2026-09-13',
        note: 'The element AWS recommends replacing with ArnNotEquals on aws:PrincipalArn when a Deny has to exclude named principals.',
      },
      {
        id: 'sim-principal',
        kind: 'vendor-documentation',
        title: 'SimulatePrincipalPolicy - AWS IAM API Reference',
        publisher: 'Amazon Web Services',
        url: 'https://docs.aws.amazon.com/IAM/latest/APIReference/API_SimulatePrincipalPolicy.html',
        accessedAt: '2026-09-13',
        note: 'The request-shaped verification route: a principal, an action list, resource ARNs and context entries.',
      },
      {
        id: 'sim-custom',
        kind: 'vendor-documentation',
        title: 'SimulateCustomPolicy - AWS IAM API Reference',
        publisher: 'Amazon Web Services',
        url: 'https://docs.aws.amazon.com/IAM/latest/APIReference/API_SimulateCustomPolicy.html',
        accessedAt: '2026-09-13',
        note: 'Quoted in this paper: the simulator evaluates identity-based policies and SCPs including their condition keys and resource scoping; simulation of resource-based policies is not supported for IAM roles; results can differ from the live environment.',
      },
      {
        id: 'aa-check-no-new-access',
        kind: 'vendor-documentation',
        title: 'check-no-new-access - AWS CLI Command Reference',
        publisher: 'Amazon Web Services',
        url: 'https://docs.aws.amazon.com/cli/latest/reference/accessanalyzer/check-no-new-access.html',
        accessedAt: '2026-09-13',
        note: 'Two policy documents and a policy type in; PASS or FAIL with reasons out. No request context is an input.',
      },
      {
        id: 'sts-decode-auth',
        kind: 'vendor-documentation',
        title: 'DecodeAuthorizationMessage - AWS Security Token Service API Reference',
        publisher: 'Amazon Web Services',
        url: 'https://docs.aws.amazon.com/STS/latest/APIReference/API_DecodeAuthorizationMessage.html',
        accessedAt: '2026-09-13',
        note: 'The documented contents of a decoded message: explicit deny versus absent allow, principal, action, resource, condition key values. Only certain operations return one.',
      },
      {
        id: 'ct-useridentity',
        kind: 'vendor-documentation',
        title: 'CloudTrail userIdentity element',
        publisher: 'Amazon Web Services',
        url: 'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-event-reference-user-identity.html',
        accessedAt: '2026-09-13',
        note: 'Principal type, ARN and session context - including sessionIssuer and session attributes - as recorded for each call.',
      },
      {
        id: 'zelkova-fmcad-2018',
        kind: 'academic',
        title: 'Semantic-based Automated Reasoning for AWS Access Policies using SMT',
        publisher: 'IEEE, Formal Methods in Computer-Aided Design (FMCAD)',
        identifier: 'DOI 10.23919/FMCAD.2018.8602994',
        publishedAt: '2018-10-01',
        url: 'https://ieeexplore.ieee.org/document/8602994',
        note: 'The formalisation of the AWS policy language and the Zelkova analysis tool; the underlying problem is described as PSPACE-complete.',
      },
      {
        id: 'stratified-abstraction-cav-2020',
        kind: 'academic',
        title: 'Stratified Abstraction of Access Control Policies',
        publisher: 'Springer, Computer Aided Verification (CAV 2020), LNCS 12224',
        identifier: 'DOI 10.1007/978-3-030-53288-8_9',
        publishedAt: '2020-07-14',
        url: 'https://link.springer.com/chapter/10.1007/978-3-030-53288-8_9',
        note: 'Stratified predicate abstraction, deployed as the engine behind IAM Access Analyzer, with the account as the zone of trust.',
      },
      {
        id: 'billion-smt-queries-tacas-2022',
        kind: 'academic',
        title: 'A Billion SMT Queries a Day (Invited Paper)',
        publisher: 'Springer, Tools and Algorithms for the Construction and Analysis of Systems (TACAS)',
        identifier: 'DOI 10.1007/978-3-031-13185-1_1',
        publishedAt: '2022-08-24',
        url: 'https://link.springer.com/chapter/10.1007/978-3-031-13185-1_1',
        note: 'Scaling Zelkova from a thousand SMT invocations a day to a billion in five years, with a synchronous call on policy attachment.',
      },
      {
        id: 'nist-800-207',
        kind: 'standard',
        title: 'Zero Trust Architecture',
        publisher: 'National Institute of Standards and Technology',
        identifier: 'NIST SP 800-207',
        publishedAt: '2020-08-11',
        url: 'https://csrc.nist.gov/pubs/sp/800/207/final',
        accessedAt: '2026-09-13',
        note: 'Per-request authorisation and the requirement that no resource be trusted by virtue of its location.',
      },
      {
        id: 'awscli-issue-10314',
        kind: 'web',
        title: 'iam simulate-principal-policy and simulate-custom-policy ignore --resource-policy for sts:Assume* actions',
        publisher: 'aws-cli issue #10314, filed by a third party',
        publishedAt: '2026-05-15',
        url: 'https://github.com/aws/aws-cli/issues/10314',
        accessedAt: '2026-09-13',
        note: 'A third-party report, not confirmed by AWS, that a trust policy passed to the simulator is parsed and then discarded for sts:Assume* actions. Recorded here as a report.',
      },
      {
        id: 'simulator-console-migration',
        kind: 'web',
        title: 'IAM Policy Simulator has migrated to the IAM console',
        publisher: 'Classmethod DevelopersIO',
        publishedAt: '2026-08-02',
        url: 'https://dev.classmethod.jp/en/articles/iam-policy-simulator-iam-console-update/',
        accessedAt: '2026-09-13',
        note: 'Third-party write-up of the July 2026 change, reporting the retirement of the standalone simulator site and the new policy-exclusion parameter. The AWS announcement URL it cites was not fetched directly for this paper.',
      },
      {
        id: 'reliastra-research-agenda',
        kind: 'reliastra-measurement',
        title: 'The RELIASTRA research agenda',
        publisher: 'Reliastra, Inc.',
        url: 'https://reliastra.com/research/reliastra-research-agenda',
        accessedAt: '2026-09-13',
        note: 'The standard this paper is written against, including what RELIASTRA refuses to publish.',
      },
      {
        id: 'reliastra-ai-trust-boundary',
        kind: 'reliastra-measurement',
        title: 'The trust boundary of an AI API dependency',
        publisher: 'Reliastra, Inc.',
        url: 'https://reliastra.com/research/cloud-security/ai-api-trust-boundary',
        accessedAt: '2026-09-13',
        note: 'The same trust boundary in a different plane: what leaves a domain you control, rather than what it accepts from outside.',
      },
    ],
    artifacts: [
      {
        kind: 'repository',
        label: 'Paper artifact directory',
        description:
          'The bibliography with access dates and the method used to verify each source, the figure index, the license for material RELIASTRA authored, and the reproduction steps for re-checking any claim in this paper against its primary source.',
        path: 'research/aws-iam-evaluation-order',
      },
      {
        kind: 'script',
        label: 'Figure exporter',
        description:
          'Reads the rendered paper, lifts each figure SVG out of the HTML and rewrites the closed set of Tailwind class tokens into presentation attributes, producing the five standalone files listed above. An unrecognised token is a hard failure, so an export cannot drift from the published figure. PNG output is produced only when an SVG rasteriser is present; the SVG is the artifact of record.',
        path: 'research/aws-iam-evaluation-order/figures/export-figures.mjs',
        format: 'text/javascript',
      },
      {
        kind: 'diagram',
        label: 'Figure 1 - the seven stages of the single-account procedure',
        description:
          'Each stage labelled with its algebraic role: one short-circuit, four ceilings, two grants, plus the root-user bypass and both terminals.',
        path: 'research/aws-iam-evaluation-order/figures/fig-1-evaluation-pipeline.svg',
        format: 'image/svg+xml',
        sha256: 'e507e42f24b150b30ff404530744d7ed60e0c80334395488c9429d170f2b4b92',
      },
      {
        kind: 'diagram',
        label: 'Figure 2 - union, ceilings, and the cross-account conjunction',
        description:
          'Same-account union of the two granting classes; the four ceilings as nested rings; two account bands divided by a trust boundary, each producing its own verdict.',
        path: 'research/aws-iam-evaluation-order/figures/fig-2-policy-algebra.svg',
        format: 'image/svg+xml',
        sha256: '7262bfc25cccedf44e69da33e717942b385067a20f2d3e327deffcb9a581e39c',
      },
      {
        kind: 'diagram',
        label: 'Figure 3 - the same-account tightening fallacy',
        description:
          'The designer model against the documented outcome, and the four mechanisms that do reduce effective permissions inside one account.',
        path: 'research/aws-iam-evaluation-order/figures/fig-3-tightening-fallacy.svg',
        format: 'image/svg+xml',
        sha256: 'e965c792d5df10d79c479ab121771a11d9519ea29c3994cff539a44cc9ffc0b0',
      },
      {
        kind: 'diagram',
        label: 'Figure 4 - the verification gap',
        description:
          'Seven policy classes against four verification routes, each cell marked evaluated, conditional or unsupported.',
        path: 'research/aws-iam-evaluation-order/figures/fig-4-verification-gap.svg',
        format: 'image/svg+xml',
        sha256: '3c11581de38e1d90c23d7513bbf93a800c4c08e840d7eda8cffb51f6935f4428',
      },
      {
        kind: 'diagram',
        label: 'Figure 5 - the attribution path',
        description:
          'From an observed AccessDenied to the deciding policy class, through the error message, the decoded authorization message, the CloudTrail principal type and the account policy inventory.',
        path: 'research/aws-iam-evaluation-order/figures/fig-5-attribution-path.svg',
        format: 'image/svg+xml',
        sha256: 'aba424c1846949ae410b564b3f53fefd484c70e61ffeb5b267f36dca537e7a2a',
      },
    ],
    relatedEvidence: [
      {
        href: '/research/cloud-security/ai-api-trust-boundary',
        label: 'The trust boundary of an AI API dependency',
        description:
          'The same boundary in a different plane, and the same failure mode: an error that names the wrong component.',
      },
      {
        href: '/glossary/control-plane',
        label: 'Control plane',
        description: 'The definition, and why a control-plane failure presents as an application bug.',
      },
      {
        href: '/track',
        label: 'Public dependency index',
        description: 'Independently measured records for the vendors RELIASTRA makes public.',
      },
    ],
    author: 'adesina-emmanuel',
    publishedAt: '2026-09-13',
  },

  /* ── AI infrastructure (hub) ───────────────────────────────────────────── */
  {
    slug: 'status-page-payload-anatomy',
    hub: 'ai-infrastructure',
    researchQuestion:
      'What does a hosted status-page payload actually assert, and how much incident evidence does it contain?',
    abstract:
      'Status pages are routinely treated as incident evidence. They are better than that framing suggests in one respect and far worse in another. ' +
      'On 11 September 2026 RELIASTRA read the machine-readable summary payload of OpenAI’s status site and found 25 provider-defined components, every one marked operational, under a single aggregate indicator of "none". ' +
      'The payload’s structural content is genuinely useful: it is a service inventory, and it names components - Codex API, Realtime, Batch, Embeddings, Deep Research - that no independent observer would guess. ' +
      'Its temporal content is close to empty: the page and all 25 components carry the identical timestamp 2026-07-09T19:25:56Z, sixty-three days and sixteen hours before the read, and that timestamp corresponds to the creation of the newest component. ' +
      'The payload therefore asserts a current state without asserting when that state was last established. ' +
      'This paper separates the three things a status payload carries - a taxonomy, a current declaration, and a history - and states what each can and cannot support as evidence.',
    keyFindings: [
      {
        claim:
          'The payload returned 25 components and one aggregate indicator. The indicator is a single value over the whole page; the components are the only granularity at which a partial failure can be expressed.',
        basis: 'measured',
      },
      {
        claim:
          'page.updated_at and the updated_at of all 25 components were identical: 2026-07-09T19:25:56Z, sixty-three days and sixteen hours before the read. The newest component in the list carries the same value as its created_at, so the most recent change to the page was the addition of a component, not a change of status.',
        basis: 'measured',
      },
      {
        claim:
          'The summary payload carries no incident history at all. History lives on a separate endpoint. A reader who consumes only the summary - which is the endpoint most integrations poll - receives a current state and no record of the interval it covers.',
        basis: 'measured',
      },
      {
        claim:
          'An unchanged updated_at is consistent with sixty-three days without a declared status change, but it is not proof. The timestamp semantics are not contractually documented for this use, and a component that degraded and recovered inside one polling interval would be indistinguishable from one that never changed.',
        basis: 'reasoned',
      },
      {
        claim:
          'The component taxonomy is the most valuable part of the payload for an independent observer: it is a provider-authored statement of which services the provider considers separately reportable, which is exactly the granularity an availability record needs and almost never has.',
        basis: 'derived',
      },
      {
        claim:
          'None of the 25 components is the endpoint RELIASTRA observes. The record labelled "OpenAI" measures https://status.openai.com - the site that carries this payload - and is evidence about that site.',
        basis: 'measured',
      },
    ],
    scope:
      'One hosted status page, read once, at one timestamp. The findings describe this payload as returned on 11 September 2026. ' +
      'This paper does not evaluate OpenAI’s reliability, does not claim the provider failed to report anything, and does not generalise the timestamp semantics to other status-page hosts without evidence.',
    methodologySummary:
      'A single unauthenticated HTTPS GET of the status site’s machine-readable summary endpoint, captured verbatim with its response body versioned in this repository, followed by structural analysis of the returned JSON: component count, status distribution, timestamp distribution, and comparison of page-level and component-level timestamps against component creation times.',
    domains: ['AI infrastructure', 'Incident engineering', 'Observability'],
    researchType: 'Measurement',
    evidenceBasis: 'measured',
    entities: [
      { role: 'vendor', name: 'OpenAI' },
      { role: 'endpoint', name: 'https://status.openai.com/api/v2/summary.json', note: 'the machine-readable summary payload' },
      { role: 'organization', name: 'Atlassian', note: 'Statuspage, the host that defines the payload shape' },
      { role: 'endpoint', name: 'https://status.openai.com', note: 'the endpoint RELIASTRA observes for this vendor' },
    ],
    observation: {
      target: 'OpenAI status site, machine-readable summary payload',
      source: 'https://status.openai.com/api/v2/summary.json',
      protocol: 'HTTPS GET, JSON response, unauthenticated',
      regions: ['unspecified - single request, origin not recorded'],
      startedAt: '2026-09-11T11:36:00Z',
      endedAt: '2026-09-11T11:36:00Z',
      observations: 1,
      method: 'Single read of the public summary endpoint; response captured verbatim.',
    },
    dataset: {
      name: 'OpenAI status-page summary payload, 11 September 2026',
      description:
        'The complete JSON response as returned, including all 25 components with their identifiers, statuses and timestamps.',
      path: 'research/availability-record-audit/data/openai-statuspage-summary-2026-09-11T1136Z.json',
      format: 'application/json',
      license: 'Captured verbatim from a public endpoint; quoted for analysis. Copyright remains with the publisher.',
      variables: [
        { name: 'page.updated_at', type: 'string', description: 'Page-level last-change timestamp.' },
        { name: 'status.indicator', type: 'string', description: 'Aggregate indicator: none, minor, major, critical.' },
        { name: 'components[].name', type: 'string', description: 'Provider-defined service name.' },
        { name: 'components[].status', type: 'string', description: 'Per-component declared state.' },
        { name: 'components[].updated_at', type: 'string', description: 'Per-component last-change timestamp.' },
        { name: 'components[].created_at', type: 'string', description: 'When the component was added to the page.' },
      ],
    },
    limitations: [
      'One read. A single timestamp cannot establish how often the payload changes, and this paper makes no claim about the interval between updates.',
      'The inference that an unchanged updated_at implies an unchanged status rests on observed correlation - the timestamp moved when a component was added - not on documented semantics. Statuspage does not publish a guarantee that every status change advances it.',
      'A status change that occurred and was resolved between two reads is invisible to any polling observer. This is a property of polling, not of this provider.',
      'The absence of incident history in the summary payload is a statement about this endpoint. The history endpoint exists and was not captured here.',
      'RELIASTRA observes this site as a dependency and is also analysing it. The two roles are separate: the analysis uses one captured payload, not the observation record.',
    ],
    recommendations: [
      {
        title: 'Treat the component taxonomy as data, and the indicator as opinion',
        detail:
          'Harvest the component list as a provider-authored service inventory - it tells you what the provider considers separately reportable. Treat the aggregate indicator as a single unqualified claim about the whole page.',
      },
      {
        title: 'Poll the history endpoint, not only the summary',
        detail:
          'The summary carries a current state and no interval. Without the history endpoint you cannot distinguish a long stable period from a change that was resolved between two polls.',
      },
      {
        title: 'Store the payload, not the interpretation',
        detail:
          'A status page is a counterparty record. Archive the raw response with its fetch timestamp so a later reader can tell what was declared from what was concluded.',
      },
      {
        title: 'Never merge a status declaration into a measured availability figure',
        detail:
          'They are different kinds of evidence with different authors. Reconcile them on a shared timeline and keep both; the disagreement is the interesting part.',
      },
    ],
    references: [
      {
        id: 'captured-summary',
        kind: 'reliastra-measurement',
        title: 'OpenAI status site - machine-readable summary payload',
        publisher: 'OpenAI',
        url: 'https://status.openai.com/api/v2/summary.json',
        accessedAt: '2026-09-11',
        note: 'Captured 11 September 2026 at approximately 11:36 UTC; versioned verbatim in this repository.',
      },
      {
        id: 'statuspage-api',
        kind: 'vendor-documentation',
        title: 'Statuspage API - summary, status and incidents endpoints',
        publisher: 'Atlassian',
        url: 'https://developer.atlassian.com/cloud/statuspage/rest/intro/',
        accessedAt: '2026-09-11',
        note: 'Defines the payload shape: /api/v2/status.json, /api/v2/summary.json and /api/v2/incidents.json.',
      },
      {
        id: 'reliastra-methodology',
        kind: 'reliastra-measurement',
        title: 'How RELIASTRA measures vendor reliability',
        publisher: 'Reliastra, Inc.',
        url: 'https://reliastra.com/research/how-reliastra-measures-vendor-reliability',
        accessedAt: '2026-09-11',
        note: 'Why RELIASTRA does not ingest, mirror or reconcile vendor-reported state.',
      },
      {
        id: 'reliastra-observed-endpoint',
        kind: 'reliastra-measurement',
        title: 'RELIASTRA public measurement API - vendor detail, openai',
        publisher: 'Reliastra, Inc.',
        url: 'https://api.reliastra.com/v1/vendors/openai',
        accessedAt: '2026-09-11',
        note: 'One observed endpoint: https://status.openai.com, regions [us-east].',
      },
    ],
    artifacts: [
      {
        kind: 'dataset',
        label: 'Captured status-page summary payload',
        description:
          'The complete response as returned on 11 September 2026, with all 25 components and their timestamps.',
        path: 'research/availability-record-audit/data/openai-statuspage-summary-2026-09-11T1136Z.json',
        format: 'application/json',
      },
      {
        kind: 'diagram',
        label: 'Figure 1 - what a status payload carries',
        description:
          'Taxonomy, current declaration and history as three separate evidence classes, with what each can support.',
      },
    ],
    relatedEvidence: [
      {
        href: '/track/openai',
        label: 'The live OpenAI record',
        description: 'The independently measured record for the same vendor, kept deliberately unreconciled.',
      },
      {
        href: '/glossary/vendor-reported-status',
        label: 'Vendor-reported status',
        description: 'The definition, and why it is a different evidence class from measurement.',
      },
      {
        href: '/research/ai-infrastructure/is-openai-down',
        label: '"Is OpenAI down?" - how to answer the question honestly',
        description: 'The three claims the question hides.',
      },
    ],
    publishedAt: '2026-09-11',
  },
] as const;

/** Lookup by slug. */
export function researchPaper(slug: string): ResearchPaper | undefined {
  return RESEARCH_PAPERS.find((p) => p.slug === slug);
}
