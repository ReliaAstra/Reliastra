# Console UX Audit — 2026-09

Method: rendered the app with `frontend/scripts/qa-backend.mjs` on :8787 and `npm run dev` on :3000, authenticated via `reliastra_refresh_token=qa-refresh-token` init script (same as `frontend/scripts/qa-shot.mjs`). Attempted screenshots at 390/768/1440 light+dark; Playwright browser binary unavailable in sandbox (no outbound network), so audit is code-first with live HTML fetch and manual inspection of `src/components/console/*`. Findings are per route, tagged ugly / confusing / dead / dishonest.

Overall shell:
- Ugly: console uses `--obc-*` dark-only obsidian tokens (amber signal, void #08090A) while `docs/design/UI-SPEC.md` contract is calm instrument panel with `--rs-*` light/dark tokens (blue brand #2563EB, layered navy dark). Spec says source of truth is `globals.css`; if code and spec disagree, fix code or doc. Currently they disagree. Dark-mode parity missing: no `.dark` usage, no light theme, no toggle. Violates UI-SPEC §1.1/1.2 and task requirement "dark-mode parity using existing .dark tokens only".
- Ugly: `.obc-card` uses `linear-gradient(180deg, var(--obc-elevated), var(--obc-raised))` and `box-shadow: var(--obc-shadow)` — UI-SPEC §3 says "Borders over shadows: 1px solid --rs-border-subtle everywhere; shadow only for floating layers - popover/dropdown". Gradient inside dashboard is forbidden per UI-SPEC §8.4.
- Confusing: navigation includes "Reference" group linking to public `/research` and `/docs` with external arrow, marked as leaving console. While honest (no authenticated research capability), it adds cognitive load and breaks console IA. `consoleNavGroups` still reads `org.has_agency_mode` and could surface agency routes if flag true — B2B remnant.
- Dead: `frontend/src/app/agencies`, `referral-unavailable`, `creators` dirs exist but product is developer-first; redirects in `next.config.ts` send `/partner/*` to `/creators` and `/clients` to `/dashboard` — console should not reference them. `frontend/bun.lock` existed (now removed in C track) alongside `package-lock.json`.
- A11y: focus rings use `--obc-signal` (amber) not `--rs-focus` (blue); hit targets on desktop rail are h-10 (40px) OK, but mobile primary nav is h-12 with border-b-2, not following spec's 40px min and 2px ring. Need to verify 0 unnamed buttons, 0 unlabeled inputs, 1 h1 per page, no heading jumps — current pages have 1 h1 (PageHead) but sections use h2, so OK. However some icon-only buttons (copy, close) lack aria-label in developer page.
- Honesty: mostly honest after Phase 2 fixes (no fabricated incident metrics, no default HIGH confidence, no 100% uptime for unmeasured deps, no 0 ms latency). However `formatUptime` returns "-" and many places render "no data"/"none"/"not recorded" instead of spec-mandated "—" per `cli/cmd/reliastra/main.go` and mission. Inconsistent sentinel.

Per-route:

## /dashboard (overview.tsx)
- Ugly: StatCard row uses `.obc-card-row` (4-col grid) with gradient cards, not UI-SPEC Stat/KPI card (rounded-xl border subtle bg elevated p-20px, 36px icon tile, eyebrow label, 32px mono bold value). Current cards are plain divs with label/value/sub, no icon tile, no usage meter. Spacing mt-6, not 32px section spacing. Uses `obc-*` tokens.
- Confusing: "Availability 24h" from `summary.overall_uptime_percentage` is aggregate across all deps — user can't trace which deps contributed. Task says "every number in the UI must trace to its evidence record (link it)" — no link to evidence. "Evidence records" count links to /evidence but not to specific records.
- Dead: TrialBanner referenced in UI-SPEC blueprint but not rendered in overview.tsx — should be conversion centerpiece per spec §4.
- Dishonest: If summary missing, `formatUptime` returns "-" which could be read as measurement; should be "—" and explicitly say can't. Empty workspace shows "No dependencies monitored" with Add button — OK, but loading skeleton is `RowsSkeleton` (row-shaped) which is correct per spec (no spinners).
- Missing states: has empty, loading (RowsSkeleton), error (Failure) — good. But no permission state.

## /dependencies
- Ugly: table uses DataTable with fixed widths, first column fluid, but uses `obc-*` tokens, not `rs-*`. Row height is 44px (--obc-row) vs spec 56–64px. Header is eyebrow style? Current header uses `obc-label` but not 44px height. No chevron-right in last cell for whole-row clickable per spec.
- Confusing: filters "All/Faults/Paused" with counts — good density, but "Faults" lumps degraded+down, while status column shows operational/degraded/down/paused. User must learn mapping. Latency column shows "no data" for 0 ms — honest but inconsistent with "—" rule. Incident column renders link to incident but stops propagation — nested interactive inside row link, which is invalid HTML (previous audit noted). Currently only title cell is link? Code shows rowHref is dependency id, but incident cell has Link with stopPropagation — still nested anchor, hydration error risk.
- Dead: plan limit logic shows "Plan limit reached (3)" for free plan, but product is $9/month single plan, not free/enterprise ladder. Limit display should be 25 deps per developer-first refurbishment.
- Dishonest: none obvious; uptime null prints "no data" not 100% — fixed. Latency 0 prints "no data" — fixed.
- Missing: no permission state, no horizontal overflow handling at 390px — table becomes record stack below lg, which is good, but need to verify no overflow.

## /dependencies/[id]
- Ugly: page uses `obc-*` tokens, section spacing via `obc-section` (mt 36px) not 32px, card padding not 20px. Plot component is hand-rolled SVG with threshold rule — good, but uses `obc-*` colors not `rs-chart-*`. CheckStrip uses `obc-*`. Configuration section is two-column grid, not table.
- Confusing: "24-hour totals" grid uses `Readout` with label/value, but labels like "Availability", "Average latency" — availability derived from history.total_checks, not linked to evidence. "Observation stream" shows CheckStrip and counts, but quorum count is from `quorum_confirmed` which is single-topology consecutive failure, not multi-region quorum — could confuse.
- Dead: `CheckExecution` component shows "Run check" button — does it work with single topology? Might be dead if backend doesn't support.
- Dishonest: latency plot says "Measured at the RELIASTRA observation point, over the last 24 hours, in UTC" — honest. Empty plot says "Not enough observations to plot" — honest. But "no data" sentinel again.
- Missing: empty/loading/error states present, but no permission.

## /incidents
- Ugly: similar table issues, uses `obc-*`, no chevron, row height 44px.
- Confusing: severity colors inline style `#E58C85` for critical, `#E3BE7A` for major — one-off colors, violates "no new one-off colors" and "status color only for status". Should use --rs-up/degraded/down tokens.
- Dead: evidence column uses `evidenceRank` and `evidenceState` — logic for "generating", "failed", "not on your plan" — but product is single plan with evidence included, so "not on your plan" is dead.
- Dishonest: none — confidence not shown here, so no fabrication. Duration computed from started_at/resolved_at — honest.
- Missing: filters present, empty state good, but no link from incident count to evidence.

## /incidents/[id]
- Ugly: attribution section uses grid gap-px bg-[var(--obc-line)] rounded-[6px] — one-off color, not rs tokens. Timeline uses ol with border, not spec's incident list left-accent severity stripe 3px.
- Confusing: attribution explains "Your service vs External dependency" but says "RELIASTRA observes the dependency, not your internal systems" — good honesty, but correlation method/confidence/window shown from `primary` correlation — if none, shows "not supplied" — honest but inconsistent with "—".
- Dead: evidence section shows "Open evidence record" button if evidence exists, otherwise retry/upgrade/generating — upgrade path dead for single plan.
- Dishonest: previously hardcoded "Error rate 3.1x" and "Latency p95 1,240ms" — fixed per console-inventory §4. Now computes observations, failed checks, regions, peak/median from check results — honest. But still uses "no data" sentinel.
- Missing: has loading/error/empty, but no permission.

## /evidence
- Ugly: table similar issues, uses obc tokens, no chevron, row height.
- Confusing: columns: Record, Incident, Dependency, Generated, Checksum (truncated 16 chars with …), Size KB, Retention — checksum truncated is good for density, but not monospace? It is mono but truncated. Size computed as KB via toFixed(0) — honest. Retention shows "until yyyy-MM-dd" or "indefinite" — honest.
- Dead: `hasEvidence` check for plan — dead for single plan (evidence included). Should not gate.
- Dishonest: none — confidence not defaulted, checksum real, size real.
- Missing: empty state good, but no link from number to evidence record? The record itself is the evidence, so OK.

## /evidence/[id]
- Ugly: uses obc tokens, sections with bg-[var(--obc-base)] px-4 py-2, not rs elevated.
- Confusing: page reads as record for non-customer (vendor, lawyer) — good posture, but sections "Subject", "Observations", "Attribution", "Integrity", "Share and export" — attribution shows method/confidence/window from incident correlations, but if missing shows "not recorded" — honest but sentinel inconsistent. Share URL uses window.location.origin — OK, but verification link is `/reports/${share_token}` which is public, not `/evidence/[id]` — honest.
- Dead: regenerate button — does it make sense for immutable evidence? Backend supports regenerate, but product says signed immutable snapshots — regenerate might be dead.
- Dishonest: none — checksum, size, generated time, record id all real.
- Missing: loading/error present, but no permission.

## /onboarding (observation-setup.tsx)
- Ugly: renders outside console shell (focused shell) — per console-inventory §4, intentional. But uses obc tokens? Let's check: observation-setup.tsx uses obc classes heavily — needs migration to rs.
- Confusing: four stages 01 ENVIRONMENT → 02 DEPENDENCY → 03 OBSERVATION → 04 CONFIRM → observation active — good sequence, but ENVIRONMENT stage shows org, plan, monitor allowance, minimum interval — plan allowance currently shows free plan limits (3 deps) not 25. Suggestions from real public catalog `GET /v1/vendors` — honest. Interval floored by plan — honest. Security note: draft persisted but headers never persisted — good.
- Dead: "Client setup" sequence still exists in `components/sequence/client-setup.tsx` — agency onboarding remnant, should be removed per developer-first.
- Dishonest: none — no invented integration list.
- Missing: empty/loading/error handled, but no permission.

## /settings
- Ugly: uses obc tokens, sections with bg-[var(--obc-base)] px-4 py-2, not rs. Organization form with org-name input, slug read-only — OK, but uses obc-input not rs-input.
- Confusing: shows "Organization" fact with org name, plan name, dependencies count — plan name from `getPlan` which still has free/pro/enterprise ladder — confusing for single plan. "Alert channels" shows email included on every plan, Slack included on pro/enterprise — but product is one plan, no enterprise, and Slack should be included. "Plan entitlements" shows monitored dependencies, min check interval, retention, evidence records — evidence shows "not included" for free, but should be included for developer. Team member limit not shown here but shown in billing — inconsistency.
- Dead: references to enterprise, team members, agency_branding etc. — B2B remnants. Link to /settings/developer, /settings/notifications, /settings/billing — but mission lists only billing, settings — developer and notifications are extra routes not in spec, might be OK but need IA.
- Dishonest: none — entitlements from plan, not fabricated.
- Missing: has no loading/error for org save? Uses mutation with toast — OK. But no permission.

## /settings/billing (billing.tsx) — WORST ROUTE
- Ugly: uses obc tokens everywhere, grid gap-8 bg-[var(--obc-base)] p-5 sm:p-6, not rs elevated p-20px. Borders use obc-line, not rs-border-subtle. Buttons obc-btn, not RsButton spec (h-36 px-14 text-13/14 radius 10px). Progress uses <progress> with accent-[var(--obc-signal)] — not spec's usage meter h-4px rounded-full track --rs-hover fill brand, turns degraded ≥80%.
- Confusing: shows "Current subscription" with evaluation, free, pro, enterprise, annual vs monthly, price $39 vs $9 inconsistency, payment currency NGN, product price USD, next charge, billing cycle, payment currency, period starts/ends, evaluation remaining, base plan, status — too many fields, many B2B. For developer-first single plan $9/month monthly only, should show: Developer plan, $9/month, monthly, 25 deps, 30s checks, 90-day retention, 1 seat. Annual billing does not exist; checkout should reject interval. But code still handles annual. Team member limit shown in Usage — B2B seat concept, should be removed. "Upgrade" button opens plan chooser with plan ladder — should be single plan. Trial banner copy "Professional Trial - 14 days, every feature unlocked" — old copy, should be "Developer trial".
- Dead: enterprise plan, annual billing, seats, white-label, client groups, partner network, growth funnels — all unmounted in stage 1 but still rendered. `PLAN_PRICES_USD["pro"]=9` in backend per developer-first-refurbishment §5, but frontend still shows $39 from qa-backend pricing. `PLAN_ANNUAL_PRICES_USD` all None, but frontend still shows annual option. `PUBLIC_PLAN_CATALOG=("pro",)` but frontend still lists free/pro/enterprise.
- Dishonest: price $39 vs $9 — which is true? Backend says $9, qa-backend says $39 — stale truth. Team limit "Unlimited" when plan.max_team_members null — but product is one seat, not unlimited. "No charge" for free plan — but post-trial grace has reduced limits, not free. "Payment method" shows "No payment method on file" for free — OK, but for paid shows display — honest. Invoices show product_price_display vs charged_amount_display — honest, but uses fixture data. Cancellation terms from `COMMERCIAL_COPY` — need to verify matches reality.
- Missing: empty/loading/error present, but no permission, no link from numbers to evidence.

## /settings/developer
- Ugly: uses obc tokens, Command component with border-b, not rs. Tables use obc-table.
- Confusing: shows CLI install via `go install github.com/ReliaAstra/Reliastra/cli/cmd/reliastra@latest` — but root README quickstart should now be `npm install -g reliastra / pipx install reliastra` per PR #80, go install is "from source" option. So this page has stale truth.
- Dead: webhook secrets generated client-side, shown once — OK, but API keys and webhooks might be B2B? No, developer-first still needs API keys. So not dead.
- Dishonest: commands printed are checked against CLI's own command table via `docs-cli-surface.test.ts` — honest. But install command stale.
- Missing: has empty/loading, but copy button lacks aria-label? Uses text "Copy"/"Copied" — OK, but icon-only? No, has text.

## /settings/notifications
- Ugly: uses obc tokens, article with bg-[var(--obc-base)] p-5, not rs. Buttons obc-btn.
- Confusing: shows Email and Slack channels, but product is one engineer, one plan — notifications should be simple. Verification required flow with code — OK, but events only incident.detected and incident.resolved — missing incident.updated? Might be incomplete.
- Dead: Slack not configured vs email — but both should be available on developer plan.
- Dishonest: none — channels from API, status from API.
- Missing: has loading/error, but no empty for email? Shows "No email destinations" — OK.

## /support
- Ugly: uses obc tokens, grid xl:grid-cols-[1.5fr_1fr], sections with border.
- Confusing: says "Support is answered by email" — channel email, replies to address on account, first response within one business day — clear. Form has subject, category, message, attachment note — category decides triage, not who reads it — good. How it reaches person explained in 3 steps — good.
- Dead: none — email-only support is product decision.
- Dishonest: none — no bot, no auto-close, honest.
- Missing: has receipt state, but no loading/error for send? Shows error "The email was not sent. Nothing was delivered" — good. No permission.

## Layout (console-shell.tsx, console-nav.tsx, console-topbar.tsx)
- Ugly: shell uses `obc` class min-h-screen, rail w-[var(--obc-rail)] 240px, bar h-[var(--obc-bar)] 56px — close to spec's w-64px (256px) and h-56px, but colors are obc-void/base, not rs-base/elevated. Top bar hidden on mobile, mobile bar sticky with system status compact and primary nav row — per spec, mobile is designed, not collapsed, good. But uses obc tokens.
- Confusing: SystemStatus shows counts from health and open incidents — honest, but says "System status · n monitored" with dot+word chips — per spec, status is dot+word, good. However counts filtered by toState which maps operational/up/resolved/healthy to ok, etc. — might hide nuance. PlanLine shows "PRO PLAN - Manage" or "Free plan · Upgrade" — but product is Developer plan, not Pro. Copy stale.
- Dead: CommandPalette, UpgradeModal, EvidenceGateModal, AddDependencyPanel are mounted in shell — UpgradeModal shows plan ladder (free/pro/enterprise) — dead for single plan. EvidenceGateModal maybe dead? AddDependencyPanel uses rs tokens (newer) — good, but rest uses obc.
- Dishonest: none.
- Missing: offline banner "Offline. Showing the last values retrieved." — good. Skip link present — good.

## Additional findings
- No horizontal overflow at 390px? Previous QA audit said 0 overflow after fixes. Need to re-verify with new rs tokens.
- Console/hydration errors: previous audit found 0 after fixes, but nested anchor in dependencies table could cause hydration error.
- Keyboard navigability: DataTable first cell is real anchor now per agency-onboarding-inventory §2 — good, but incident cell link inside row is still nested — invalid.
- Dark-mode parity: missing entirely — console is dark-only, no light theme, no .dark tokens usage.
- Honesty under constraint: most tables now use "no data" not "—" — violates mission's explicit rule to use "—". Should be unified to "—" per CLI.
- B2B remnants: `src/lib/agency/navigation.ts` still exists, `components/agency/*` maybe deleted? Check — but navigation still references agency. `frontend/src/app/agencies` dir exists with product story using obsidian system — should be removed or redirected per developer-first. `referral-unavailable` dir exists — PLG gamification removed, should be gone. `creators` dir exists — new creator program, should stay? But mission says find remnants (agencies, creators, referral-unavailable dirs, plan ladders, referral code). Creators is new, not B2B? Actually developer-first kept creator endpoints (`/r/{code}`) — so creators page should stay. But agencies should go.
- Plan ladders: `src/lib/dashboard/plans.ts` still has free/pro/enterprise — should be single plan Developer $9/month.
- Referral code: `referrals_router` /my-referral stays per developer-first, but `/leaderboard`, `/claim-reward` removed — need to check if any UI still references leaderboard.
- Empty/loading/error states: most pages have them, but permission states missing everywhere — need to add 403 handling.

## Screenshots
- Attempted via `qa-shot.mjs` at 390/768/1440 light/dark; browser binary unavailable in sandbox (no network). Saved HTML snapshots instead via curl for manual inspection. Before/after screenshots will be captured in slice commits once Playwright available in CI.

## Worst route first
1. /settings/billing — most B2B dead code, price inconsistency, annual/seats/enterprise confusion, violates developer-first single plan.
2. /settings — shows team members, enterprise, confusing entitlements.
3. /dashboard — gradient cards, no evidence links, missing trial banner.
4. /dependencies — nested anchor, one-off severity colors.
5. /incidents — one-off colors, dead evidence gating.
6. /evidence — dead hasEvidence gate.
7. /dependencies/[id] — obc tokens, missing evidence links.
8. /incidents/[id] — attribution OK but obc tokens.
9. /evidence/[id] — obc tokens.
10. /onboarding — obc tokens, agency remnants.
11. /support — relatively clean, but obc tokens.
12. /settings/developer — stale install command.
13. /settings/notifications — relatively clean.

Next steps: fix in slices, one route per commit, worst first, following UI-SPEC tokens exactly, Linear density (tables over card-grids, mono for IDs/hashes, status color only for status), every number traces to evidence record, first-class empty/loading/error/permission, keyboard navigability, dark-mode parity.
