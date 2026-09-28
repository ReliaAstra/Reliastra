# Discoverability suites

This directory holds the repeatable external layer: search discovery,
LLM retrieval, and the live indexability manifest. CI covers the
source-side contract (`src/seo/__tests__/identity-contract.test.ts`);
these cover the world outside the repo.

## Files

- `queries.json` — brand + concept queries. For each, record one line in
  `search-log.jsonl`: query, engine, date, present, URL, title, snippet,
  position. Re-run after deployments and compare.
- `llm-questions.json` — the nine questions, each with the verifiable
  facts an answer must contain, retired claims it must NOT state as
  capability, and the source URLs. Ask models without handing them a URL;
  grade correct / stale / incorrect / unsupported / unable to retrieve.
- `search-log.jsonl` — append-only history. First entries: 2026-09-27
  baseline (mixed current+retired snippets on the brand query; stale
  founder bio on Hashnode/dev.to).
- `snapshots/manifest-*.json` — live manifest runs. Baseline:
  `manifest-baseline.json` (2026-09-27, pre-fix production: 4 og:url
  collapses, since fixed in code, pending deploy).

## Scripts (in `../scripts/`)

- `indexability-manifest.mjs` — crawls the live site, extracts identity
  fields per URL, fails on canonical/og mismatch, homepage collapse,
  sitemap gaps, or orphan indexables.
  `node scripts/indexability-manifest.mjs --full`
- `check-corpus.mjs` — asserts every LLM question is answerable from
  the served corpus and no retired claim stands as capability.
  `node scripts/check-corpus.mjs`
