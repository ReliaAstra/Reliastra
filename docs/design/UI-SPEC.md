# Reliastra Enterprise UI Spec v1.0

**Source of truth:** `frontend/src/app/globals.css`. This document is the
human-readable contract; if code and doc disagree, fix the doc.

Design personality: **calm instrument panel** — Stripe's data clarity,
Linear's density, Vercel's restraint. Decoration budget is spent on exactly
three things: status color, one brand gradient, and depth via borders (never
heavy shadows).

---

## 1. Color system (exact values)

### 1.1 Semantic tokens — LIGHT theme (`.dark` absent)

| Token | Hex | Usage |
|---|---|---|
| `--rs-base` | `#F7F8FA` | App canvas, page background |
| `--rs-elevated` | `#FFFFFF` | Cards, tables, popovers, sheets |
| `--rs-hover` | `#F1F3F7` | Row hover, ghost-button hover, skeleton fill |
| `--rs-active` | `#E6E9EF` | Pressed states, segmented active track |
| `--rs-input` | `#FFFFFF` | Input backgrounds |
| `--rs-border-subtle` | `#E8EBF0` | Default hairline borders, dividers |
| `--rs-border` | `#D5DAE2` | Stronger borders, hover border |
| `--rs-text` | `#0B1220` | Primary text (15.8:1 on elevated) |
| `--rs-text-secondary` | `#3F4A5C` | Body/supporting copy (9.4:1) |
| `--rs-text-tertiary` | `#69748A` | Labels, captions, placeholders (4.6:1) |
| `--rs-brand` | `#2563EB` | Primary actions, links, active nav |
| `--rs-brand-hover` | `#1D4ED8` | Primary hover/pressed |
| `--rs-brand-subtle` | `rgb(37 99 235 / 0.08)` | Tint fills, trial banner wash |
| `--rs-up` | `#059669` | Operational / success (AA on white) |
| `--rs-degraded` | `#D97706` | Degraded / warning |
| `--rs-down` | `#DC2626` | Down / critical / destructive |

### 1.2 Semantic tokens — DARK theme (`.dark`)

| Token | Hex | Usage |
|---|---|---|
| `--rs-base` | `#0B0F19` | Canvas — deep navy, never `#000` |
| `--rs-elevated` | `#111726` | Cards, tables, popovers |
| `--rs-hover` | `#182136` | Hover fills |
| `--rs-active` | `#202B44` | Pressed states |
| `--rs-input` | `#0D1322` | Inputs |
| `--rs-border-subtle` | `#1E293B` | Hairlines |
| `--rs-border` | `#313F58` | Strong borders |
| `--rs-text` | `#F8FAFC` | Primary text |
| `--rs-text-secondary` | `#A5B0C2` | Supporting copy |
| `--rs-text-tertiary` | `#6B7893` | Captions (≥4.5:1 on elevated) |
| `--rs-brand` | `#3B82F6` | Primary actions (lifted for dark) |
| `--rs-brand-hover` | `#60A5FA` | Hover/links on dark |
| `--rs-brand-subtle` | `rgb(59 130 246 / 0.12)` | Tint fills |
| `--rs-up` | `#34D399` | Operational |
| `--rs-degraded` | `#FBBF24` | Degraded |
| `--rs-down` | `#F87171` | Critical |

**Rule:** dark mode is *layered navy*, not inverted gray. Canvas → elevated →
hover always steps lighter by ~5% luminance; borders stay visible at 1px.

### 1.3 Fixed accents (theme-independent)

| Purpose | Value |
|---|---|
| Brand gradient (marketing hero, 404 headline) | `linear-gradient(92deg, #2563EB 0%, #7C3AED 55%, #0891B2 100%)` |
| Landing cyan accent | `#0891B2` light / `#22D3EE` dark |
| Chart series 1–5 (light) | `#2563EB` `#0D9488` `#334155` `#D97706` `#DC2626` |
| Chart series 1–5 (dark) | `#60A5FA` `#2DD4BF` `#94A3B8` `#FBBF24` `#F87171` |
| Uptime bar fill | reuses up/degraded/down tokens |
| Trial pill / PRO TRIAL chip | `border rgba(brand,.25)`, `bg brand-subtle`, text `--rs-brand`; countdown chip ≤3d switches to `bg down/15`, `text --rs-down` |

### 1.4 Status mapping (single source of truth)

| State | Dot | Badge bg | Badge text | Where |
|---|---|---|---|---|
| Operational / Up | `--rs-up` | `up @12%` | `--rs-up` | Health rows, client cards |
| Degraded | `--rs-degraded` | `degraded @14%` | `--rs-degraded` | + pulse animation 2s |
| Down / Critical | `--rs-down` | `down @14%` | `--rs-down` | + pulse 1.5s |
| Paused / Unknown | `--rs-text-tertiary` | `tertiary @12%` | tertiary | paused deps |

