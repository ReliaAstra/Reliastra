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
e507e42f24b150b30ff404530744d7ed60e0c80334395488c9429d170f2b4b92  fig-1-evaluation-pipeline.svg
7262bfc25cccedf44e69da33e717942b385067a20f2d3e327deffcb9a581e39c  fig-2-policy-algebra.svg
e965c792d5df10d79c479ab121771a11d9519ea29c3994cff539a44cc9ffc0b0  fig-3-tightening-fallacy.svg
3c11581de38e1d90c23d7513bbf93a800c4c08e840d7eda8cffb51f6935f4428  fig-4-verification-gap.svg
aba424c1846949ae410b564b3f53fefd484c70e61ffeb5b267f36dca537e7a2a  fig-5-attribution-path.svg
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

`--png` writes syndication rasters to `figures/syndication/`, which is
git-ignored: a raster is a copy for a platform, not an artifact of record.
Rasterisers are tried in preference order - `resvg`, `rsvg-convert`,
ImageMagick `convert` - and when none is present the script falls back to the
repository's own `sharp` (librsvg compiled in), resolved from the frontend
workspace, so `--png` works on any checkout with its dependencies installed.
Text resolves through fontconfig: on a machine without the branded faces the
generic `monospace` at the end of each figure's font list is what renders, so a
syndication raster is faithful to the published figure's typography wherever it
is produced.

The SVG remains the artifact of record. Every figure carries its conclusion in
prose in the `<figcaption>`, which is what a platform that cannot host an SVG
should publish alongside it; the exporter prints those captions at the end of
its run for exactly that purpose.

## Accessibility

Each SVG carries `role="img"` and `aria-labelledby` pointing at its own
`<title>` and `<desc>` ids, both of which survive export. The `<desc>` is a full
prose description of the figure, not a restatement of the title, so a screen
reader and a text-only retrieval system both receive the finding. Nothing in
these figures is conveyed by colour alone: every cell in Figure 4 carries a
printed label, and every stage in Figure 1 carries a role tag.
