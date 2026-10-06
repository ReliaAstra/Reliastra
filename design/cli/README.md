# Reliastra CLI — terminal design system

**v0.1.0 · proposal · the UI that appears in a developer's terminal**

This is the design for how `reliastra` looks when it runs: the output a developer
sees in their own terminal. It is a proposal with runnable proof, written before
any Go changes, so the look can be argued about as a design rather than as a
diff.

- **Mockups** — [`mockups/`](mockups/) · pixel-accurate, generated, never hand-edited
- **Review gallery** — `python3 -m http.server 8123 --directory design/cli`, open `/preview/`
- **Runnable proof** — [`demo/reliastra-demo.py`](demo/reliastra-demo.py) replays every screen
  into *your* terminal with real ANSI escapes
- **Tokens** — [`tokens.json`](tokens.json) · the single source both the mockups and the demo read
- **Renderer** — [`render/`](render/) · markup → SVG → PNG, and → run-list JSON for the demo

```bash
python3 design/cli/demo/reliastra-demo.py --list
python3 design/cli/demo/reliastra-demo.py 06 --play          # the incident dossier, live
python3 design/cli/demo/reliastra-demo.py 04 --color never   # the plain fidelity level
node design/cli/render/build.mjs                             # regenerate every mockup
```

The mockups and the bytes come from one source of truth: `render/screens/*` build a
run list; the PNG is drawn from that run list and the demo replays the same run
list. A reviewer approving a picture and a developer seeing output cannot drift.

---

## 1 · Principles

1. **Restraint over decoration.** Brand blue marks identity and interaction only.
   Four semantic inks mark verdicts only. One reserved ink marks provenance.
   Everything else is a four-step neutral ramp. Rainbow output is the generic
   look; this is not it.
2. **Structure from rules, not boxes.** Ruled section headings, aligned kv
   blocks, right-aligned numerics, a two-column gutter. ASCII box frames are
   banned from output: they fight wrapping, diffs, greps and screen readers.
3. **The honesty contract lives in the layout.** A verdict always carries its
   scope (where, when, how many points). Attribution prints as a weighted score
   beside its methodology version, never as a cause. One observation point is
   labelled as one. A field the API did not return is `—`, never `0`, never
   `unknown`, never blank. These are the repo's existing rules; the design gives
   them visual form instead of prose.
4. **One code path, five fidelities.** `full · ansi256 · ansi16 · plain · json`.
   Removing colour removes nothing: glyph, shape and position still carry every
   state. `plain` is today's CLI, unchanged — see
   [`mockups/11-fidelity-triptych.png`](mockups/11-fidelity-triptych.png).
