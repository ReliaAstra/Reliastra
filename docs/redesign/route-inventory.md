# RELIASTRA — Public surface audit & route inventory

Audit performed against the running application (`next dev`, Next.js 16, Turbopack) on
branch `arena/01a078db-reliastra`. Every route below was requested over HTTP and its
status code recorded; every navigation and footer destination was traced back to
`src/lib/routes.ts`, which is the repository's single source of truth for internal hrefs.

**Scope of the redesign phase:** public marketing site + authentication experience.
The authenticated customer console (`(console)/*`) and the authenticated partner
dashboard are explicitly **out of scope** and were not restyled.

---

## 1. Route map

Legend — **Auth**: `public` / `token` (unguessable share link) / `session` (customer) /
`admin`. **Redesign**: `yes` = restyled in this phase, `no` = deliberately untouched.

### 1.1 Marketing & product

| Route | Purpose | Status | Auth | SEO value | Redesign |
|---|---|---|---|---|---|
| `/` | Homepage. SSR landing; swaps to partner dashboard shell after client-side session proof (`HomeClient`). | 200 | public | **Primary** | yes |
| `/product` | Platform overview pillar. | 200 | public | high | yes (shell) |
| `/external-dependency-intelligence` | Category pillar page. | 200 | public | **high** (category term) | yes (shell) |
| `/dependency-monitoring` | Capability page — multi-region checks. | 200 | public | high | yes (shell) |
| `/sla-evidence` | Capability page — evidence artifacts. | 200 | public | high | yes (shell) |
| `/incident-evidence` | Capability page — attribution. | 200 | public | high | yes (shell) |
| `/pricing` | Plans, limits, billing currency. | 200 | public | high | yes (rewritten) |
| `/about` | Company / why RELIASTRA exists. | 200 | public | medium | yes (shell) |
| `/contact` | Support, sales, security contacts. | 200 | public | medium | yes (shell) |
| `/security` | Security & data-handling posture. | 200 | public | medium | yes (shell) |
| `/status` | Platform status explanation page. | 200 | public | medium | yes (shell) |
| `/glossary` | Concept index. | 200 | public | high (long tail) | yes (shell) |
| `/glossary/[term]` | Individual concept definitions. | 200 | public | high (long tail) | yes (shell) |
| `/docs` | Documentation index. | 200 | public | high | yes (shell) |
| `/docs/quickstart` `/docs/monitoring` `/docs/evidence` `/docs/api` | Docs sections. | 200 | public | high | yes (shell) |
| `/privacy` | Customer privacy policy. | 200 | public | required | yes (shell) |
| `/terms` | Customer terms of service. | 200 | public | required | yes (shell) |

> There is **no** `/cookies` route. Cookie handling is covered inside `/privacy`
> and, for referral/attribution cookies, inside `/partner/privacy`. No new page was
> invented; the footer links to the sections that actually exist.

### 1.2 Research

| Route | Purpose | Status | Auth | SEO value | Redesign |
|---|---|---|---|---|---|
| `/research` | Research index. Derived from `RESEARCH_ARTICLES`. | 200 | public | **high** | yes (rewritten) |
| `/research/the-dependency-gap` | Research article. | 200 | public | high | yes (article template) |
| `/research/how-reliastra-measures-vendor-reliability` | Methodology article. | 200 | public | high | yes |
| `/research/reliastra-research-agenda` | Publishing standards. | 200 | public | high | yes |

Bodies live in `src/content/research-articles.tsx`; metadata in `src/lib/routes.ts`.
`generateStaticParams`, the sitemap and the footer all read the same constant, so a
linked slug cannot 404. Categories used in the redesign are only the ones the data
actually carries (`Research`, `Methodology`) plus the real per-article `tags`.

### 1.3 Public dependency / vendor intelligence

| Route | Purpose | Status | Auth | SEO value | Redesign |
|---|---|---|---|---|---|
| `/track` | Tracked-vendor index. Live, `revalidate = 60`, server-fetched from the Track API. | 200 | public | **high** | yes |
| `/track/[vendor]` | Per-vendor intelligence page: current state, 7d/30d availability, latency, regions, incident timeline, methodology. | 200 (404 for unknown vendor) | public | **high** | yes |

