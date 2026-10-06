#!/usr/bin/env node
// design/cli/render/build.mjs
//
// Renders the screen catalogue two ways from one source of truth:
//
//   mockups/<id>.png       pixel-accurate mockups (resvg-js + IBM Plex Mono)
//   demo/screens/<id>.json run lists the ANSI demo replays in a real terminal
//
// Usage:
//   node design/cli/render/build.mjs            # everything
//   node design/cli/render/build.mjs 06 11      # only matching ids
//   RELIASTRA_DESIGN_TOOLS=/path node …         # where node_modules lives
//
// It also lints: any line wider than its screen's column count is reported,
// because a wrapped line in a mockup is a wrapped line in a terminal.

import fs from 'node:fs';
import path from 'node:path';
import { DESIGN_ROOT, renderPNG, renderSVGFile, composeStack, widthOf, plainOf } from './screen.mjs';
import { SCREENS } from './screens/index.mjs';

const MOCK_DIR = path.join(DESIGN_ROOT, 'mockups');
const JSON_DIR = path.join(DESIGN_ROOT, 'demo', 'screens');
fs.mkdirSync(MOCK_DIR, { recursive: true });
fs.mkdirSync(JSON_DIR, { recursive: true });

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const entries = SCREENS.filter((e) => only.length === 0 || only.some((o) => e.id.includes(o)));

let overflow = 0;
for (const entry of entries) {
  const items = entry.screens();

  for (const item of items) {
    for (const line of item.screen.lines) {
      const w = widthOf(line);
      if (w > item.screen.cols) {
        overflow += 1;
        console.warn(`  ! ${entry.id}: line is ${w} cols, screen is ${item.screen.cols}: ${plainOf(line).slice(0, 90)}`);
      }
    }
  }

  const pngPath = path.join(MOCK_DIR, `${entry.id}.png`);
  let info;
  if (entry.compose) {
    const svg = composeStack(items, { gap: 34 });
    info = renderSVGFile(svg, pngPath, { scale: 2 });
  } else {
    info = renderPNG(items[0].screen, pngPath, { scale: 2 });
  }

  items.forEach((item, i) => {
    const name = items.length > 1 ? `${entry.id}-${i + 1}-${['full', 'plain', 'json'][i] || i}` : entry.id;
    fs.writeFileSync(path.join(JSON_DIR, `${name}.json`), JSON.stringify(item.screen.toRuns(), null, 1));
  });

  const rows = items[0].screen.lines.length;
  console.log(
    `  ${entry.id.padEnd(24)} ${String(items[0].screen.cols).padStart(3)} cols  ${String(rows).padStart(3)} rows  ${String(info.width).padStart(4)}×${String(info.height).padStart(4)}px  ${(info.bytes / 1024).toFixed(0)} KB`
  );
}

console.log(overflow === 0 ? '  no line overflows its column budget' : `  ${overflow} overflow(s) — fix before shipping`);
