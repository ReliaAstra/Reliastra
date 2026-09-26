# RELIASTRA Public Intelligence Architecture - Audit, Target Design and Rollout Plan

Authored: 2026-09-24. Revised: 2026-09-26 (phases 0-10 landed). Baseline: commit 4055ba5.
Scope: what exists (audited, tested, in production semantics), what to build, in
what order, and why each piece respects the constraints that govern this project.

This document is the reference for the current change set. When a later phase
contradicts it, the code wins and this file should be revised in the same commit.

## 1. Audit findings (verified, not assumed)

**What already works and must be preserved**

- The measurement pipeline: `checks/probe.py` executes HTTP probes, persists
  `Observation` rows, feeds `checks/detection.py`, a deterministic,
  fully unit-tested state machine that opens and resolves incidents on
  configurable consecutive-failure/recovery thresholds, and stamps the incident
  window at the beginning of the failing run so evidence covers the whole outage.
- The outbox pattern: `enqueue_observation_outbox` writes a durable outbox row
  in the same transaction as the observation; workers flush it asynchronously.
  Measurement is therefore never coupled to external publishing, attribution or
  evidence generation; retry is safe; failure of a publisher can never lose data.
- The public observation path: Celery worker in `vendors/tasks.py` stamps the
  real deployment region into every observation from configuration. No region
  is fake-reported.
- The public observatory frontend: ISR pages built only from the public
  measurement API (`/v1/vendors*`), with canonical URLs, param-free
  pagination (cursor), and structured data generated only for states that
  actually exist (healthy / degraded / critical / unknown).
- The public evidence channel: `incidents/public` returns only incidents that
  have (`has_evidence_report`) published, deterministic, checksummed artifacts.
  Pages exist only where evidence exists.
- Evidence integrity: artifacts are hash-chained, methodology-versioned
  (`v1.0.x`), reproducible from stored observations; a verification doc and CLI
  exist for third-party re-computation.

**Structural weaknesses that the new design corrects**

- ~28 vendors were effectively discoverable, all labelled `SaaS`; the system
  knowledge plane is thin relative to what the probe fleet could tell us.
- No entity model for vendor / category; categories were free text on rows.
- The public incident list was empty by design; observations were the only
  public-signal, so the site told stories about availability but never about
  incidents.
- No routing for category or question pages; no feeds; no machine-readable
  dataset; no lifecycle for low-value URLs.

## 2. Product theses that constrain all of this

- One canonical source of truth per domain object; no parallel versions of
  vendors, observations, incidents, evidence or attribution.
- Public pages contain at least one of: RELIASTRA observation, incident,
  dataset, methodology, or technical analysis. No generic content.
- Every claim carries provenance: OBSERVED / CORRELATED / REPORTED BY VENDOR /
  INFERRED / UNKNOWN are distinct states. "We do not know" is a publishable,
  first-class state.
- Regions are only ever printed from measurements; designing for multi-region
  is done in the storage schema, but no fake region ever ships.
- Indexability is curated: a finite set of URLs is allowed to index;
  parameterized duplicates are canonicalized or noindex; gone content is 410,
  not silently 404-relinked.
- Durable, idempotent pipelines; never couple DB transactions with external
  API calls directly; the outbox pattern is how anything reaches the outside.

## 3. Entity model (the canonical graph)

```
vendor_category (id, slug, name*, description, position, created_at)
     1 ─────── n vendor_tracking (id, vendor_name*, display_name, category -> slug,
                 endpoint_url, official_name, description, website_url,
                 docs_url, region_hint, is_public, created_at)
                    1 ─ n vendor_endpoint (id, vendor_id, endpoint_url, name,
                          regions jsonb, is_active, last_check_at, status_code,
                          health_status)
                                 1 ─ n observation (timescale hypertable)
                                        └─ n public_incident (this phase)
                                               stored in the incidents module,
                                               keyed by (vendor_id, endpoint_id),
                                               partial-unique open row per endpoint
```

`public_incidents` is a new table, deliberately separate from the org-scoped
`incidents` table: an org incident is a customer record with privacy, attribution
and evidence semantics; a public incident is the measurement claim itself.
They share the detector (`evaluate_detection`) and the lifecycle vocabulary so
the two surfaces can never tell two different stories about the same window.

## 4. Target architecture (this phase and beyond)