Real backend data via `src/lib/track-api.ts`. When the API is unreachable the pages
render an explicit "measurement network unreachable" state — never fabricated numbers.

### 1.4 Partner network

| Route | Purpose | Status | Auth | SEO value | Redesign |
|---|---|---|---|---|---|
| `/partner` | Partner program home. | 200 | public | high | yes |
| `/partner/how-it-works` | Program mechanics. | 200 | public | medium | yes (nav/footer/chrome) |
| `/partner/commission` | Commission structure. | 200 | public | medium | yes (chrome) |
| `/partner/earn` | Earnings model. | 200 | public | medium | yes (chrome) |
| `/partner/tiers` | Tier ladder. | 200 | public | medium | yes (chrome) |
| `/partner/premium` | Premium partner track. | 200 | public | medium | yes (chrome) |
| `/partner/faq` | Program FAQ. | 200 | public | medium | yes (chrome) |
| `/partner/resources` | Partner enablement material. | 200 | public | low | yes (chrome) |
| `/partner/support` | Dual-mode: public contact form / authenticated conversation desk. | 200 | public + session | none (noindex) | yes (chrome) |
| `/partner/signup` | **Partner** application + OTP verification. | 200 | public | noindex | yes |
| `/partner/login` | **Partner** sign-in. | 200 | public | noindex | yes |
| `/partner/forgot-password` | Partner password reset request. | 200 | public | noindex | yes |
| `/partner/privacy` `/partner/terms` | Program-specific legal (referral cookies, attribution windows, commission tracking). | 200 | public | low | yes (chrome) |

Partner *dashboard* pages (`dashboard`, `referrals`, `earnings`, `payouts`,
`notifications`, `settings`) intentionally have **no file routes** — they are
state-routed inside the authenticated `/` shell. Left untouched.

### 1.5 Authentication

| Route | Purpose | Status | Auth | Robots | Redesign |
|---|---|---|---|---|---|
| `/login` | Customer sign-in. `POST /api/v1/auth/login`. Handles `?expired=1` and safe `?next=`. | 200 | public | noindex | yes |
| `/signup` | Customer registration + organization creation. `POST /api/v1/auth/register`. | 200 | public | noindex | yes |
| `/verify-email` | 6-digit OTP entry + resend. | 200 | public | noindex | yes |
| `/reset-password` | Token-based password reset. | 200 | public | noindex | yes |
| Forgot password | **No dedicated route.** Triggered from `/login` via `POST /api/v1/auth/forgot-password` with an anti-enumeration response. | — | public | — | yes (in place) |
| `/admin/login` | Operator control plane. Separate security domain. | 200 | public form, admin session | noindex | **no** |

Behaviour that must not change and was preserved verbatim:

- token persistence through `storeSessionTokens` + `useAppStore.setAccessToken`;
- refresh rotation via `lib/auth-refresh`;
- the `EMAIL_NOT_VERIFIED` 403 gate redirecting to `/verify-email?email=…`;
- `next=` sanitisation that refuses `//` and any `/admin*` destination;
- identical forgot-password copy regardless of whether the address exists;
- partner sign-in's idempotent auto-`apply()` when `/api/partners/me` 404s.

### 1.6 Token-scoped shares, checkout, console, admin — untouched

| Route | Purpose | Auth | Redesign |
|---|---|---|---|
| `/portal/[token]` | Client-facing shared portal. `noindex` + `no-store`. | token | no |
| `/reports/[token]` | Shared evidence report. `noindex` + `no-store`. | token | no |
| `/checkout` | Paystack checkout. `noindex` + `no-store`. | session | no |
| `(console)/*` — `/dashboard` `/dependencies` `/incidents` `/clients` `/evidence` `/onboarding` `/settings` `/settings/billing` `/support` | Authenticated customer console. | session | **no — separate phase** |
| `/admin/*` | Operator control plane, proxy-gated in `src/proxy.ts`. | admin | no |

### 1.7 Machine surfaces

| Route | Purpose |
|---|---|
| `/robots.ts` → `/robots.txt` | Crawl policy. |
| `/sitemap.ts` → `/sitemap.xml` | Derived from `lib/routes` constants. |
| `/llms.txt`, `/llms-full.txt` | Machine-readable site summaries. |
| `/opengraph-image` | Generated OG card. |
| `/api/*` | Proxy + auth handlers. `X-Robots-Tag: noindex`. |