5. **Twelve marks, no dingbats.** `✓ × ! · › → │ ─ █ ▁…█ — …` — every glyph is
   inside IBM Plex Mono (the brand font) *and* inside DejaVu Sans Mono, Menlo,
   Consolas, SF Mono and Cascadia Mono. A mark a common font cannot draw is a
   tofu box in a verification record, which is a credibility failure, not a
   style choice. Braille spinners and `● ◐ ✖` were rejected on exactly this test
   (Plex Mono does not contain them; check `render/`'s cmap audit).
6. **Motion is a measurement.** The spinner is a caliper sweeping a six-cell
   track (`█····· → ·····█`), the verb says what is happening, elapsed time
   appears after 400 ms. Live mode redraws one status line at 1 Hz, never the
   scrollback, never the alternate screen, so Ctrl+C leaves an intact transcript.

## 2 · Roles

A role is never a colour name in code. `verdict.down`, not red. `tokens.json`
resolves every role four ways — truecolor hex (dark + light), 256, 16, and none.

| role | carries | dark | light |
|---|---|---|---|
| `brand` / `brand.bright` | rails, links, selection, the command word, focus | `#3B82F6` / `#60A5FA` | `#2563EB` / `#1D4ED8` |
| `verdict.up` | confirmed reachable · verification held | `#34D399` | `#059669` |
| `verdict.degraded` | degraded · advisory · unsigned artifact | `#FBBF24` | `#D97706` |
| `verdict.down` | confirmed failure · verification did not hold | `#F87171` | `#DC2626` |
| `verdict.unknown` | no observation · field absent — tertiary ink *on purpose* | `#6B7893` | `#69748A` |
| `provenance` | **reserved:** vantage point, methodology version, hash, signature state | `#22D3EE` | `#0891B2` |
| `text.primary…faint` | values → prose → keys → scaffolding | `#F8FAFC … #4C5A75` | `#0B1220 … #9AA4B8` |

Chips are a role ink over a 16% blend of itself on the canvas — solid, whole
cells, because that is what a terminal paints. At 16 colours a chip becomes
reverse video; at `plain` it becomes the word and its glyph.

The palettes are the web app's `--rs-*` tokens (light and dark), so the terminal
and the console are visibly the same product.

## 3 · Type and grid

IBM Plex Mono, weights 400 / 500 / 600 — no second family, no proportional
fallback. `display` (wordmark) · `section` (ruled upper labels) · `key` ·
`value` · `verdict` · `numeric` (right-aligned, always with its unit) · `prose`
(wraps at 92 cols, hanging indent) · `mono_raw` (ids, hashes, urls — wrapped to
a second line, **never elided**; only names and urls may take `…`).

Grid: 2-col gutter between table columns, 2-col indent per level, kv blocks
align on their own key width, numerics right-aligned. Section headings are
`LABEL ─────────── meta`, the meta right-aligned on the same line.

Breakpoints: `≥120` full tables with the probe strip · `100–119` tables without
the strip, every field kept · `80–99` tables become kv stacks, urls get their
own line · `<80` one field per line, no meter, the number alone.

## 4 · Components

| component | form | rule |
|---|---|---|
| verdict chip | `× DOWN` on a tinted cell | glyph + word + tint: three carriers, so no-colour and colour-blind readers lose none |
| ruled heading | `DEPENDENCIES ─────── 3 up · 1 down` | counts are coloured by state; the label never is |
| kv block | `key  value` | keys tertiary, values medium; multi-line values hang at the value column |
| table | header upper + per-column hairline | missing cell `—`; numerics right; ids never truncated |
| probe strip | `▁▁▂▇█` one block per probe | block height = latency against the 2 s envelope (absolute, so calm reads calm); **red only where a probe failed** |
| latency axis | thin baseline + one marker at the value | for dense table rows; lighter than a filled meter, reads as a measurement |
| meter | 20–24 cells, filled over a 20% track | for single scores; the number is always printed beside it — a bar alone is a claim |
| attribution meter | 20-cell meter per signal, chart ramp | components plotted as a share of the score; methodology version in provenance ink on the next line |
| window timeline | `17:12 ─×──×──×─ 17:41` | the shape of a window in one line |
| hash diff | two full hashes + `^` at the first differing nibble | forensic alignment; hashes wrap, never elide |
| hint | `› reliastra evidence show …` | brand caret, secondary prose; suppressed by `--quiet` and `--json` |
| error block | `× title` / `│ detail` / `→ fix` / `│ exit N` | red = the invocation failed; amber = it worked but needs attention; the exit code is named last |
| sweep (spinner) | `█·····` … `·····█` at 90 ms | one `\r`-redrawn line; suppressed when not a TTY |
| status line (live) | redrawn at 1 Hz | scrollback and alternate screen untouched |

## 5 · Moments — the first five seconds

A bare `reliastra` is never silence and never a usage wall. Three moments, one
wordmark:

| moment | when | prints | exit |
|---|---|---|---|
| `first_run` | no config file on this machine, TTY, not `--quiet` | the wordmark, the three-sentence promise, `not signed in · nothing probed yet`, three doors (login / public observatory / deps add), quickstart url | 0 |
| `home` | bare invocation with a session, TTY, not `--quiet` | the wordmark, a live state block — account, probing counts, open incidents, evidence — and three *contextual* next commands (the open incident first) | 0 |
| `plain` | piped, `--quiet`, `TERM=dumb` | today's `fullUsage()`, unchanged; bare invocation still exits 1 | 1 |

The wordmark is the CLI image: `[▁▂█▄▂▁]  R E L I A S T R A  0.4.0` — nine cells of
observation trace with one spike in `verdict.down`, then tracked caps. It is
drawn from block elements and letters only, so it survives every font and every
fidelity level, and in `plain` it degrades to the same nine honest cells.

Two rules keep this from becoming banner spam: the first-run screen *is* the
absence of a config file, so it can never print twice on a machine; and no
moment prints when stdout is not a TTY, so prompts, pipes and CI logs stay
exactly as clean as they are today.

## 6 · Fidelity matrix

| level | when | renders |
|---|---|---|
| `full` | TTY, `TERM != dumb`, `NO_COLOR` unset, `--color != never`, ≥80 cols | roles in truecolor, chips, meters, strips, ruled headings, hints |
| `ansi256` | `COLORTERM` not truecolor | identical layout through the 256 column |
| `ansi16` | 8/16-colour terminal | identical layout; chips become reverse video |
| `plain` | piped, redirected, `NO_COLOR`, `--color never`, `TERM=dumb`, CI | **no escapes at all** — today's CLI, unchanged |
| `json` | `--json` | the API's own shape, keys alphabetical, no chrome, no hints, no colour, ever |

Invariants: removing colour never removes meaning; nothing on stderr that
stdout did not earn; a chip is never the only carrier of a verdict; `--quiet`
drops chrome, never fields.

This design also adds one flag the current CLI lacks, because colour needs an
off switch that is not an environment variable: `--color auto|always|never`.

## 6 · Voice

Lower-case prose; UPPER CASE only for section labels and verdict words. No
exclamation marks, no emoji, no cheerleading. Every failure names the next
command. A verdict is stated with its scope. A region label is never placed
where a reader will take it for corroboration. The exit code is part of the
message.

## 8 · Screens

| id | command | what to look at |
|---|---|---|
| 01 | `reliastra --help` | grouped by intent, exit codes as a contract, `--color` |
| 02 | `reliastra login` | sweep mid-flight, masked password, where the session was written |
| 03 | `reliastra doctor` | amber advisory with the fix behind an arrow, counted summary |
| 04 | `reliastra deps list` | probe strips, state chips, the provenance footer |
| 05 | `reliastra checks recent` | latency bars vs window max, percentiles footer |
| 06 | `reliastra incidents show` | the dossier: verdict + scope, window timeline, attribution shares |
| 07 | `reliastra verify … --file` | the money screen; the amber `signature` advisory |
| 08 | `reliastra verify` (mismatch) | hash diff caret, two named exits, exit 4 |
| 09 | `reliastra obs show stripe` | the honesty paragraph on a rail, unauthenticated |
| 10 | failure taxonomy | three classes, three exit codes, next command each |
| 11 | fidelity triptych | full / plain / `--json`, same screen |
| 12 | design sheet | every token, glyph and component on one surface |
| 13 | light theme | theme parity on the dossier |
| 14 | bare `reliastra`, fresh install | the first-run moment: wordmark, promise, three doors |
| 15 | bare `reliastra`, signed in | the home screen: live state block, contextual next commands |

## 9 · Regenerating

The renderer needs `@resvg/resvg-js` plus the two font packages, in any of
`$RELIASTRA_DESIGN_TOOLS`, `~/.cache/tools` (this repo's existing convention —
`design/linkedin-banner/generate.cjs` uses the same path) or
`design/cli/tools`:

```bash
mkdir -p ~/.cache/tools && cd ~/.cache/tools && npm init -y
npm i @resvg/resvg-js @expo-google-fonts/ibm-plex-mono @expo-google-fonts/jetbrains-mono
cd - && node design/cli/render/build.mjs          # mockups/*.png + demo/screens/*.json
```

`build.mjs` lints as it renders: any line wider than its screen's column budget
is reported, because a wrapped line in a mockup is a wrapped line in a terminal.

## 10 · What changes in Go (follow-up work, not in this proposal)

1. `theme.go`: the role table generated from `tokens.json`; code says
   `verdict.down`, never a hex value.
2. `output.go`: the sinks learn the negotiated fidelity level once at startup;
   `renderTable`/`renderKV`/`hint` read it instead of knowing about colour.
3. `--color auto|always|never` global flag; `NO_COLOR`, `COLORTERM`, `TERM` and
   isatty consulted in that order of precedence.
4. Probe strip column at ≥120 cols; kv-stack degradation below 100.
5. The sweep spinner and 1 Hz status line behind a TTY check; `\r` redraws only.
6. Nothing else: exit codes, the `--json` shape and the `—`-for-missing rule are
   semantics, and this design adds presentation only.
