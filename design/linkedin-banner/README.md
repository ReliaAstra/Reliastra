# LinkedIn Banner — AI Infrastructure Security Engineer

Ultra-premium LinkedIn profile banner: precision-drawn system topology, 1584 × 396 (4:1).
Two themes: **light** (airy / relaxing — the default) and **dark** (graphite).

## Files

| File | Purpose |
| --- | --- |
| `banner-1584x396.png` | **Light theme — upload this to LinkedIn** (1x, sRGB) |
| `banner-2x-3168x792.png` | Light 2x retina master (crisper on HiDPI; LinkedIn scales it down) |
| `preview-linkedin-overlay.png` | Light safe-area proof: simulated avatar circle over the banner |
| `banner-dark-1584x396.png` | Dark theme (graphite/cyan) — alternate upload |
| `banner-dark-2x-3168x792.png` | Dark 2x retina master |
| `preview-linkedin-overlay-dark.png` | Dark safe-area proof |
| `banner.svg`, `banner-dark.svg` | Editable vector sources |
| `banner(-dark)-safe-overlay.svg` | Vector sources with safe-area overlay |
| `generate.cjs` | Generator — regenerates everything deterministically |

## Design notes

- **Type pairing**: Manrope (geometric humanist display) + IBM Plex Mono
  (micro-labels), embedded at render time — no system fonts required.
- **Left zone** (x < 576): primary statement — `AI INFRASTRUCTURE / SECURITY`,
  secondary line `CLOUD • KUBERNETES • AI SYSTEMS`, eyebrow
  `MISSION-CRITICAL PLATFORMS · ZERO TRUST`. Generous negative space around it.
- **Right zone**: 8-stage production topology
  (Applications → Gateway → Identity → Kubernetes → Services → GPU Fabric →
  Observability → Security) inside a glass panel, with an OTLP telemetry bus,
  directional flow arrows, dependency/evidence annotations, a zero-trust
  boundary bracket, regional health chips (US-EAST-1 / EU-WEST-1 / AP-SOUTH-1),
  and a metrics readout strip (RPM, p99, pods, evidence hash, uptime/MTTR).
- **Safe area**: the LinkedIn avatar (bottom-left ~152 px circle) only clips the
  short rule under "SECURITY" — no text or diagram content is covered.
- **Light palette**: mist `#F2F6FA` foundation, soft white panels with a gentle
  shadow, calm sky `#8FC4E8` → azure `#2F7FBF` accents, slate type.
- **Dark palette**: graphite `#0C0F14` foundation, restrained cyan `#56C8F0`.

## Regenerate

```bash
THEME=light node generate.cjs   # default
THEME=dark  node generate.cjs
```

Requires `@resvg/resvg-js` and the `@expo-google-fonts/manrope`,
`@expo-google-fonts/ibm-plex-mono`, `@expo-google-fonts/inter`, and
`@expo-google-fonts/jetbrains-mono` TTF packages; the script resolves them from
`/home/user/.cache/tools/node_modules` (adjust `TOOLS` at the top if moved).