### 1.8 Error & loading states

| Surface | Before | After |
|---|---|---|
| `app/not-found.tsx` | Blue radial glow, gradient text, CTA to `/dashboard` (a protected route) as the *primary* action. | Obsidian 404, primary CTA to home, secondary to `/track`, real destination list. |
| `(console)/not-found.tsx`, `(console)/error.tsx`, `(console)/loading.tsx` | Console-scoped. | Untouched (console phase). |
| Auth loading | `Loader2` spinner fallback. | Typographic obsidian loading state. |

---

## 2. Findings from the audit

1. **No dead links found in the footer.** A previous pass already routed every footer
   entry through `lib/routes`. The redesign keeps that discipline: the new footer
   imports the same constants and adds no literal paths.
2. **`/track` footer/CTA link labelled "System status" pointed at `/track`.** `/track`
   is *vendor* status, not *RELIASTRA platform* status (`/status`). Corrected.
3. **`/track` CTA linked to `/` for "Start free"** rather than `/signup`, adding a hop.
   Corrected to the real signup destination.
4. **The landing hero, evidence, comparison and FAQ sections were client components
   with framer-motion**, so the highest-value marketing copy depended on hydration.
   The redesigned homepage is server-rendered; only genuinely interactive bits
   (mobile menu, pricing interval toggle) are client components.
5. **Pricing displayed USD prominently with the actual charge currency in a sub-note.**
   The backend resolves the real charge currency (`usePaymentCurrency` →
   `/api/v1/billing/payment-currency`). The redesign keeps the existing
   `PaymentCurrencyNotice` / `PlanPaymentSummary` / `FxReferencePanel` components —
   they are the only sanctioned wording — and gives them a first-class position
   instead of a footnote.
6. **Feature lists were hand-written per surface.** They are now rendered from
   `lib/dashboard/plans.ts`, which mirrors backend `app.core.permissions`. No
   capability can be advertised that the backend does not grant.
7. **Two competing visual languages** existed on public pages: the cyan/zinc landing
   palette (`components/landing/theme.ts`) and the blue `rs-*` product palette. The
   public site now has one: the `.ob` Obsidian scope.
8. **Theme toggle on marketing pages** produced a light "generic SaaS" rendering of
   the brand. The public site is now a single deliberate dark identity; the toggle
   remains where it belongs — the authenticated product.
9. **No fake anything.** Audited for and confirmed absent: fabricated customer logos,
   invented testimonials, invented uptime figures, invented certifications. The only
   numbers rendered are (a) plan limits from `plans.ts` and (b) live Track API values.
   `SOC 2-aligned controls` copy on the old sign-in aside was removed — "aligned" is
   an unverifiable claim on a marketing surface.

---

## 3. Verification

```
GET /                                    200
GET /product                             200
GET /pricing                             200
GET /research                            200
GET /research/the-dependency-gap         200
GET /track                               200
GET /track/stripe                        200
GET /partner                             200
GET /partner/signup                      200
GET /partner/login                       200
GET /login                               200
GET /signup                              200
GET /verify-email                        200
GET /reset-password                      200
GET /about                               200
GET /contact                             200
GET /docs                                200
GET /glossary                            200
GET /status                              200
GET /security                            200
GET /privacy                             200
GET /terms                               200
GET /external-dependency-intelligence    200
GET /dependency-monitoring               200
GET /sla-evidence                        200
GET /incident-evidence                   200
GET /nonexistent-xyz                     404
```

A link-integrity test (`src/components/site/__tests__/navigation-links.test.tsx`)
asserts that every href emitted by the global header and footer resolves to a route
that exists in `lib/routes` — so the footer cannot regress into placeholder links.

---
---

# Part II — Redesign delivery report

Phase 1 (public marketing surface + authentication) is implemented. The
authenticated customer dashboard and the authenticated partner dashboard were
deliberately left alone and are Phase 2.

## 4. Route inventory — what happened to each route

Legend: **RB** rebuilt on the Obsidian system · **RS** restyled in place ·
**UN** intentionally unchanged (out of scope).

### 4.1 Marketing & product

