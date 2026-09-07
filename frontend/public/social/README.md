# Reliastra social artwork

- `/opengraph-image.png`: 1200×630 PNG, used for Open Graph and Twitter/X large-image link cards across the site. Source asset lives in `src/app/opengraph-image.png` (Next.js file-based metadata).
- `/social/reliastra-social-square.png`: 1080×1080 PNG for manual social posts.
- `reliastra-og.svg` and `reliastra-social-square.svg`: editable vector artwork.

The silver wordmark is a vector interpretation of the user-provided visual reference, not the original uploaded file (which was unavailable in the workspace). Replace the glyph paths with official source artwork when available. The favicon and other site branding are unchanged.

Regenerate from the frontend directory with `node scripts/generate-social-images.mjs`. Requires installed dependencies (`sharp`) and DejaVu Sans on the machine. PNGs are committed so production serves them without font downloads or runtime image rendering.

Existing `/opengraph-image` links redirect to the new PNG URL. Social services may retain a cached preview after deployment; use their re-scrape/inspection tools to refresh it.
