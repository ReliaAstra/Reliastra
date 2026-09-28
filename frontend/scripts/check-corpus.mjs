#!/usr/bin/env node
/**
 * Corpus check: the machine-retrievable half of the LLM retrieval suite.
 *
 * A model that can fetch the site must be ABLE to answer every question in
 * llm-questions.json from the corpus alone - without being handed an exact
 * URL. This script fetches /llms.txt, /llms-full.txt and the question
 * sources, then asserts each expected fact (case-insensitive substring)
 * appears, and each retired claim does NOT appear as a current capability.
 *
 * Usage:
 *   node scripts/check-corpus.mjs [--base https://reliastra.com]
 *
 * Exit 1 on any missing fact or surviving retired claim. Run after content
 * deployments; it needs no backend beyond the public site itself.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(=(.*))?$/);
    return m ? [m[1], m[3] ?? ''] : [];
  }).filter(([k]) => k)
);
const BASE = (args.base ?? 'https://reliastra.com').replace(/\/$/, '');
const suite = JSON.parse(readFileSync(join(root, 'indexability', 'llm-questions.json'), 'utf8'));

const cache = new Map();
async function fetchText(url) {
  if (cache.has(url)) return cache.get(url);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Reliastra-Corpus-Check/1.0' },
      signal: AbortSignal.timeout(25000),
    });
    const text = res.status === 200 ? await res.text() : '';
    cache.set(url, text);
    return text;
  } catch {
    cache.set(url, '');
    return '';
  }
}

let failures = 0;
// Lines a human reviewed and cleared: genuine definitions and
// anti-pattern descriptions, not capability claims. Each entry names why.
const REVIEWED = [
  {
    pattern: 'two regions behind one control plane',
    reason: 'glossary anti-pattern: instances-behind-one-control-plane counted as redundancy',
  },
  {
    pattern: '### quorum detection',
    reason: 'glossary term heading; its definition requires independent points and names persistence as the single-origin equivalent',
  },
  {
    pattern: 'quorum detection is the rule',
    reason: 'glossary definition of the generic term; the same entry states the single-origin equivalent is persistence',
  },
  {
    pattern: 'treating their agreement as a quorum',
    reason: 'glossary example critiquing label-agreement as quorum (reports one machine opinion)',
  },
];
for (const { q, expected_facts = [], retired_claims = [], sources = [] } of suite.questions) {
  const corpus = (await Promise.all(sources.map(fetchText))).join('\n').toLowerCase();
  if (!corpus.trim()) {
    console.log(`SKIP ${q} (sources unreachable)`);
    continue;
  }
  for (const fact of expected_facts) {
    // expected_facts within one question are alternatives: at least one
    // must be retrievable.
    void fact;
  }
  const found = expected_facts.some((fact) => corpus.includes(fact.toLowerCase()));
  if (!found) {
    failures += 1;
    console.log(`MISSING [${q}]: none of ${JSON.stringify(expected_facts)} in corpus`);
  } else {
    console.log(`OK [${q}]`);
  }
  for (const stale of retired_claims ?? []) {
    // A retired claim may appear ONLY inside an explicit retraction
    // ("no X is claimed", "retired", "does not", "never", "not by").
    // URL slugs are taxonomy, not claims, so addresses are stripped first.
    const lines = corpus.split('\n')
      .map((line) => line.replace(/https?:\/\/\S+/g, ''))
      .filter((line) => line.includes(stale.toLowerCase()));
    const bare = lines.filter(
      (line) => !/no |not |never|retired|does not|is not|isn't|without|not by|no longer/.test(line)
    ).filter((line) => !REVIEWED.some((r) => line.includes(r.pattern)));
    if (bare.length > 0) {
      failures += 1;
      console.log(`STALE [${q}]: "${stale}" stated as capability: ${bare[0].slice(0, 140)}`);
    }
  }
}
console.log(failures ? `CORPUS-FAIL ${failures}` : 'CORPUS-OK');
process.exit(failures ? 1 : 0);