Badge shape: `rounded-full px-2 py-0.5 text-[11px] font-medium`, optional 6px dot.
Pulse only while incident is **open**, never on historical rows.

---

## 2. Typography

Font stack: `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`
Mono: `"SFMono-Regular", Consolas, Menlo, monospace` — used for ALL numbers,
IDs, codes, URLs (`INC-1842`, `99.97%`, `182 ms`, endpoint URLs).

| Role | Size/line | Weight | Tracking | Token class |
|---|---|---|---|---|
| Page title | 24px/32 | 600 | −0.02em | `text-2xl font-semibold` |
| Section title | 16px/24 | 600 | −0.01em | `text-base font-semibold` |
| Card title | 14px/20 | 500–600 | normal | `text-sm font-medium` |
| Body | 14px/20 | 400 | normal | `text-sm` |
| Secondary body | 13px/18 | 400 | normal | `text-[13px]` |
| Label / eyebrow | 11px/16 | 600 | +0.05em uppercase | `text-[11px] uppercase tracking-[0.05em]` |
| KPI value | 30–32px | 700 mono | −0.02em | `font-mono text-[32px] font-bold` |
| Micro (badges) | 11px | 500 | 0.02–0.05em | `text-2xs` |

Numbers NEVER change width while live → always mono. Tabular alignment:
right-align all numeric table columns.

## 3. Geometry

- **Radius:** cards/xl `12px`, buttons/inputs/lg `10px`, chips `9999px`.
- **Spacing rhythm:** 4px base. Page padding 16px mobile / 32px desktop.
  Card padding 20px. Grid gaps 16px. Section spacing 32px.
- **Shell:** top bar fixed h‑56px; sidebar w‑64px (icons, md) → 240px (lg);
  main content `pt-[72px]` mobile / `[88px]` desktop; max content width
  1152px (`max-w-6xl`) centered.
- **Borders over shadows:** `1px solid --rs-border-subtle` everywhere;
  shadow only for floating layers — popover/dropdown `0 8px 24px rgb(11 15 25 / .12)`
  (dark: `/ .5`); modal adds backdrop `rgb(11 15 25 / .5)`.
- **Grid pattern (hero/404 ambience):** 44px cells, `--rs-border-subtle`
  lines, masked with radial fade from top.

## 4. Components — exact specs

### Buttons (RsButton)
| Variant | Rest | Hover | Text |
|---|---|---|---|
| primary | `bg --rs-brand` | `--rs-brand-hover` | white |
| secondary | `bg --rs-elevated`, `1px --rs-border-subtle` | `bg --rs-hover` | `--rs-text` |
| ghost | transparent | `bg --rs-hover` | `--rs-text-secondary` |
| danger | `bg --rs-down` | darken 8% | white |

Sizes: sm h‑28 px‑10 text‑12 · md h‑36 px‑14 text‑13/14 · lg h‑40 px‑20 text‑14.
Radius 10px. Focus ring `2px --rs-focus offset 2px`. Disabled: 50% opacity,
no hover. Icon+label gap 6px, icon 16px.

### Stat/KPI card
`rounded-xl border subtle bg elevated p-20px`. Order inside: 36px icon tile
(`rounded-lg`, semantic tint bg @10%, icon 18px semantic color) → eyebrow
label → 32px mono bold value (+context line 12px tertiary or usage meter).
Usage meter: h‑4px rounded-full track `--rs-hover`, fill brand; turns
`--rs-degraded` ≥80%; below meter show link `text-[11px] --rs-brand`.

### Tables
Desktop-only ≥1024px; below → stacked cards. Row h‑56–64px, header h‑44px
eyebrow style. Separators: row bottom hairline only (last none). Hover row
`--rs-hover` with 150ms ease. Whole-row clickable: cursor pointer +
chevron-right 16px tertiary in last cell.

### Trial banner (conversion centerpiece)
`rounded-xl border brand@25%`, background `linear-gradient(135deg, brand-subtle, transparent)`,
padding 20px. Left: Sparkles icon + "Professional Trial — 14 days, every
feature unlocked" semibold 14px; support line explains carry-over; progress
track h‑6px max-w‑md. Right column: days-left `font-mono 24px bold`
(`--rs-down` when ≤3) + primary button "Keep Professional". Dismiss X top-right,
persisted via localStorage key `reliastra_dismiss_trial_banner`.

