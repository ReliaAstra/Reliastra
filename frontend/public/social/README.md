# Reliastra social artwork

- `/opengraph-image.png`: 1200×630 PNG, used for Open Graph and Twitter/X large-image link cards across the site. Source asset lives in `src/app/opengraph-image.png` (Next.js file-based metadata).
- `/social/reliastra-social-square.png`: 1080×1080 PNG for manual social posts.
- `/social/reliastra-email-avatar.png`: 512×512 PNG account profile image (email avatar) for the reliastra.com mail accounts (Gmail/Workspace, Outlook, Zoho). Solid RELIASTRA brand blue `#2563EB` (`--rs-brand`), silver wordmark centered at the largest uniform scale whose corners stay inside the circular-crop safe zone (radius 224, i.e. 32px padding inside the crop). No text, effects, or decorations - wordmark paths are identical to the social artwork.
- `reliastra-og.svg` and `reliastra-social-square.svg`: editable vector artwork.
- `reliastra-email-avatar.svg`: editable vector source of the email avatar.

The social cards use the public site's obsidian infrastructure language: an asymmetric typographic lockup, instrument-panel geometry, hairline grid, and a single amber observation signal. They are intentionally not a logo poster; the message and the dependency surface should still read at thumbnail size. The silver wordmark is retained only for the email avatar and is a vector interpretation of the user-provided visual reference, not the original uploaded file (which was unavailable in the workspace). Replace the glyph paths with official source artwork when available. The favicon and other site branding are unchanged.

## Research paper cards

`public/social/research/<slug>-og.png`: 1200×630 Open Graph card per paper, used
by `openGraph.images` and `twitter.images` on that paper's route only. Every
other page keeps the site-wide card above.

A card is generated, not hand-lettered: `node scripts/generate-paper-og-image.mjs`
(with the site running) resolves the slug against the live sitemap and reads the
title, category, reading time and byline from the page's own `TechArticle`
JSON-LD, so a card cannot disagree with the record it illustrates. What is
authored in the script is the card's design content - the thesis line and the
stage band, which mirrors Table 1 of the paper - and the script refuses to run
for a slug with no card content, rather than emitting a generic image.

The registry of which paper has a card lives in
`src/lib/research/social.ts`; a test fails the build if a registered card is not
a committed 1200×630 PNG, or is registered against a slug that is not a
published paper.

Regenerate the site-wide assets from the frontend directory with `node scripts/generate-social-images.mjs` (optionally pass an asset name, e.g. `reliastra-email-avatar`, to regenerate only that one). Requires installed dependencies (`sharp`) and DejaVu Sans on the machine. PNGs are committed so production serves them without font downloads or runtime image rendering.

Existing `/opengraph-image` links redirect to the new PNG URL. Social services may retain a cached preview after deployment; use their re-scrape/inspection tools to refresh it.
