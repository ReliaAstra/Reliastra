# Change set · AWS IAM policy evaluation order paper

**Scope of this change set.** One research paper added to the corpus, with its
artifact directory, its figures, its author record, and the machine-readable
surfaces that follow from them. It extends the public research surface built in
`docs/redesign/seo-pillar-ai-infrastructure.md`; nothing here replaces that
architecture, and no published URL moves.

Published 13 September 2026 at
`/research/cloud-security/aws-iam-policy-evaluation-order`.

---

## 1 · What was added

| Route | Rendering | Source of truth | Indexability |
| --- | --- | --- | --- |
| `/research/cloud-security/aws-iam-policy-evaluation-order` | SSG via the existing category article route | `content/research/aws-iam-policy-evaluation-order.tsx` + the corpus record | index, canonical, in sitemap |

No new route file was needed. `frontend/src/app/research/cloud-security/[slug]/page.tsx`
derives `generateStaticParams` from `RESEARCH_ARTICLES`, so declaring the record
in `lib/routes.ts` is what makes the URL exist — the same mechanism that keeps
the sitemap, the research index and the category page from diverging.

The `cloud-security` category goes from one paper to two. `PUBLIC_PAGES` in
`lib/seo.ts` is unchanged: the category route was already declared, and the
corpus test that requires every category to have at least one paper still passes
with a wider margin.

## 2 · Files touched

| File | Change |
| --- | --- |
| `frontend/src/lib/routes.ts` | One record in `RESEARCH_ARTICLES`, `section: 'cloud-security'` |
| `frontend/src/content/research/aws-iam-policy-evaluation-order.tsx` | New body module: 16 sections, 4 tables, 5 figures, 3 pseudocode blocks, 8 claims |
| `frontend/src/content/research-articles.tsx` | Keyed-module registration (`awsIamModule`), preserving the guarantee that a body cannot attach to the wrong slug |
| `frontend/src/components/research/figures.tsx` | Five figure components + one `MatrixCell` helper, appended |
| `frontend/src/lib/research/corpus.ts` | `ResearchPaper` record in the existing Cloud security section |
| `frontend/src/lib/research/authors.ts` | First declared author (see §4) |
| `frontend/src/app/llms.txt/route.ts` | One line under "Important public pages" |
| `frontend/src/lib/seo.ts` | Six glossary terms (`explicit-deny`, `implicit-deny`, `identity-based-policy`, `resource-based-policy`, `permissions-boundary`, `non-human-identity`) and their six `PUBLIC_PAGES` entries |
| `frontend/src/lib/research/social.ts` | New: the per-paper social-card registry and its fallback |
| `frontend/scripts/generate-paper-og-image.mjs` | New: generates a paper's 1200×630 card from the page's own `TechArticle` JSON-LD |
| `frontend/public/social/research/` | New: committed card SVG source and PNG for this paper |
| `frontend/src/app/research/*/[slug]/page.tsx` (4) | Metadata now takes its social image from `researchSocialImage()` |
| `frontend/src/seo/__tests__/seo.test.ts` | Gate: a declared card must belong to a published paper and be a committed 1200×630 PNG |
| `research/aws-iam-evaluation-order/` | New artifact directory: `README.md`, `sources.md`, `LICENSE`, `figures/` |

`/llms-full.txt` and `/sitemap.xml` needed no edit: both derive from the
registries, and the paper appears in each automatically.

## 3 · Editorial decisions

**Evidence basis is `sourced`, and nothing in the paper is labelled
`measured`.** No AWS account was used, no request was issued, no simulator
response was captured. Every finding is either cited to an AWS primary source or
argued from one; the corpus record carries no `observation` and no `dataset`,
because inventing either to earn a stronger label is precisely what the
publication gate exists to prevent. Six limitations are declared, above the
three the gate requires.

**Two documented ambiguities are reported rather than resolved.** AWS publishes
the algorithm as a specification and does not publish the enforcement code, so
(a) the ceiling behaviour of two principal forms and (b) the third bullet of the
session-policy stage cannot be settled from documentation. Both are named in the
paper and in the limitations. A paper that silently picked a side would be
asserting an observation it did not make.

**Third-party reports are labelled as reports.** Two claims rest on sources
outside AWS documentation: the May 2026 aws-cli issue reporting that the
simulator discards a trust policy for `sts:Assume*` actions, and the August 2026
write-up of the simulator's July 2026 migration into the IAM console. The paper
says so at the point of use, and `research/aws-iam-evaluation-order/sources.md`
records how every source was reached — fetched, link-verified, search-resolved
or reported — because a bibliography that hides its own provenance is not a
bibliography. The AWS announcement URL behind the migration claim was not
reached directly and is marked as such.

**Figures are evidence, not decoration.** All five are server-rendered inline
SVG using only the existing `--ob-*` tokens, each with a `<title>`, a full prose
`<desc>` and `role="img"`, and each wrapped in a `PaperFigure` whose caption
states the finding in words. Nothing in Figure 4 is conveyed by colour alone:
every cell carries a printed label.

**Limitations and recommendations are not restated in the body.** The template
renders both from the corpus record, as "Limitations" and as "Practical
architecture implications", immediately after the body. An earlier draft of the
body carried its own versions of both, which printed the same six items twice on
one page; they were removed and the conclusion now points at the rendered
sections instead. The body covers what those two sections cannot: the scope
boundary, and the reasoning that makes the recommendations follow.