```
          probes (Celery, v1/n workers, region-stamped)
               │
               ├─> observations (authoritative time-series)
               ├─> detection (shared state machine)
               │        ├─> org incidents + attribution + evidence
               │        └─> public_incidents  ← NEW (scope: public vendors)
               │
   canonical publication records (outbox)
               │
               ├─> /v1/vendors/{slug}/incidents      (detector-derived)
               ├─> /v1/incidents  →  /v1/public/incidents   (search)
               ├─> observatory/incidents (page, curated indexability)
               ├─> /observatory/incidents/feed.xml   (RSS 2.0)
               ├─> evidence reports + JSON sidecars  (phase 5)
               ├─> question pages                    (phase 6)
               ├─> all feeds                         (phase 7 remainder)
               ├─> GitHub dataset publisher          (phase 8)
               └─> newsletter/social drafts          (phase 9)
```

## 5. Hard invariants (still in force)

- Vendor status text is never ingested; only HTTP behaviour is measured.
- Sitemap emits a URL only when the data behind it exists; unreadable data
  never retracts URLs silently; lastmod only when a real date is known.
- 200 pages carry index,follow; definite absence carries noindex; transient
  API failure throws to a 5xx so crawlers retry.
- Checks never run in the API process; publishing jobs are idempotent and
  retryable; public measurement failure must not produce fabricated states.

## 6. Migration risks and how they are handled

| Risk | Handling |
| --- | --- |
| Category value changes (auth -> identity, cdn -> cloud) | purely presentational; frontend renders category text generically; no code keys off old strings |
| endpoint_url must stay populated on vendor_trackings | registry primary target continues to feed it; list_public_vendors recent_status keeps working |
| Duplicate endpoints on re-seed | unique constraint (vendor_id, endpoint_url) already exists; seed upserts on that key |
| Region label honesty for new endpoints | create_vendor_endpoint already stamps settings.CHECK_WORKER_REGION; probe overwrites with the real label |
| Registry URL mistakes (no DNS in sandbox) | URLs chosen from well documented public status domains; a data-quality pass (phase 10) flags targets that fail first-contact probing; no target is fabricated |
| Route collision /observatory/[vendor] vs category slugs | single segment resolution: vendor first, category second, 404 otherwise |
| API route order | /v1/vendors/categories declared before /v1/vendors/{vendor_name} |
| Detection double-open under retry | partial unique index on (endpoint_id) WHERE status='open'; create-on-miss |
| Public incident id guessing | detail read joins the public vendor gate; deleting a vendor withdraws the URL |
| Filter-param crawl trap | curated indexability: bare page + single axis indexable, rest noindex+canonical to base |

## 7. Phased implementation map (status)

- Phase 0 audit: this document. DONE.
- Phase 1 canonical taxonomy + vendor entity: vendor_categories table,
  additive vendor/endpoint identity columns, typed registry. DONE.
- Phase 2 registry of 50 vendors (10 categories), idempotent registry sync,
  daily beat reconciliation plus boot time sync. DONE.
- Phase 3 category pages via single-segment resolution, category directory
  on the observatory index, category entries in sitemap.xml, public
  category API, collection structured data. DONE.
- Phase 4 public incident intelligence and /incidents search. DONE.
  - `public_incidents` table (migration 0040) in the incidents module:
    vendor/endpoint FKs cascade, denormalized endpoint_url/target/region,
    open/resolved status, severity, failure kind classifier, run provenance
    (observation ids, status codes, detection rule version, methodology
    v1.0, attribution OBSERVED), indexes on vendor/status/started_at and a
    partial unique constraint for the open row per endpoint.
  - `apply_vendor_observation` is called from the vendor probe task
    inside the same transaction as `record_observation`; a detection
    failure is isolated (try/except, logger.exception) and can never drop
    the measurement.
  - The vendor probe task now opens/resolves the public incident exactly
    like the customer detector path does; the rule is the same
    `evaluate_detection` state machine, fed with the same history slice.
  - `GET /v1/vendors/{name}/incidents` returns the real detector stream
    (was hardcoded `[]`); `GET /v1/public/incidents` is the cross-vendor
    search (vendor / category / region / status / failure_kind / since /
    until filters, cursor pagination, 60s Redis cache with graceful
    degradation, public-read rate limit).
  - Frontend: `/observatory/incidents` page (indexable bare and
    single-axis; everything else noindex + canonical to base) with the
    curated filter contract centralized in `lib/observatory/incident-search.ts`;
    `/observatory/{vendor}/incidents/{id}` gained an observed-incident branch
    rendering the public incident from `readPublicIncident(id)` when the
    evidence-published set does not carry it (wrong-vendor id stays a 404).
  - Sitemap: incident URLs both from the detector stream and the
    evidence-published stream; `/observatory/incidents` registered in
    PUBLIC_PAGES and llms-full.txt.
