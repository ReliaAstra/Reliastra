# UI / Typography / Accessibility Audit — reliastra.com

**Date:** 2026-09-21 · **Branch:** `arena/01a0c456-reliastra` · **Scope:** public site (`/`, marketing pages), mobile accessibility, authenticated developer console (`/dashboard` and siblings).

## Method & screenshot provenance (read this first)

The request was to take real screenshots of the live site. This sandbox has an
egress allowlist limited to the npm/PyPI/GitHub registries: `reliastra.com`,
the Playwright browser CDN and the Debian mirrors are all unreachable from the
shell, and no Chromium binary (or its 16 required system libraries) can be
installed. So **no live-browser screenshot could be captured from inside this
environment** — anything claiming otherwise would be fabricated.

What was used instead, all of it real:

1. **Live DOM of reliastra.com** fetched server-side (full rendered markup of
   `/`, 3 chunks). Every finding below about the shipped site is verified
   against the deployed DOM, not just the source tree.
2. **The QA screenshots committed in this repo** (`qa-home.png`,
   `qa-dashboard.png`, `qa-dashboard-overview.png`, …) — genuine rendered
   captures from the previous design iteration, reviewed visually.
3. **Computed analysis** of the design tokens (`globals.css`): effective
   `clamp()` type sizes at 360 / 768 / 1440 px, WCAG contrast ratios of every
   text token against every surface it sits on, and tap-target geometry from
   the component classes.
4. A **live preview of the fixed build** is served from this workspace so the
   changes can be checked on a real phone (see "Verification" at the bottom).

## Findings — confirmed, with numbers

### F1 · Display typography is oversized (public site)
| Token | Before (min → max) | After |
|---|---|---|
| `.ob-display` (hero H1) | 52 px → **110 px**, uppercase | 36 px → 56 px, sentence case |
| `.ob-scene-title` (band H2) | 38 px → **72 px**, uppercase | 28 px → 38 px, sentence case |
| `.ob-h1` | 34 px → 60 px | 28 px → 36 px |
| `.ob-h2` | 28 px → 46 px | 22 px → 28 px |
| `.ob-lede` | 17 px → 21 px | 16 px → 18 px |
| mobile menu rows | **28 px** uppercase | 17 px sentence case |

A 110 px all-caps headline on a 360 px phone wraps to 4–5 lines and reads as
brutalist poster art, not a B2B infrastructure product. Section bands also
reserve `min-h-[70vh]` + 172 px vertical padding, so one argument fills two
screens on a laptop.

### F2 · The landing page is structured like a document, not a product page
Live DOM shows numbered section spines: `01 — The problem`, `02 — Observe`,
`03 — Correlate`, `04 — Attribute`, `05 — Prove` (the `Eyebrow index=` prop
renders the number plus a hairline rule that reads exactly as an em-dash).
Copy is written in spec voice: "section 1 says…", "Printed with its weights",
"One dropped probe is recorded, not declared", "The fields are the real
schema." Combined with mono-uppercase labels for *everything* (nav, buttons,
field labels, eyebrows) the page reads as a technical manual.
**Fix:** numbering + dash removed, eyebrows become human sentence-case labels
with a status dot; band copy rewritten in benefit voice; mono restricted to
actual data.

### F3 · Mobile accessibility failures (WCAG 2.2)
| Issue | Evidence | Severity |
|---|---|---|
| Text contrast: `--ob-text-4` `#6B6B6B` on `#000` = **4.10:1**; `--obc-text-4` `#686D71` on `#0D0F10` = **3.67:1** — used for 10–12 px label text (needs 4.5:1) | computed | AA fail (1.4.3) |
| Critical-state red `#C8544C` on console base = **4.42:1** | computed | AA borderline fail |
| Inputs at 15 px (`.ob-input`) → iOS Safari zooms on focus | globals.css:1724 | AA (1.4.4) |
| Mobile menu toggle `p-2` + 11 px text ≈ **28 px** target; header sign-in link `px-4 py-2` 12 px ≈ 36 px (needs ≥44 px) | site-header.tsx:170,188 | AA (2.5.8) |
| `.ob-btn-sm` min-height **38 px** | globals.css:1699 | AA (2.5.8) |
| No visible `:focus-visible` ring on `.ob-btn`/`.obc-btn` (inputs only) | globals.css | AA (2.4.7) |
**Fix:** tokens raised to ≥4.6:1, inputs 16 px, all interactive elements ≥44 px,
global focus-visible ring, `text-size-adjust` guard.

### F4 · Spelling/locale inconsistency ("bad typo")
User-facing copy mixes en-GB and en-US: `behaviour` ×11, `colour` ×5,
`organisation` ×4, `centre` ×2 against `center` ×111, `organization` ×18.
**Fix:** marketing copy standardised on en-US.

### F5 · Developer console looks unfinished, not professional
- Flat single-plane surfaces (`#0D0F10` on `#08090A`, radius 2 px, no depth) —
  panels, tables and page background share one value, so nothing groups.
- Type is too small to scan: body 13 px, table cells 13 px, labels **10 px**
  (`.obc-label` 0.625rem), rows 40 px tall.
- No KPI layer: the overview header is three inline `label value` pairs, so
  the first screen has no visual anchor; sections are undifferentiated rule
  lines.
- Empty/error states are bare bordered boxes with a 10 px caps title.
**Fix:** elevated panel system (8 px radius, raised surface, hairline +
shadow), 14 px body / 13 px tables / 11 px labels, 44 px rows, a proper stat
card row with state colour and context line, richer section headers, designed
empty/error states, grouped nav with counts, 56 px topbar with breadcrumb.

## Verification
- `npm run typecheck`, `npm run lint`, `npm run test` (vitest) all green after
  the changes; landing/visuals tests updated where they asserted the old
  numbered-eyebrow markup.
- Dev server bound to `0.0.0.0` and exposed as a live preview: open it on a
  phone to confirm F1–F5 on real hardware (that is the mobile check this
  sandbox cannot perform itself).