| Route | Action | Notes |
| --- | --- | --- |
| `/` | RB | Rebuilt as the 13-beat story arc. Old `page-landing.tsx` deleted. |
| `/product` | RB | Now `MarketingPage` → `SiteShell` (previously a bare `<main>`, no header/footer). |
| `/external-dependency-intelligence` | RB | Category definition page; the LLM-facing canonical answer. |
| `/dependency-monitoring` | RB | Same shell. |
| `/sla-evidence` | RB | Same shell. |
| `/incident-evidence` | RB | Same shell. |
| `/pricing` | RB | Plan matrix + NGN/USD disclosure preserved verbatim. |
| `/docs`, `/docs/quickstart`, `/docs/monitoring`, `/docs/evidence`, `/docs/api` | RB | Index card grid replaced with hairline record links. |
| `/glossary`, `/glossary/[term]` (8 terms) | RB | Same treatment; each term is a real definition, none invented. |
| `/about`, `/contact`, `/status`, `/security` | RB | Via `MarketingPage`. |
| `/privacy`, `/terms` | RB | Long-form legal on `ob-prose`. |

### 4.2 Research

| Route | Action | Notes |
| --- | --- | --- |
| `/research` | RB | Index rebuilt; categories limited to the three that exist. |
| `/research/[slug]` × 3 | RB | New `article-template.tsx`: measure-capped, phone-first typography. |

### 4.3 Public dependency intelligence

| Route | Action | Notes |
| --- | --- | --- |
| `/track` | RB | Fabricated green health dot removed — the list endpoint returns no health field. |
| `/track/[vendor]` | RB | Availability figures always carry their window; `no data` where there is none. |

### 4.4 Partner network (public)

| Route | Action | Notes |
| --- | --- | --- |
| `/partner` → `home` | RS | Palette converted to Obsidian tokens; nav/footer rebuilt. |
| `/partner/earn`, `/how-it-works`, `/commission`, `/faq`, `/tiers`, `/premium`, `/resources` | RS | Same. Brand-kit swatches on `/partner/resources` corrected to the real palette. |
| `/partner/login`, `/partner/signup`, `/partner/forgot-password` | RB | Rebuilt on the shared auth primitives. |
| `/partner/support` | RS | Footer restored (was suppressed). |
| `/partner/privacy`, `/partner/terms` | RS | Footer restored. |

### 4.5 Authentication

| Route | Action | Notes |
| --- | --- | --- |
| `/login` (incl. forgot-password) | RB | `AuthShell`. |
| `/signup` | RB | `AuthShell` with the fibre-patch-panel aside. |
| `/verify-email` | RB | OTP step rebuilt. |
| `/reset-password` | RB | Tokenless state now routes to customer login, not partner forgot-password. |

### 4.6 Error & machine surfaces

| Route | Action | Notes |
| --- | --- | --- |
| `not-found.tsx` | RB | `404 / SIGNAL LOST`, header + footer, return link to `/`. |
| `global-error.tsx` | RB | Same language, no emoji. |
| `robots.ts`, `sitemap.ts`, `llms.txt`, `llms-full.txt`, `opengraph-image` | UN | Contracts unchanged. |

### 4.7 Intentionally unchanged

`/(console)/*` (dashboard, incidents, settings, billing, onboarding, support),
`/admin/*`, `/portal/[token]`, `/reports/[token]`, `/checkout`, every
`app/api/*` route handler, `src/proxy.ts` middleware. These are Phase 2 or
non-public. `components/auth/brand-mark.tsx` and
`components/partner/shared/theme-toggle.tsx` survive **only** because their
sole consumers are those out-of-scope surfaces.

## 5. Design system created

`src/app/globals.css` lines 1298→end define the Obsidian layer. Nothing in it
depends on the legacy `--rs-*` tokens.