- Phase 7 head start (landed with phase 4): RSS 2.0 feed of public incidents
  at `/observatory/incidents/feed.xml`, items keyed by incident id (guid),
  description = the exact measurement statement, served with sane caching.
- Phase 5 public evidence + JSON sidecars. DONE.
  - `public_incident_evidence` table (migration 0041): an append-only
    per-incident ledger of frozen artifacts - version, freeze status,
    artifact schema version, generator, methodology version, SHA-256
    `data_hash`, byte size, observation provenance - and the exact canonical
    JSON bytes stored as text (not JSONB, so nothing reparses what was
    hashed). Update and delete raise at the model level.
  - The document is a pure function of stored facts: no wall-clock field,
    window bounded by `started_at` minus a fixed 900s context margin and by
    the stamped resolution observation (or `resolved_at`) on the late side,
    so a freeze regenerated at any later time reproduces the same bytes and
    hash. Long windows truncate oldest-first with explicit disclosure.
  - `public_incidents.resolution_observation_id` stamps the confirming
    recovery probe, symmetric to the failing run's `last_observation_id`.
  - Generation is a publishing job: the probe transaction enqueues a
    `public_incident_evidence_requested` outbox event in the same
    transaction as the incident transition; the outbox processor (refactored
    to an event-type handler registry) freezes idempotently; a daily beat
    task (`reconcile_public_incident_evidence`, 05:10) is the guaranteed
    recovery path. Reads never generate.
  - API: `GET /v1/public/incidents/{id}/evidence` (latest, ETag = content
    hash, methodology/schema/version headers) and
    `.../evidence/versions/{n}` (pinned, long cache); the detail response
    carries an `evidence` descriptor. 404 until frozen, and "not generated
    yet" is the only absence story told.
  - Canonical serialisation extracted to `evidence/canonical.py`; tenant
    evidence and public evidence hash with the same function.
  - Frontend: the record page and its JSON sidecar
    (`/observatory/{vendor}/incidents/{id}/index.json`, noindex) resolve one
    record through the shared loader `lib/observatory/incident-record.ts`
    (same reads, same five-outcome contract, two renderers); the observed
    record page gained an evidence-artifact section (link, hash, freeze
    status, verification recipe, explicit absence when not yet frozen).
  - Verification doc: `docs/intelligence/public-evidence.md`.
- Phase 6 question engine. DONE.
  - `lib/observatory/questions.ts`: the typed question engine. One question
    kind today (`is-down`), registered with its slug grammar, loader and
    sidecar mapper, so a second kind joins additively without forking the
    read contract, sidecar shape or indexability rules. Subjects are vendor
    slugs: a URL exists exactly when the vendor record exists; a category
    slug or unknown name is a 404, never an approximation.
  - `lib/observatory/answer.ts` gained `answerInputFromRecord`: the answer
    composition extracted from the record page, so the record's masthead and
    the question page derive ONE answer from the SAME record through the
    same `deriveState` + `buildIsDownAnswer` path. "We do not know" (stale
    or absent observation) composes and publishes like any other state.
  - `/down/{vendor}` (revalidate 60): direct answer page. Three-way contract
    identical to every observatory surface; FAQPage JSON-LD published only
    for resolved records, carrying exactly the rendered question and answer
    text; scope and region statements rendered from stored fields.
  - `/down/{vendor}/index.json`: the JSON twin (noindex, 404 JSON, 5xx on
    unreadable), same loader, pure mapper, `observed_as_of` = the freshest
    observation's own timestamp or null - never a serve-time clock.
  - Sitemap: one question URL per measured vendor from the same catalog read
    (`questionEntries` in sitemap-source, tested); no lastmod claimed.
  - The record page's answer section links the shareable answer; llms.txt
    and llms-full.txt document the pattern and its JSON twin.
  - Tests: 14 engine table tests (slug grammar, composition, sidecar,
    unreadable-throw), 11 source-contract tests (three-way outcomes,
    noindex decisions, one-source-of-truth assertions), 3 sitemap tests.
