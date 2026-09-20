# LinkedIn Banner — AI Infrastructure Security Engineer

Ultra-premium LinkedIn profile banner: precision-drawn system topology, 1584 × 396 (4:1).

## Files

| File | Purpose |
| --- | --- |
| `banner-1584x396.png` | **Upload this to LinkedIn** (1x, sRGB) |
| `banner-2x-3168x792.png` | 2x retina master (crisper on HiDPI; LinkedIn accepts it and scales down) |
| `preview-linkedin-overlay.png` | Safe-area proof: simulated avatar circle over the banner |
| `banner.svg` | Editable vector source |
| `banner-safe-overlay.svg` | Vector source with safe-area overlay |
| `generate.cjs` | Generator — regenerates everything deterministically |

## Design notes

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
- **Palette**: graphite `#0C0F14` foundation, steel-gray panels, restrained
  electric blue `#4C8DE8` / cyan `#56C8F0` accents, silver type.
- **Type**: Inter (display/labels) + JetBrains Mono (micro-labels), embedded at
  render time — no system fonts required.

## Regenerate

```bash
node generate.cjs
```

Requires `@resvg/resvg-js` and the `@expo-google-fonts/inter` +
`@expo-google-fonts/jetbrains-mono` TTF packages; the script resolves them from
`/home/user/.cache/tools/node_modules` (adjust `TOOLS` at the top if moved).
