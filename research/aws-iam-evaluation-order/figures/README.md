# Figures

The five figures published in
[AWS IAM policy evaluation logic: identity vs resource](https://reliastra.com/research/cloud-security/aws-iam-policy-evaluation-order).

The source of truth is the React components in
`frontend/src/components/research/figures.tsx`, rendered to SVG on the server as
part of the page. The `.svg` files here are **exports**, not originals: they are
generated from the rendered page so they cannot drift from what the paper
actually shows.

| # | Component | Export | Size | What it establishes |
|---|---|---|---|---|
| 1 | `IamEvaluationPipelineFigure` | [`fig-1-evaluation-pipeline.svg`](./fig-1-evaluation-pipeline.svg) | 960×470 | The seven stages in documented order, each labelled with its algebraic role — one short-circuit, four ceilings, two grants — plus the root-user bypass and both terminals |
| 2 | `IamPolicyAlgebraFigure` | [`fig-2-policy-algebra.svg`](./fig-2-policy-algebra.svg) | 960×340 | Three relations: same-account union of the granting classes, the ceilings as nested rings, and the cross-account conjunction of two independent verdicts |
| 3 | `IamTighteningFallacyFigure` | [`fig-3-tightening-fallacy.svg`](./fig-3-tightening-fallacy.svg) | 960×300 | The designer model against the documented outcome, and the four mechanisms that do reduce effective permissions inside one account |
| 4 | `IamVerificationGapFigure` | [`fig-4-verification-gap.svg`](./fig-4-verification-gap.svg) | 960×380 | Seven policy classes against four verification routes, each cell evaluated / conditional / unsupported |
| 5 | `IamAttributionPathFigure` | [`fig-5-attribution-path.svg`](./fig-5-attribution-path.svg) | 960×250 | From an observed `AccessDenied` to the deciding policy class, and which evidence source discriminates at each step |

Checksums at publication, recorded on the corpus record so a reader can tell
whether an export has been regenerated since:

```
405a08ce08cafb6b6257f57671ee74fd6241b8fe71df7a2b8f9592bb4a548b34  fig-1-evaluation-pipeline.svg
8caf4b29d671b9ef8c749e645e63663a7cac5de9f1bbc4bda3e831faff574e4b  fig-2-policy-algebra.svg
576c8166612be83a5fe65c734e851e5d1f03dd1bbcacb677593c9c332dd37892  fig-3-tightening-fallacy.svg
b1239f8b51ebda40c9dde0378f3a729af158a588ecc4a778bb518df243287457  fig-4-verification-gap.svg
c2a746ac57f8d0b14573ffc135936848ccddaa732ecb17594b1c5f0963a2a772  fig-5-attribution-path.svg
```

## Regenerating

```bash
cd frontend
npm ci
npm run dev                                  # or a production build

node ../research/aws-iam-evaluation-order/figures/export-figures.mjs
node ../research/aws-iam-evaluation-order/figures/export-figures.mjs --png
```

The exporter reads the rendered page, lifts each figure's `<svg>` out of the
HTML, and rewrites the closed set of Tailwind class tokens the research
components use into presentation attributes with literal colour values taken
from `frontend/src/app/globals.css`. Three properties are deliberate:

- **An unrecognised class token is a hard failure.** A new component style has
  to be added to the token map on purpose, after checking what it renders to.
  The alternative is an export that silently looks different from the paper.
- **The expected figure count is asserted.** A figure added to or removed from
  the page without updating `FIGURES` in the script fails the export.
- **A figure with no `<title>` is refused.** Every research figure carries a
  `<title>` and a `<desc>` and is labelled `role="img"`; an export that lost
  them would be an inaccessible copy of an accessible original.

## Rasterisation

`--png` produces a raster only when a real SVG rasteriser is present, in
preference order `resvg`, `rsvg-convert`, then ImageMagick `convert`. On a host
where ImageMagick is installed but its SVG delegate is not, `convert` fails with
a delegate error; the script reports that as a missing delegate rather than as a
conversion failure, and skips the PNG.

**No PNG is committed here.** The SVG is the artifact of record. A raster
rendered with a fallback font instead of JetBrains Mono is a worse image than no
image, and the paper does not need one: every figure carries its conclusion in
prose in the `<figcaption>`, which is what a platform that cannot host an SVG
should publish alongside it.

Install `librsvg2-bin` (Debian/Ubuntu) or `resvg` and re-run with `--png` when a
raster is needed for syndication. The captions the exporter prints at the end of
its run are the sentences that must accompany each image on the syndicating
platform.

## Accessibility

Each SVG carries `role="img"` and `aria-labelledby` pointing at its own
`<title>` and `<desc>` ids, both of which survive export. The `<desc>` is a full
prose description of the figure, not a restatement of the title, so a screen
reader and a text-only retrieval system both receive the finding. Nothing in
these figures is conveyed by colour alone: every cell in Figure 4 carries a
printed label, and every stage in Figure 1 carries a role tag.