- Phase 7 RSS/Atom feeds remaining. DONE (beyond the phase 4 incidents feed).
  - `lib/observatory/feed.ts`: the one RSS 2.0 builder every feed emits
    through - guid identity rules, measurement-exact descriptions, XML
    escaping, channel wrapper, shared cache headers, and the degrade rule
    (an unreadable API yields a valid, intentionally empty document, never a
    5xx feed: feed readers hammer infrastructure hardest during storms).
  - Per-vendor incident feeds at `/observatory/{vendor}/incidents/feed.xml`:
    same public search read as the global feed with the vendor filter, so a
    subscriber sees exactly the entries the cross-vendor feed carries.
    Untracked name -> 404 (the URL was never valid); unreadable -> empty
    channel.
  - Catalog feed at `/observatory/catalog.xml`: tracked-dependency
    announcements, guid = vendor slug, pubDate = the catalog row's own
    created_at or none. Reads the discovery catalog (the sitemap's read,
    with the six-hour last-good fallback), never invents dates, never lists
    non-public vendors, quiet unless the catalog changes.
  - The global incidents feed was refactored onto the shared builder
    (identical output); feeds are not sitemap entries; llms.txt and
    llms-full.txt document all three.
  - Tests: 11 builder table tests (titles, exact measurement descriptions,
    escaping, valid empty documents) and 12 source-contract tests (shared
    builder as single composition point, degrade rules, 404 semantics,
    no-fabricated-dates, feeds absent from the sitemap).
- Phase 8 GitHub dataset publisher (outbox pattern). DONE.
  - `dataset_publications` table (migration 0042): an append-only ledger of
    what was committed, keyed by GitHub target + branch. No FKs by design
    (the ledger outlives incidents and evidence); unique on
    (target, branch, content_hash) and on (target, branch, commit_sha).
  - The dataset is derived, never accumulated: `build_dataset_tree` turns
    canonical rows (public incidents gated on vendor.is_public, the six
    vendor identity fields, frozen evidence bytes) into a complete file
    tree - README.md (provenance + methodology, no wall-clock values),
    catalog.json, incidents/index.jsonl (oldest first), one canonical JSON
    detail per incident, evidence files stored verbatim. Same canonical
    objects as the HTML pages and the RSS feeds; the dataset is a third
    renderer, not a second source of truth. DATASET_SCHEMA_VERSION "1.0".
  - Idempotency: dataset_content_hash is a SHA-256 Merkle-style digest over
    per-file hashes in path order. If it matches the newest publication row
    for the target, publish is a no-op ("current"): no commit, no row.
  - Delivery through the Git Data API (ref -> commit -> tree -> commit ->
    ref, force=false): one atomic sequence per dataset version; a raced ref
    fails the batch and the retry re-reads. Failures record nothing - the
    next attempt re-derives and re-decides.
  - Triggers, both idempotent into the same publish: the evidence freeze
    success path enqueues a `public_dataset_refresh_requested` outbox event
    (consumed by the processor like any other event, disabled publishers
    consume as "disabled" and the measurement is untouched), and a daily
    05:30 beat task is the guaranteed reconciliation path. Celery task
    retries with backoff + jitter (max 5); GitHub outages never touch
    probes.
  - Configuration: DATASET_GITHUB_TOKEN/REPO/BRANCH/API_URL. Unconfigured
    is a valid steady state: events are consumed as disabled, nothing
    fails.
  - Tests: 23 unit (builder determinism and hashing, config gating, publish
    outcomes incl. the IntegrityError race as "current", outbox disabled
    consumption) and 3 integration on real Postgres - the full pipeline
    interleaved record/detect -> drain (freeze + refresh in one queue) ->
    commit -> ledger row -> republish no-op; the scheduled path recovering
    a processor outage; the unconfigured publisher consuming events without
    publishing. Test teardown now truncates the public intelligence tables.