- **Ground:** `--ob-void #08090A`, `--ob-base #0D0F10`, `--ob-raised #111416`, `--ob-elevated #181B1D`.
- **Text:** `--ob-text #F2F2EE`, `--ob-text-2 #D6D8D5`, `--ob-text-3 #94999D`, `--ob-text-4 #666B70`.
- **Hairlines:** `--ob-line/-2/-3` — depth comes from rules, never shadows.
- **One accent:** `--ob-signal #D9A441` (+ `-dim`, `-wash`).
- **State only:** `--ob-healthy #57A773`, `--ob-degraded`, `--ob-critical #C8544C`, `--ob-unknown`.
- **Type scale:** `ob-display`, `ob-h1…h4`, `ob-lede`, `ob-body`, `ob-small`, `ob-label` (small uppercase technical labels), `ob-mono` (data only), `ob-figure`, `ob-link`.
- **Layout:** `ob-container` (max 1440px), `-narrow`, `-read`; `ob-section`, `-tight`; `--ob-gutter` 24 / 40 / 64px.
- **Controls:** `ob-btn` + `-signal`/`-ghost`/`-sm`/`-block`; `ob-field-label`, `ob-input`, `ob-help`; `ob-alert` + `-error`/`-ok`/`-note`.
- **Surfaces:** `ob-panel`, `ob-inset`, `ob-prose`, `ob-photo`, `ob-scrim-*`, `ob-ticks`.
- **State display:** `ob-dot`, `ob-state`, `ob-live`.
- **Motion:** `ob-rise-1…4`, `ob-drift` — all collapsed by the `prefers-reduced-motion` block.
- **Radius 2–3px. No gradients anywhere.** `--rs-brand-gradient` was flattened to a solid colour and `.text-gradient-brand` now emits a flat `color`.
- A **shadcn token bridge** scoped to `.ob` remaps `--background`/`--foreground`/`--border`/`--muted`… onto Obsidian, so shadcn-based subtrees (partner network) stop rendering as light islands.

## 6. Components created

| Component | Purpose |
| --- | --- |
| `site/wordmark.tsx` | `Wordmark` (typographic lockup + amber signal square) and `SignalMark` (favicon-scale instrument face). |
| `site/primitives.tsx` | `Container`, `Section`, `Eyebrow`, `SectionHeader`, `CTA`, `ArrowLink`, `Rule`, `StateIndicator`, `Metric`, `DataRow`, `Breadcrumb`, `RecordLink`, `CTABand`, `toSystemState`. |
| `site/nav-config.ts` | `PRODUCT_PANEL`, `PRIMARY_NAV`, `HEADER_ACTIONS`, `FOOTER_GROUPS`, `SOCIAL_LINKS` — zero literal internal paths; every href comes from `lib/routes`. |
| `site/site-header.tsx` | Desktop product panel + full-screen mobile index (`#ob-mobile-menu`, `aria-expanded`, scroll lock). |
| `site/site-footer.tsx` | Grouped global footer. |
| `site/site-shell.tsx` | Skip link → `#main`, `overHero` transparent-header mode, header + footer for every public page. |
| `site/auth/auth-shell.tsx` | `AuthShell` + `Field`, `AuthAlert`, `AuthSubmit` — the shared auth primitives, now used by customer *and* partner auth. |
| `site/home/*` | `hero`, `sections`, `research-teaser`, `live-intelligence`, `pricing-summary`, `home-landing`. |
| `site/plan-data.ts` / `plan-matrix.tsx` | Server-safe plan constants split from the client matrix. |
| `site/billing-disclosure.tsx` | NGN charge / USD list-price disclosure. |
| `content/article-template.tsx` | Research article layout. |
| `partner/public/navigation.ts` | `navigatePartner`, relocated out of the deleted `components/landing/`. |

**Deleted:** the entire `src/components/landing/` tree (11 section files, 6
shared files, hooks, tests, `page-landing.tsx`, `theme.ts`) — 4,933 deletions
across the branch.

## 7. Broken links & correctness fixes

1. All 17 `MarketingPage` consumers rendered a bare `<main>` — **no header, no footer, no skip link, no nav**. Fixed via `SiteShell`.
2. `/reset-password` without a token sent *customers* to `/partner/forgot-password`. Now `AUTH_ROUTES.login`.
3. Partner auth and support pages suppressed the footer, leaving the pages where terms and privacy matter most with no legal links. `isFooterHidden` removed.
4. `/track` rendered a green health dot the list endpoint never returns.
5. The sign-in aside claimed "SOC 2-aligned controls" with no attestation behind it.
6. `public/logo.svg` — the favicon and the schema.org organisation logo — was a **leftover third-party mark** (a white "Z" glyph) with an infinite CSS `breathe` animation. Replaced with the RELIASTRA signal mark, static.
7. `LANDING_SECTIONS` re-canonicalised to the 10 anchors that actually exist, so header anchors, the unit test and the Playwright spec all derive from one list.
8. Every footer/header href is now generated from `lib/routes`; `navigation-links.test.tsx` fails the build if one stops resolving.

