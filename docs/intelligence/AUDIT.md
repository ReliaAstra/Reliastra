# Intelligence platform audit (Phase 0)

Date: 2026-09-25
Scope: audit of the existing RELIASTRA codebase before evolving it into a
public infrastructure intelligence property. Follows the directive to reuse
existing primitives and to keep exactly one canonical source of truth per
domain object.

## 1. Current architecture, measured not guessed

```text
Next.js frontend (frontend/)  -- server rendered, Data Cache + typed readers
        |  /api/v1/* proxy routes (server side) and direct server reads
FastAPI backend (backend/)    -- app/modules/* domain modules, /v1/* API
        |
Supabase Postgres   -- canonical relational state, partitioned time series
Redis               -- public-cache, rate limits, Celery broker
Celery worker/beat  -- probes, outbox drain, evidence, retention
Supabase Storage    -- immutable evidence artifacts
```

Runtime contract (docs/checks-operating-model.md): checks never run inside
the API process; Celery beat schedules, workers execute, results persist to
Postgres. Entrypoint runs `alembic upgrade head`, then supervisord starts
api, worker, beat.

## 2. Existing reusable systems inventory

| Target capability | Exists today | Where | Reuse verdict |
| --- | --- | --- | --- |
| Vendor records | yes, flat | modules/vendors (VendorTracking) | extend, do not fork |
| Observation targets per vendor | yes | modules/vendors (VendorEndpoint) | extend with identity metadata |
| Observation engine | yes, SSRF hardened | modules/checks/http_probe.pyobserve_http | keep as the single probe path |
| Observation storage | yes, partitioned + outbox | modules/observations | keep; public probes org_id=None |
| Scheduled public probes | yes | vendors/tasks.py schedule+execute | keep; add registry sync |
| Incident model | yes, org scoped | modules/incidents | keep for customers; public counterparts planned |
| Public vendor API | yes | /v1/vendors + /metrics/timeline/history/developer | extend additively |
| Evidence | yes, immutable, signed, methodologied | modules/evidence | keep untouched |
| Attribution | yes, methodology versioned | modules/attribution | keep untouched |
| Detection | yes | modules/checks/detection.py | keep for customer deps |
| Public catalog pages | yes | frontend /observatory, /observatory/[vendor] | extend with categories |
| Public incident pages | route exists, data empty by design | /observatory/[vendor]/incidents/[id] | now feeds real data in later phase |
| Sitemap/robots | yes, disciplined | app/sitemap.ts, robots.ts, lib/indexability.ts | extend, same rules |
| Structured data | yes | lib/seo, JsonLd | extend for new page types |
| llms.txt discovery | yes | app/llms.txt, llms-full.txt | update as content grows |
| Research system | yes, static | /research, content/research | integrate sources later |
| CLI, auth, billing, admin | yes | cli/, modules/auth,billing,admin | untouched |
| Queues/outbox/idempotent jobs | yes | platform/messaging, observations outbox | the pattern for all publishing jobs |

## 3. Gaps against the brief

1. Vendor model is flat: no first class categories, no products or
   dependencies, no identity metadata (website, docs, status page, logo,
   tags). `category` is an unindexed free string.
2. Only 5 seeded vendors, hard coded in vendors/constants.py. No deterministic
   registry, no automated re-seeding (the seed task is invoked manually).
3. Public vendor observations exist but there is no public incident graph:
   get_vendor_incidents returns an empty list by design.
4. No category pages, no public incident search, no feeds, no datasets, no
   GitHub export pipeline, no question pages, no newsletter engine.
5. No machine readable JSON exports next to HTML pages.

## 4. Target architecture (this phase and beyond)

Reuse the existing convention: app/modules/<domain>/{models, repository,
service, schemas, router, tasks}.py. New intelligence capabilities land as:

```text
vendors          canonical vendor + category + target registry (this phase)
observations     unchanged measurement plane
incidents        unchanged customer plane; public incident intelligence later
publishing/  *   read models, public JSON, feeds, sitemaps (phases 5, 7, 9)
distribution/*   GitHub export, newsletter, social drafts (phases 8, 9)
search/*         internal + incident search (phase 4)
```

`*` indicates modules planned, not yet built. Nothing in this phase creates
a parallel copy of vendors, observations, or incidents.

Pipeline shape that already exists and is preserved:

```text
beat -> schedule_vendor_checks -> execute_vendor_check -> observe_http
  -> observations (partitioned) -> public API -> frontend readers
```

New in this phase:

```text
registry.py (typed, validated, version controlled)
  -> seed_vendors (idempotent upsert of categories, vendors, endpoints)
  -> scheduled daily via beat (registry sync), still callable manually
```

## 5. Guardrails carried forward (must not regress)

- Public pages state what was measured, from where, with what limitations.
- A region label names a real worker deployment; one deployed observation
  point only ever advertises one label.
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

## 7. Phased implementation map (status)

- Phase 0 audit: this document. DONE.
- Phase 1 canonical taxonomy + vendor entity: vendor_categories table,
  additive vendor/endpoint identity columns, typed registry. DONE.
- Phase 2 registry of 50 vendors (10 categories), idempotent registry sync,
  daily beat reconciliation plus boot time sync. DONE.
- Phase 3 category pages via single-segment resolution, category directory
  on the observatory index, category entries in sitemap.xml, public
  category API, collection structured data. DONE.
- Phase 4 public incident intelligence and /incidents search. PLANNED.
- Phase 5 public evidence + JSON sidecars. PLANNED.
- Phase 6 question engine. PLANNED.
- Phase 7 RSS/Atom feeds from canonical publication records. PLANNED
  (structured data partly exists already: Dataset, CollectionPage, Breadcrumb).
- Phase 8 GitHub dataset publisher (outbox pattern). PLANNED.
- Phase 9 newsletter/social draft generation. PLANNED.
- Phase 10 ops views, data quality (dead target detection, broken identity
  links, stale registries), load tests at 250+ vendors. PLANNED.

Each phase leaves the system deployable; no destructive changes in this set.

## 8. Rollout mechanics for this change set

```text
deploy
  -> entrypoint: alembic upgrade head (0039 applies additively)
  -> API boot: _sync_vendor_registry (guarded, idempotent; failure logs,
     boots anyway and the daily beat sync is the recovery path)
  -> beat tick: schedule_vendor_checks picks up every new endpoint with
     next_check_at IS NULL, probes go out, observations flow
  -> public pages and sitemap start serving the enlarged catalog within
     one cache window (60s catalog, 300s taxonomy)
```

No manual seed invocation is required anymore. The daily 04:50 beat task
keeps the registry converged; the boot sync makes deploys self applying.