- Phase 9 newsletter/social draft generation. DONE.
  - `digest_drafts` table (migration 0043): an append-only ledger of
    generated DRAFT content. The pipeline ends at these rows: status is
    constrained to ``draft`` and only a human moves content onward (on the
    admin surface or outside it). No auto-posting exists anywhere in the
    pipeline, and the admin surface deliberately exposes no send endpoint.
  - One canonical source, a fourth renderer: the newsletter and the social
    post render the same canonical incident detail objects as the public
    API, the HTML pages, the RSS feeds, and the GitHub dataset. The
    measurement statement is word-for-word the feed's sentence - one claim
    phrasing everywhere. Deterministic: no wall-clock values in content
    (the window is an argument); an empty week produces an explicit "no
    confirmed incidents" issue, because absence in our records is a fact.
  - Idempotency and append-only versioning: content hash over the draft
    tuple, unique per (kind, period_key, content_hash). Unchanged content
    regenerates as a no-op; changed content (an incident resolved after
    its draft was reviewed) becomes a NEW row - reviewed drafts are never
    mutated behind the reviewer's back.
  - Triggers: the evidence freeze enqueues a
    `digest_social_draft_requested` outbox event (fast path, at-least-once,
    redelivery is a no-op); a Monday 06:00 beat task is the guaranteed
    weekly reconciliation, drafting the newsletter and any missing or stale
    social drafts for the previous ISO week; an admin POST /generate runs
    the beat's exact code path by hand. Failure retries with backoff; the
    probes are never involved.
  - Admin surface `/v1/admin/digest` (system-admin gated): list drafts,
    read one verbatim (the reviewer reads exactly what was generated), and
    the manual generate trigger. Mounted via the router registry.
  - Tests: builder table tests pinning every claim sentence, escaping, URL
    shapes, determinism, and the empty-window issue; service tests for
    idempotency, append-only versioning, window collection, and outbox
    handler redelivery; three integration tests on real Postgres covering
    the freeze-to-draft pipeline, resolution versioning, and the admin API
    (including that the surface has no send endpoint).
- Phase 10 ops views, data quality, scale proof. DONE.
  - `data_quality` module (no tables, by design): the report is DERIVED
    from current rows on every read, so a finding can never disagree with
    the data it describes. Three families, from the risk table's "targets
    that fail first-contact probing":
    - dead targets: active endpoints whose probe attempts in the window
      all failed (zero successes over at least N attempts, N configurable
      per request). Measuring a dead target silently poisons "no
      incidents" with "we never reached it", so it must be visible.
    - stale registry: active endpoints never checked past a 24h grace
      window, checkpoints overdue beyond 3x their own interval, and public
      vendors left with no active endpoints.
    - broken identity: malformed identity links (scheme/host), a
      plain-HTTP probe target, an empty display name, a category outside
      the canonical taxonomy. Deliberately conservative - no domain-suffix
      matching, which would flag legitimate dedicated status domains.
  - Report-only: the scan never mutates vendor or endpoint rows.
    Deactivating a dead target suppresses measurement, so that decision
    stays human, taken from the report.
  - Admin surface `/v1/admin/data-quality/report` (system-admin gated,
    read-only), mounted via the router registry; success predicate in SQL
    mirrors the detector's `_observation_is_up` and the scale suite
    exercises both on the same rows.
  - Scale proof (the modularity bar, at 5x): an integration suite writes a
    synthetic 260-vendor registry the way production writes it - probe
    observations on the vendor-probe stream, detection interleaved
    chronologically - then exercises the data-quality scan, public
    incident search, dataset tree derivation, and weekly digest generation
    against it, asserting exact findings (10 planted dead targets, stale
    rows, broken identity) under generous architectural time guards.

Each phase leaves the system deployable; no destructive changes in this set.

## 8. Rollout mechanics for this change set

```text
deploy
  -> entrypoint: alembic upgrade head (0039 -> 0040 applies additively)
  -> API boot: _sync_vendor_registry (guarded, idempotent; failure logs,
     boots anyway and the daily beat sync is the recovery path)
  -> beat tick: schedule_vendor_checks picks up every new endpoint with
     next_check_at IS NULL, probes go out, observations flow
  -> first consecutive-failure run on a public vendor opens the public
     incident and stamps run provenance; consecutive recovery resolves it
  -> public pages and sitemap start serving incidents within one cache
     window (60s incident reads, 300s taxonomy)
```

No manual seed invocation is required anymore. The daily 04:50 beat task
keeps the registry converged; the boot sync makes deploys self applying.

## 9. Testing doctrine for this change set

- The detector state machine is table-driven and deterministic; public
  incident state transitions are asserted per-sequence (open, no-reopen,
  recovery-run semantics, idempotency, failure-kind classification).
- The public API is exercised end-to-end against Postgres through the real
  app (search filters, cursor contract, detail 404s, no cross-vendor leak).
- Frontend indexability decisions are a test table on the resolver, not an
  opinion of the page; the contract tests pin five outcomes on the incident
  detail route (ok, observed, vendor-missing, incident-missing, unreadable).
- The RSS feed is asserted to degrade to a valid empty document when the
  public read is unavailable: a 5xx feed is how outage storms get amplified.
- The em-dash rule (no em dash in any authored artifact, ever) is enforced
  by scanning all touched files before commit.