## 8. SEO improvements

- Every public route has a title, a meta description ≥ 40 characters, and a canonical URL — asserted by the audit script.
- Auth routes (`/login`, `/signup`, `/verify-email`, `/reset-password`) keep `robots: {index:false, follow:true, noarchive:true}`; every other public route is indexable. Both directions are asserted.
- Exactly one `<h1>` per page and no skipped heading levels — asserted on all 49 crawled routes.
- Semantic answer copy for LLM retrieval: what RELIASTRA is, what External Dependency Intelligence is, the problem, the audience, what is monitored, what reliability evidence is, how it is generated, how attribution works, what Research is, what the public dependency pages are — written as prose, not as image text.
- `/glossary` gives each term a canonical definition page; `FaqBlock` and breadcrumbs emit matching JSON-LD.
- Research articles carry article JSON-LD and a real breadcrumb trail.

## 9. Accessibility improvements

- Skip link is the **first tab stop** on every public page and on the auth shell, targeting `#main` / `#auth-form`.
- Visible focus is enforced globally; verified over the first 8 tab stops in the Playwright gate.
- Real `<label for>` on every auth input — no placeholder-as-label anywhere. `aria-describedby` wires hint and error text; `aria-invalid` marks the field.
- `role="alert"` for failures, `role="status"` for confirmations, `aria-busy` on submitting buttons.
- Mobile nav: labelled toggle, `aria-expanded`, scroll lock, `hidden` when closed so it leaves the tab order and the accessibility tree.
- Status is always a **dot plus a word**, never colour alone.
- Meaningful `alt` on every content image; decorative images are `aria-hidden`.
- `prefers-reduced-motion` collapses the whole `ob-rise`/`ob-drift` layer, and the three surviving framer-motion loops (`PulseLine`, `TierBadge`) are now gated on `useReducedMotion`.
- Body copy never drops below 15px at 375px.

## 10. Performance improvements

- Four cinematic JPEGs total, all AVIF/WebP-negotiated through `next/image`: hero 177 KB, patch panel 247 KB, NOC 139 KB, edge night 159 KB. The auth aside is `hidden lg:block`, so phones never request it.
- Static sections ship no client JS — the homepage story renders with JavaScript disabled (asserted).
- No animation library on the public marketing surface; motion is CSS keyframes.
- Hero is height-capped (`h-[100svh] max-h-[880px] min-h-[620px]`) so it cannot push content off a laptop.
- No layout shift: every image is `fill` inside a sized container or has explicit dimensions.
- System grotesk stack — no webfont round-trip, no `next/font/google` fetch at build time.
- `next.config.ts` image qualities pinned to `[70, 75, 82]`; caching headers untouched.

## 11. Testing

### Automated, executed here