**Table 3 rows carry stable identifiers** (`M-01` … `M-26`) so a later revision
can add cases without renumbering rows that may already be cited elsewhere.

## 4 · Authorship

`RESEARCH_AUTHORS` was deliberately empty; this change set adds the first
declared author, **Adeshina Emmanuel** (`adeshina-emmanuel`), and sets `author`
on this paper only. The byline, the `Person` JSON-LD node, the author block and
the citation string all follow from that one record.

The other nine papers keep the `RELIASTRA Research` imprint. A declared author
does not retro-byline work already published under the imprint, which is a true
statement about how it was published.

The `sameAs` list carries two URLs. Both were confirmed by the author; the
LinkedIn URL had come back malformed when scraped from a public profile and was
verified by hand before it was allowed into `Person` structured data, which
propagates.

## 5 · SEO / AI-search surface

1. **Query-matched title.** `AWS IAM policy evaluation logic: identity vs
   resource` — 53 characters, so the templated `<title>` still fits a SERP.
   The H1 and the metadata title are the same string, which is how the rest of
   the corpus behaves.
2. **Answer-first sections.** Four `<h2>`s are phrased as the questions a reader
   or an answer engine actually asks, each followed by a direct answer before
   any elaboration, so the extractable unit is complete out of context.
3. **Comparative content is in tables, not lists.** Four `DataTable`s with real
   `<caption>`s, inside `DataPanel`s that carry a `source` line. Tables are what
   a retrieval system lifts.
4. **`TechArticle` JSON-LD is materially richer** than the corpus average: 15
   named entities feed `about`, 25 references feed `citation`, and the six
   exported artifacts carry `path`, `format` and `sha256`. No forbidden property
   is emitted — the corpus test asserts the absence of `award`,
   `aggregateRating`, `isPeerReviewed`, `citationCount`, `review`,
   `reviewCount` and `ratingValue`.
5. **`/llms.txt`** gains one line. **`/llms-full.txt`** prints the paper's
   research question, abstract, scope, methodology, every finding with its
   basis, the entity list and the artifact paths, with no edit to the route.
6. **Each shared link carries its own card.** `scripts/generate-paper-og-image.mjs`
   resolves the slug against the live sitemap, fetches the rendered paper and
   reads the title, category, reading time and byline out of the page's own
   `TechArticle` node, then draws a 1200×630 card in the observatory vocabulary
   - graph-paper ground, mono labels, one accent, the seven-stage band with each
   stage's algebraic role printed in its cell. The PNG and its SVG source are
   committed, because production serves them without runtime rendering, and a
   test fails the build if a declared card is missing, wrongly sized, or
   registered against a slug that is not a published paper.
7. **`FAQPage` JSON-LD was deliberately not added.** Google restricted FAQ rich
   results to well-known authoritative government and health sites in 2023, so
   the markup earns no SERP feature and adds an embellishment risk. The Q&A
   headings and answer-first paragraphs stay; the schema does not.

### Deliberately NOT done

- **No `Dataset` node.** The paper ships no dataset, and a `dataset` field with
  no file on disk fails the build. `datasetJsonLd` returns null, correctly, and
  the emitted `TechArticle` carries no `mentions` property.
- **No separate SEO title.** The `<title>` tag is the templated
  `{title} - RELIASTRA Research` over the same string as the H1, which is how
  every other paper in the corpus behaves. A longer, keyword-stuffed variant
  would push the brand suffix past the truncation point without adding a
  ranking signal the H1, the slug, the description and the six glossary pages do
  not already carry. The query-matched phrasing lives in the title itself:
  "AWS IAM policy evaluation logic: identity vs resource", 53 characters.
- **Six glossary pages, added with care rather than speed.** Each term page is
  its own indexable URL, so each carries its own claim to keep true. The
  `howReliastra` field on an IAM term cannot honestly describe an IAM feature
  RELIASTRA does not sell; each one therefore states the discipline the corpus
  already applies - recording a refusal as distinct from an absence, starting
  attribution at the CloudTrail principal type, treating its own probes as
  non-human callers of other companies' control planes - or it would be
  fabrication in a field named after the company.
- **No measurement.** A tier of this work that captures simulator responses
  verbatim for the rows of Table 3 would add a `data/` directory, promote the
  evidence basis to `measured`, and require an `observation` window. That is a
  revision, not this paper, and it would set `updatedAt` and a plain-language
  `revisionNote`.
- **No syndication in this change set.** The Hashnode derivative and its
  canonical direction are handled separately; the exporter that produces the
  images it needs is already committed here.

## 6 · Verification

```bash
cd frontend
npm run lint
npm run typecheck
npx vitest run
npm run build
```

All green at the time of writing: the corpus gate (25 tests) and the SEO gate
(14 tests) pass, and the whole suite passes. The page was rendered locally and
the five figures were exported from the rendered HTML by
`research/aws-iam-evaluation-order/figures/export-figures.mjs`, which asserts
the expected figure count, refuses a figure with no `<title>`, and fails on any
Tailwind class token it does not recognise.