### Modals / overlays
Backdrop `rgb(11 15 25 / 50%)`. Panel `rounded-xl bg elevated w-full max-w-md`
(upgrade modal `max-w-lg`). Entry animation `rs-modal-in` 200ms ease-out
(scale .98→1). Close on Esc + backdrop click. Focus trap required.

### Payment-currency disclosure (`PaymentCurrencyNotice`)

Shown on every RELIASTRA-owned surface where a customer chooses a plan or starts
a payment: the marketing pricing grid, the plan cards in the upgrade modal, the
pre-payment confirmation step, and the billing page.

- **Copy is canonical, not authored per screen.** The paragraph comes from the
  one constant in `frontend/src/lib/billing/currency.ts`, which a backend test
  compares byte-for-byte against `app/core/payment_pricing.NGN_CURRENCY_NOTICE`.
  Transactional mail renders the same sentence from the same backend constant.
- **Informational, never an alarm.** `role="note"`, info glyph, muted tinted
  container (`bg-rs-brand-subtle` / `border-rs-brand/20`). Never red, never a
  destructive banner, never conveyed by colour or symbol alone: the currency is
  spelled as text ("Nigerian Naira (NGN)"), and the ISO code travels with every
  amount.
- **Placement.** Between the pricing information and the payment CTA. In a plan
  card, the short per-plan line (`PlanPaymentSummary`: what it is billed in, and
  the published amount) sits under the price and above the card's action.
- **Amounts are never composed locally.** A card shows a Naira figure only when
  the API published one for that plan and interval; if it did not, the surface
  states the currency and omits the number rather than estimating.
- **Constraints.** Must not dominate the CTA or push it off-screen at 320px,
  must not introduce horizontal scroll, and must stay inside the modal's own
  scroll area (the panel caps at `90vh`).
- The copy describes the **current state** and makes no promise about a future
  USD switch beyond "we are actively working towards it".

### Toasts (Sonner)
Bottom-right, `rounded-lg bg elevated border subtle shadow-popover`;
success icon `--rs-up`, error `--rs-down`; 4s auto-dismiss; max 3 stacked.

### Inputs
h‑36px `bg --rs-input border subtle rounded-lg px-12 text-sm`. Focus:
border `--rs-brand` + ring `brand @20% 3px`. Error: border `--rs-down` +
helper text 12px `--rs-down`. Placeholder `--rs-text-tertiary`.

## 5. Layout blueprints

**Overview:** title row (title+sub left, primary action right) → 4-col KPI
grid (2-col <1024px) → TrialBanner → "Dependency health" section → incidents
list (left-accent severity stripe 3px on cards) → vendor strip.

**Clients (Agency):** totals strip (4 KPI) → portfolio table columns
`Client | Status | Uptime 24h(bar) | Monitors | Latency | Open incidents |
Last incident | Report link` → unassigned-monitors footnote 12px tertiary.
Gate screen: blurred preview behind gradient scrim, lock tile 56px, feature
list with check icons, single CTA.

**Public portal (/portal/token):** light-first, print-safe (borders only,
no shadows/animations), header 72px with logo tile 40px `#2563EB`, generated
timestamp top-right mono 12px, client cards grid `sm:2 lg:3`, footer signed-
data line + "Powered by Reliastra" (hidden in print).

## 6. Motion

| Token | Value | Use |
|---|---|---|
| fast | 150ms ease | hovers, row transitions |
| base | 200ms ease-out | fades, modal in (`cubic-bezier(.4,0,.2,1)`) |
| slow | 300ms ease-out | toast slide-in |
| pulse-degraded | 2s infinite opacity 1↔.45 | degraded dots |
| pulse-down | 1.5s infinite | down dots |
| shimmer | 1.8s linear loop | `.rs-skeleton::after` |

`prefers-reduced-motion`: all animations/transition durations collapse to
0.01ms (already global).

## 7. Accessibility floor

- Contrast ≥4.5:1 body, ≥3:1 large text/borders-of-meaning (token pairs above comply).
- Focus visible everywhere: 2px ring, 2px offset, never removed.
- Hit targets ≥40×40 (nav rows are h‑48 mobile).
- Icon-only buttons require `aria-label`; radiogroup for ThemeToggle;
  aria-live polite region implied by Sonner.
- Status is never color-alone: dot + label word in badges.

## 8. Don'ts

1. No pure black/white surfaces in dark mode; no pure grays without blue undertone.
2. No drop shadows on static cards — borders only.
3. No spinners for data loads — skeletons shaped like content.
4. No decorative gradients inside the product dashboard (gradient lives in
   marketing + 404 only).
5. No color-only status; no red except genuine failure/critical/money-loss.
6. No new fonts, no letterspacing on body text, no justify.

---
*Versioning: bump minor for token additions, major for breaking visual
language changes. PRs touching `globals.css` must update this file.*
