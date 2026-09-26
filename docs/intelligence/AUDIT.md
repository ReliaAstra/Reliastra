# RELIASTRA Public Intelligence Architecture - Audit, Target Design and Rollout Plan

Authored: 2026-09-24. Revised: 2026-09-26 (phases 0-6 landed; the RSS incidents feed
landed ahead of its phase 7 slot with phase 4). Baseline: commit 4055ba5.
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
- Phase 7 RSS/Atom feeds remaining (catalog feed, per-vendor feeds if the
  catalog size warrants it). PARTIALLY DONE via the incidents feed above.
- Phase 8 GitHub dataset publisher (outbox pattern). PLANNED.
- Phase 9 newsletter/social draft generation. PLANNED.
- Phase 10 ops views, data quality (dead target detection, broken identity
  links, stale registries), load tests at 250+ vendors. PLANNED.

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