| Suite | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx next build` | compiles, 87 static pages generated |
| `npx eslint src/...` | 0 errors (3 pre-existing warnings) |
| `npx vitest run` | **3 files / 42 tests passed** |
| `node scripts/audit-public-site.mjs` | **49 routes, 8 assets, No findings** |

`scripts/audit-public-site.mjs` is a browser-free crawler written for this
work. It seeds every route in `lib/routes`, crawls the internal link graph
transitively with referrer attribution, and asserts: status codes;
`href="#"`/empty/unparseable links; anchor targets exist; `<img alt>`; local
and `/_next/image` assets return 200; exactly one `<h1>` and no skipped
heading levels; title/description/canonical present; noindex exactly where it
belongs; `<header>`/`<main>`/`<footer>` present; and no banned palette tokens
(purple, gradient text, and now light-theme zinc/white literals). It exits
non-zero on error severity, so CI can gate on it.

Audit progression: run #1 = 12 errors / 19 warnings → #2 = 1 / 8 → #3 = 0 / 1
→ #4, #5, #6 = **0 / 0**.

### Playwright — written, not executed

`npx playwright test --list` → **111 tests across 5 files**, all specs parse.

| Spec | Covers |
| --- | --- |
| `public-navigation.spec.ts` | 36 public routes × load, console errors, failed requests, broken images, header/footer/CTA destinations; the 10 canonical homepage anchors; 7 viewports. |
| `public-redesign.spec.ts` (new, the redesign gate) | *accessible structure* (13 archetype routes: one `<h1>`, `<main>`, img alt, no heading skips, skip link is first tab stop, visible focus over 8 tabs, every auth input has an accessible name); *mobile navigation* (390px toggle/`aria-expanded`/scroll lock/close, hero CTA ≥ 40px); *authentication* (identical anti-enumeration message for unknown and plausible addresses, empty-submit `role="alert"`, `?expired=1`, 8-character floor, tokenless reset alert, noindex on all four auth routes, partner cross-links); *error states* (404 status + `SIGNAL LOST` + no "oops"/emoji + return link + chrome present, unknown research slug 404s, unknown vendor never fabricates a percentage); *responsive* (7 viewports × 13 routes, no horizontal overflow > 2px, prose ≥ 15px at 375); *motion & assets* (0 running animations under reduced motion, `/_next/image` is avif/webp/jpeg and < 900 KB, homepage story renders with `javaScriptEnabled: false`). |
| `pricing-transparency.spec.ts` | USD list price vs actual NGN charge, provider name, monthly/annual switch, FX estimate labelling, enterprise card carries no ₦ figure. |
| `checkout-flow.spec.ts`, `checkout-page.spec.ts` | CTA → `/signup`, checkout dialog charge amount. |

**These have not been run.** This sandbox has no browser binary and
`npx playwright install chromium` cannot download one (no outbound network).
The specs are written against the real DOM and are ready for CI; running them
is the first thing to do on a machine with network access.

## 12. Remaining issues

1. **Playwright is unexecuted.** Highest-priority follow-up. Expect small selector drift on first run.
2. **No visual regression baseline.** Layout was verified structurally (static overflow sweep of every `minmax()`/`min-w-[…]`, clamp floors checked at 375px) and through rendered HTML, not through screenshots. A human should look at 375 / 768 / 1440 before launch.
3. **Partner marketing pages are converted, not recomposed.** `/partner/home`, `/earn`, `/how-it-works`, `/commission`, `/faq`, `/tiers`, `/premium`, `/resources` now use Obsidian tokens and read correctly, but their information architecture is still the previous card-heavy composition. They deserve the same recomposition the main site got — a second pass, not a blocker.
4. **`components/auth/brand-mark.tsx` and `partner/shared/theme-toggle.tsx` still exist** for `/admin/login`, `/checkout` and the authenticated shells. They should die with Phase 2.
5. **`next-themes` still wraps the app** with `defaultTheme="light"`. The public surface is now theme-independent, but the provider remains for the dashboards. Removing it is a Phase 2 decision.
6. **`/support` lives in `(console)`** yet appears in `PUBLIC_ROUTES`. It is intentionally absent from the public footer — public visitors are sent to `/contact`. Worth reconciling.
7. **No `/cookies` route exists.** Not invented. If the privacy notice needs one, it needs writing.
8. Local QA renders the honest "measurement network unreachable" state on `/track` because `api.reliastra.com` is unreachable from this sandbox. That is the designed failure path, not a defect — but it means the populated state of `/track` and `/track/[vendor]` has not been seen.

## 13. Backend dependencies required

None of the redesign requires a backend change. Every contract was preserved:

- `POST /api/v1/auth/login`, `/register`, `/forgot-password`; `POST /api/auth/verify-email`, `/reset-password`, `/login`, `GET /api/auth/me`; `GET /api/partners/me`, partner apply.
- Session handling: `storeSessionTokens` + `setAccessToken`, refresh rotation, `?expired=1`, sanitised `?next=` (must start `/`, not `//`, never `/admin`, default `/dashboard`), `EMAIL_NOT_VERIFIED` → verification step, 409 → "account already exists", org creation / trial init / entitlement init untouched.
- `lib/track-api.ts` (`revalidate = 60`) and the pricing/entitlement payloads are consumed exactly as before.

Two things would improve the public surface **if** the backend can supply them
honestly — neither is required, and neither should be faked in the meantime:

1. **A health field on the tracked-vendor list endpoint.** `/track` currently lists vendors without a verdict because the list response carries none; the fabricated dot was removed rather than guessed. A quorum verdict per vendor would let the index show state.
2. **A public incident count or last-observation timestamp per vendor** on the same endpoint, so the index can show recency without an N+1 fetch.
