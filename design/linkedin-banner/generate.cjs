#!/usr/bin/env node
/*
 * LinkedIn banner generator — AI Infrastructure Security Engineer
 * Canvas: 1584 x 396 (LinkedIn personal-profile banner, 4:1)
 * Renders via @resvg/resvg-js with embedded Inter + JetBrains Mono TTFs.
 *
 * Outputs:
 *   banner-1584x396.png          (1x, LinkedIn upload)
 *   banner-2x-3168x792.png       (2x, retina master)
 *   preview-linkedin-overlay.png (safe-area check with simulated avatar)
 */
const fs = require('fs');
const path = require('path');

const TOOLS = "/home/user/.cache/tools";
const { Resvg } = require(path.join(TOOLS, 'node_modules/@resvg/resvg-js'));
const OUT = '/home/user/Reliastra/design/linkedin-banner';

const INTER = path.join(TOOLS, 'node_modules/@expo-google-fonts/inter');
const JBM = path.join(TOOLS, 'node_modules/@expo-google-fonts/jetbrains-mono');
const fontFiles = [
  '400Regular/Inter_400Regular.ttf', '500Medium/Inter_500Medium.ttf',
  '600SemiBold/Inter_600SemiBold.ttf', '700Bold/Inter_700Bold.ttf',
  '800ExtraBold/Inter_800ExtraBold.ttf', '900Black/Inter_900Black.ttf',
].map(f => path.join(INTER, f)).concat([
  '400Regular/JetBrainsMono_400Regular.ttf', '500Medium/JetBrainsMono_500Medium.ttf',
  '600SemiBold/JetBrainsMono_600SemiBold.ttf', '700Bold/JetBrainsMono_700Bold.ttf',
].map(f => path.join(JBM, f)));

/* ---------------------------------------------------------------- palette */
const C = {
  bgTop: '#0C0F14', bgMid: '#0E131A', bgBot: '#0A0D12',
  ink: '#E9EEF5', ink2: '#93A7BD', ink3: '#5A6B80', ink4: '#46586E',
  steel: '#7E93AB', steelDim: '#5E748E',
  hair: 'rgba(148,166,188,0.13)',
  panelStroke: 'rgba(147,167,191,0.17)',
  cardStroke: 'rgba(148,180,215,0.11)',
  cyan: '#56C8F0', cyanSoft: '#6FD4F2', blue: '#4C8DE8', green: '#3ECF8E',
  flow: '#4E76A4', bus: '#4A7FAE', boundary: '#3D5F8C',
  meta: '#4E6076', metaDim: '#44546A',
};

const W = 1584, H = 396;
const P = []; // svg parts

function txt(x, y, s, o = {}) {
  const { s: size = 10, w = 400, f = 'Inter', fill = '#fff', ls = 0, a = 'start', op = 1, extra = '' } = o;
  let xx = x;
  if (a === 'middle') xx = x - ls / 2; // resvg adds trailing tracking; re-center
  return `<text x="${xx}" y="${y}" font-family="${f}" font-size="${size}" font-weight="${w}" fill="${fill}" letter-spacing="${ls}" text-anchor="${a}" opacity="${op}" ${extra}>${s}</text>`;
}
function line(x1, y1, x2, y2, stroke, sw = 1, o = {}) {
  const { op = 1, dash, cap = 'butt' } = o;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" ${dash ? `stroke-dasharray="${dash}" ` : ''}stroke-linecap="${cap}" opacity="${op}"/>`;
}
function rect(x, y, w, h, o = {}) {
  const { rx = 0, fill = 'none', stroke, sw = 1, op = 1, dash, extra = '' } = o;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="${sw}"` : ''} ${dash ? `stroke-dasharray="${dash}" ` : ''}opacity="${op}" ${extra}/>`;
}
function circle(cx, cy, r, o = {}) {
  const { fill = 'none', stroke, sw = 1, op = 1 } = o;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="${sw}"` : ''} opacity="${op}"/>`;
}
function poly(pts, o = {}) {
  const { stroke = '#fff', sw = 1, op = 1, fill = 'none' } = o;
  return `<polyline points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${op}" stroke-linejoin="round" stroke-linecap="round"/>`;
}
function haloText(x, y, s, o = {}) {
  const base = { f: 'JetBrains Mono', s: 6.5, w: 500, fill: '#6C8399', ls: 1, a: 'middle', ...o };
  return txt(x, y, s, { ...base, fill: '#0B0E12', extra: 'stroke="#0B0E12" stroke-width="3.5"' }) +
         txt(x, y, s, base);
}

/* ------------------------------------------------------------------ defs */
P.push(`<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${C.bgTop}"/><stop offset="0.55" stop-color="${C.bgMid}"/><stop offset="1" stop-color="${C.bgBot}"/>
  </linearGradient>
  <radialGradient id="glowCyan"><stop offset="0" stop-color="#67E8F9" stop-opacity="0.13"/><stop offset="1" stop-color="#67E8F9" stop-opacity="0"/></radialGradient>
  <radialGradient id="glowBlue"><stop offset="0" stop-color="#4C8DE8" stop-opacity="0.10"/><stop offset="1" stop-color="#4C8DE8" stop-opacity="0"/></radialGradient>
  <linearGradient id="silverT" x1="0" y1="128" x2="0" y2="164" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#F4F8FC"/><stop offset="1" stop-color="#BCC9D9"/>
  </linearGradient>
  <linearGradient id="cyanT" x1="0" y1="206" x2="0" y2="258" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#C4EEFF"/><stop offset="0.55" stop-color="#7CC9F2"/><stop offset="1" stop-color="#4A90DC"/>
  </linearGradient>
  <linearGradient id="panelG" x1="0" y1="150" x2="0" y2="286" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.05"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0.012"/>
  </linearGradient>
  <linearGradient id="cardG" x1="0" y1="88" x2="0" y2="350" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#94B4D7" stop-opacity="0.05"/><stop offset="1" stop-color="#94B4D7" stop-opacity="0.015"/>
  </linearGradient>
  <linearGradient id="gpuCore" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#9FE4FA"/><stop offset="1" stop-color="#3D9BE0"/>
  </linearGradient>
  <linearGradient id="fadeV" x1="0" y1="112" x2="0" y2="300" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#94A6BC" stop-opacity="0"/><stop offset="0.5" stop-color="#94A6BC" stop-opacity="0.32"/><stop offset="1" stop-color="#94A6BC" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="ruleFade" x1="96" y1="0" x2="196" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#56C8F0" stop-opacity="0.85"/><stop offset="1" stop-color="#56C8F0" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="vign" cx="0.5" cy="0.47" r="0.72">
    <stop offset="0" stop-color="#04060A" stop-opacity="0"/><stop offset="0.72" stop-color="#04060A" stop-opacity="0"/><stop offset="1" stop-color="#04060A" stop-opacity="0.42"/>
  </radialGradient>
  <filter id="softGlow" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="6"/>
  </filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
    <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.5 0.5 0.5 0 0"/>
  </filter>
</defs>`);

/* ------------------------------------------------------------- background */
P.push(rect(0, 0, W, H, { fill: 'url(#bg)' }));

// fine engineering grid
const grid = [];
for (let x = 28; x < W; x += 28) {
  const major = x % 140 === 0;
  grid.push(line(x, 0, x, H, `rgba(151,168,190,${major ? 0.055 : 0.032})`, 1));
}
for (let y = 28; y < H; y += 28) {
  const major = y % 140 === 0;
  grid.push(line(0, y, W, y, `rgba(151,168,190,${major ? 0.055 : 0.032})`, 1));
}
P.push(`<g>${grid.join('')}</g>`);

// ambient glows + orbit arcs (depth layer)
P.push(`<ellipse cx="286" cy="228" rx="230" ry="80" fill="url(#glowBlue)"/>`);
P.push(`<ellipse cx="1080" cy="222" rx="440" ry="132" fill="url(#glowBlue)" opacity="0.42"/>`);
P.push(`<ellipse cx="1228" cy="196" rx="120" ry="86" fill="url(#glowCyan)"/>`);
P.push(`<ellipse cx="1340" cy="140" rx="70" ry="34" fill="url(#glowCyan)" opacity="0.5"/>`);
P.push(circle(1656, 210, 252, { stroke: '#67E8F9', sw: 1, op: 0.05 }));
P.push(circle(1656, 210, 332, { stroke: '#67E8F9', sw: 1, op: 0.035 }));

/* ----------------------------------------------------------- top meta row */
P.push(txt(96, 47, 'AI-SEC / REF-ARCH · REV 2026.09', { f: 'JetBrains Mono', s: 8, w: 500, fill: C.metaDim, ls: 1.5 }));

// region chips (top right)
const chips = [
  { t: 'US-EAST-1', w: 61 }, { t: 'EU-WEST-1', w: 61 }, { t: 'AP-SOUTH-1', w: 66 },
];
let chipX = 1488 - chips.reduce((a, c) => a + c.w, 0) - 16;
for (const ch of chips) {
  P.push(rect(chipX, 37, ch.w, 14, { rx: 7, fill: 'rgba(148,180,215,0.055)', stroke: 'rgba(148,180,215,0.22)', sw: 1 }));
  P.push(circle(chipX + 8, 44, 1.7, { fill: C.green }));
  P.push(txt(chipX + 14, 47, ch.t, { f: 'JetBrains Mono', s: 7, w: 500, fill: '#7E93AB', ls: 0.5 }));
  chipX += ch.w + 8;
}
P.push(line(96, 58, 1488, 58, 'rgba(148,166,188,0.09)', 1));

/* --------------------------------------------------- left: primary block */
const LX = 96;
P.push(txt(LX, 112, 'MISSION-CRITICAL PLATFORMS · ZERO TRUST', { f: 'JetBrains Mono', s: 9.5, w: 500, fill: '#58A0D0', ls: 3 }));
P.push(txt(LX, 162, 'AI INFRASTRUCTURE', { s: 34, w: 700, fill: 'url(#silverT)', ls: 2 }));
// secondary statement, bullets accented
P.push(`<text x="${LX}" y="192" font-family="Inter" font-size="11.5" font-weight="600" letter-spacing="3.5" fill="#93A7BD">CLOUD <tspan fill="${C.cyan}">•</tspan> KUBERNETES <tspan fill="${C.cyan}">•</tspan> AI SYSTEMS</text>`);
// SECURITY with restrained glow
P.push(`<text x="${LX}" y="256" font-family="Inter" font-size="64" font-weight="800" letter-spacing="5" fill="#2FA8E0" opacity="0.30" filter="url(#softGlow)">SECURITY</text>`);
P.push(txt(LX, 256, 'SECURITY', { s: 64, w: 800, fill: 'url(#cyanT)', ls: 5 }));
P.push(line(LX, 274, 196, 274, 'url(#ruleFade)', 2, { cap: 'round' }));

// divider between text zone and diagram zone
P.push(line(576, 112, 576, 300, 'url(#fadeV)', 1));

/* ------------------------------------------------- diagram card (system) */
const CARD = { x: 602, y: 88, w: 912, h: 262 };
P.push(rect(CARD.x, CARD.y, CARD.w, CARD.h, { rx: 12, fill: 'url(#cardG)', stroke: C.cardStroke, sw: 1 }));
P.push(line(CARD.x + 14, CARD.y + 1.5, CARD.x + CARD.w - 14, CARD.y + 1.5, 'rgba(255,255,255,0.07)', 1));
P.push(txt(CARD.x + 20, 110, 'PROD · PLATFORM TOPOLOGY', { f: 'JetBrains Mono', s: 8, w: 500, fill: '#5A6E86', ls: 2 }));
P.push(txt(CARD.x + CARD.w - 20, 110, 'MULTI-REGION · AUTOSCALED · SLO 99.99%', { f: 'JetBrains Mono', s: 8, w: 500, fill: '#5A6E86', ls: 1.5, a: 'end' }));
P.push(line(CARD.x + 20, 120, CARD.x + CARD.w - 20, 120, 'rgba(148,166,188,0.07)', 1));

/* ------------------------------------------------------- stage geometry */
const X0 = 620, PW = 96, PITCH = 112, PY = 150, PH = 136;
const cx = i => X0 + PW / 2 + i * PITCH;
const px0 = i => X0 + i * PITCH, px1 = i => X0 + i * PITCH + PW;
const FLOW_Y = 216;

// telemetry bus (above panels)
const BUS_Y = 138;
P.push(line(640, BUS_Y, cx(6), BUS_Y, C.bus, 1, { op: 0.55, dash: '4 3' }));
P.push(line(640, BUS_Y - 4, 640, BUS_Y + 4, C.bus, 1, { op: 0.55 }));
for (let i = 0; i < 6; i++) {
  P.push(line(cx(i), BUS_Y, cx(i), PY, C.bus, 1, { op: 0.32 }));
  P.push(circle(cx(i), BUS_Y, 1.8, { fill: C.cyan, op: 0.9 }));
}
P.push(poly(`${cx(6)},${BUS_Y - 2.5} ${cx(6)},${PY - 3}`, { stroke: C.bus, sw: 1, op: 0.7 }));
P.push(poly(`${cx(6) - 3.2},${PY - 7.5} ${cx(6)},${PY - 3} ${cx(6) + 3.2},${PY - 7.5}`, { stroke: C.cyanSoft, sw: 1.2, op: 0.9 }));
P.push(txt(648, 131, 'TELEMETRY · OTLP', { f: 'JetBrains Mono', s: 7, w: 500, fill: '#4E7CA6', ls: 1.5 }));

/* ------------------------------------------------------------- panels */
const stages = [
  { n: '01', l1: 'APPLICATIONS', l2: 'CLIENTS · AGENTS', dot: '#5A7188' },
  { n: '02', l1: 'GATEWAY', l2: 'API · INFERENCE', dot: '#5A7188' },
  { n: '03', l1: 'IDENTITY', l2: 'POLICY · MTLS', dot: C.blue },
  { n: '04', l1: 'KUBERNETES', l2: 'PLATFORM · CNI', dot: C.green },
  { n: '05', l1: 'SERVICES', l2: 'CONTAINERS', dot: '#5A7188' },
  { n: '06', l1: 'GPU FABRIC', l2: 'AI INFERENCE', dot: C.cyan, pulse: true },
  { n: '07', l1: 'OBSERVABILITY', l2: 'TELEMETRY', dot: C.green },
  { n: '08', l1: 'SECURITY', l2: 'IMMUTABLE LEDGER', dot: C.cyan },
];

for (let i = 0; i < 8; i++) {
  const st = stages[i], x0 = px0(i), x1 = px1(i), c = cx(i);
  P.push(rect(x0, PY, PW, PH, { rx: 9, fill: 'url(#panelG)', stroke: C.panelStroke, sw: 1 }));
  P.push(line(x0 + 6, PY + 1, x1 - 6, PY + 1, 'rgba(255,255,255,0.08)', 1));
  P.push(txt(x0 + 9, PY + 16, st.n, { f: 'JetBrains Mono', s: 7.5, w: 500, fill: C.ink4, ls: 1 }));
  if (st.pulse) P.push(circle(x1 - 11, PY + 12, 5.5, { stroke: C.cyan, sw: 1, op: 0.3 }));
  P.push(circle(x1 - 11, PY + 12, 2.4, { fill: st.dot }));

  P.push(txt(c, 252, st.l1, { s: 9, w: 600, fill: '#AEBDD0', ls: 1.2, a: 'middle' }));
  P.push(txt(c, 266, st.l2, { f: 'JetBrains Mono', s: 7, w: 400, fill: C.ink3, ls: 0.4, a: 'middle' }));
}

/* --------------------------------------------------------- glyphs layer */
const G = [];
const gs = '#7E93AB', ga = 0.85;
{ // 01 applications — three clients fanning into one path
  const c = cx(0);
  for (const dx of [-22, 0, 22]) G.push(rect(c + dx - 4.5, 181, 9, 9, { rx: 1.5, stroke: gs, sw: 1, op: ga }));
  G.push(line(c - 17.5, 190, c, 208, gs, 0.8, { op: 0.5 }));
  G.push(line(c, 190, c, 208, gs, 0.8, { op: 0.5 }));
  G.push(line(c + 17.5, 190, c, 208, gs, 0.8, { op: 0.5 }));
  G.push(line(c, 208, c, 215, C.cyanSoft, 1, { op: 0.8 }));
}
{ // 02 gateway — edge node with sidecars
  const c = cx(1);
  G.push(rect(c - 32, 189, 9, 8, { rx: 1.5, stroke: gs, sw: 1, op: ga }));
  G.push(rect(c + 23, 189, 9, 8, { rx: 1.5, stroke: gs, sw: 1, op: ga }));
  G.push(rect(c - 17, 186, 34, 14, { rx: 2.5, stroke: gs, sw: 1, op: ga }));
  G.push(poly(`${c - 6},190.5 ${c - 2},193 ${c - 6},195.5`, { stroke: C.cyanSoft, sw: 1.1, op: 0.9 }));
  G.push(poly(`${c - 1},190.5 ${c + 3},193 ${c - 1},195.5`, { stroke: C.cyanSoft, sw: 1.1, op: 0.9 }));
  G.push(line(c - 23, 193, c - 17, 193, gs, 0.8, { op: 0.5 }));
  G.push(line(c + 17, 193, c + 23, 193, gs, 0.8, { op: 0.5 }));
  G.push(circle(c, 208, 2, { fill: C.blue, op: 0.9 }));
  G.push(line(c, 200, c, 206, gs, 0.8, { op: 0.5 }));
}
{ // 03 identity + policy — stacked planes with enforcement point
  const c = cx(2);
  G.push(rect(c - 15, 179, 30, 11, { rx: 2, stroke: gs, sw: 1, op: ga }));
  G.push(rect(c - 15, 206, 30, 11, { rx: 2, stroke: gs, sw: 1, op: ga }));
  G.push(line(c, 190, c, 206, gs, 0.8, { op: 0.55 }));
  G.push(circle(c, 198, 2.4, { fill: C.cyan, op: 0.95 }));
}
{ // 04 kubernetes — control-plane mesh, one node accented
  const c = cx(3);
  const cells = [[-15, 180, gs], [2, 180, C.cyanSoft], [-15, 197, gs], [2, 197, gs]];
  for (const [dx, y, col] of cells) G.push(rect(c + dx, y, 13, 13, { rx: 2, stroke: col, sw: 1, op: 0.9 }));
  G.push(line(c - 8.5, 186.5, c + 8.5, 186.5, gs, 0.7, { op: 0.3 }));
  G.push(line(c - 8.5, 203.5, c + 8.5, 203.5, gs, 0.7, { op: 0.3 }));
  G.push(line(c - 8.5, 186.5, c - 8.5, 203.5, gs, 0.7, { op: 0.3 }));
  G.push(line(c + 8.5, 186.5, c + 8.5, 203.5, gs, 0.7, { op: 0.3 }));
}
{ // 05 services — three pods with sidecars
  const c = cx(4);
  for (const dx of [-26, -7.5, 11]) {
    G.push(rect(c + dx, 182, 15, 10, { rx: 2, stroke: gs, sw: 1, op: ga }));
    G.push(line(c + dx + 7.5, 192, c + dx + 7.5, 202, gs, 0.8, { op: 0.45 }));
    G.push(circle(c + dx + 7.5, 204.5, 1.8, { fill: C.blue, op: 0.85 }));
  }
  G.push(line(c - 11, 187, c - 7.5, 187, gs, 0.7, { op: 0.4 }));
  G.push(line(c + 8, 187, c + 11, 187, gs, 0.7, { op: 0.4 }));
}
{ // 06 gpu — accelerator chip, hottest point of the composition
  const c = cx(5);
  for (const t of [-10, 0, 10]) {
    G.push(line(c + t, 176.5, c + t, 180, gs, 1, { op: 0.6 }));
    G.push(line(c + t, 210, c + t, 213.5, gs, 1, { op: 0.6 }));
  }
  G.push(rect(c - 16, 180, 32, 30, { rx: 3, stroke: gs, sw: 1, op: 0.95 }));
  for (const [dx, dy] of [[-12, 184], [1, 184], [-12, 197], [1, 197]])
    G.push(rect(c + dx, dy, 11, 11, { rx: 1.5, fill: 'url(#gpuCore)', op: 0.92 }));
}
{ // 07 observability — trace + metrics
  const c = cx(6);
  G.push(line(c - 22, 208, c + 18, 208, gs, 0.8, { op: 0.25 }));
  G.push(poly(`${c - 22},203 ${c - 15},196 ${c - 9},200 ${c - 2},189 ${c + 4},193 ${c + 11},182 ${c + 18},185`, { stroke: C.cyan, sw: 1.3, op: 0.9 }));
  G.push(rect(c - 12, 216, 4, 6, { fill: C.blue, op: 0.7 }));
  G.push(rect(c - 4, 212, 4, 10, { fill: C.blue, op: 0.8 }));
  G.push(rect(c + 4, 208, 4, 14, { fill: C.cyan, op: 0.85 }));
}
{ // 08 security — evidence ledger with attestation
  const c = cx(7);
  G.push(rect(c - 16, 181, 32, 26, { rx: 2.5, stroke: gs, sw: 1, op: 0.95 }));
  G.push(line(c - 10, 188.5, c + 10, 188.5, gs, 0.8, { op: 0.4 }));
  G.push(line(c - 10, 194, c - 1, 194, gs, 0.8, { op: 0.4 }));
  G.push(line(c - 10, 199.5, c - 4, 199.5, gs, 0.8, { op: 0.4 }));
  G.push(poly(`${c + 0},196 ${c + 4},200 ${c + 11},188`, { stroke: C.cyanSoft, sw: 1.4, op: 0.95 }));
}
P.push(`<g>${G.join('')}</g>`);

/* ------------------------------------------------------ flow connectors */
for (let i = 0; i < 7; i++) {
  const xa = px1(i), xb = px0(i + 1);
  P.push(line(xa + 1, FLOW_Y, xb - 6, FLOW_Y, C.flow, 1, { op: 0.9 }));
  P.push(poly(`${xb - 10.5},${FLOW_Y - 3.5} ${xb - 6},${FLOW_Y} ${xb - 10.5},${FLOW_Y + 3.5}`, { stroke: C.cyanSoft, sw: 1.3, op: 0.95 }));
}
// annotated dependency relationships
P.push(haloText((px1(4) + px0(5)) / 2, 234, 'DEPENDENCIES'));
P.push(haloText((px1(6) + px0(7)) / 2, 234, 'EVIDENCE'));

/* --------------------------------------------------- security boundary */
const B_Y = 318;
P.push(line(844, B_Y, 1404, B_Y, C.boundary, 1, { op: 0.85 }));
P.push(line(844, B_Y - 4, 844, B_Y + 4, C.boundary, 1, { op: 0.85 }));
for (let i = 2; i <= 6; i++) P.push(line(cx(i), PH + PY, cx(i), B_Y, C.boundary, 1, { op: 0.32 }));
P.push(poly(`1404,${B_Y} 1452,${B_Y} 1452,${PH + PY + 5}`, { stroke: C.boundary, sw: 1, op: 0.85 }));
P.push(poly(`${1448.5},${PH + PY + 10} 1452,${PH + PY + 5} 1455.5,${PH + PY + 10}`, { stroke: C.cyanSoft, sw: 1.2, op: 0.9 }));
P.push(txt(1124, 332, 'ZERO-TRUST BOUNDARY · POLICY-AS-CODE', { f: 'JetBrains Mono', s: 7, w: 500, fill: '#54708F', ls: 1.2, a: 'middle' }));

/* ------------------------------------------------------ metrics readout */
const metrics = [
  { x: 624, dot: C.cyan, t: 'GATEWAY 4.2M RPM · P99 12MS' },
  { x: 812, dot: C.blue, t: 'KUBERNETES 1,248 PODS' },
  { x: 986, dot: C.green, t: 'GPU P99 38MS · σ 0.4' },
  { x: 1140, dot: '#8CA3BC', t: 'EVIDENCE 9F3A··C21 · CHAINED' },
  { x: 1494 - 21 * 4.9, dot: C.green, t: 'UPTIME 214D · MTTR 4M' },
];
for (const m of metrics) {
  P.push(circle(m.x + 2, 365.5, 2, { fill: m.dot }));
  P.push(txt(m.x + 10, 368.5, m.t, { f: 'JetBrains Mono', s: 7.5, w: 400, fill: '#566B84', ls: 0.8 }));
}

/* ------------------------------------------------- frame, ticks, details */
P.push(rect(20.5, 20.5, W - 41, H - 41, { stroke: 'rgba(148,166,188,0.09)', sw: 1 }));
const ticks = [
  'M20,34 V20 H34', `M${W - 34},20 H${W - 20} V34`,
  `M20,${H - 34} V${H - 20} H34`, `M${W - 34},${H - 20} H${W - 20} V${H - 34}`,
];
P.push(`<path d="${ticks.join(' ')}" fill="none" stroke="${C.steelDim}" stroke-width="1" opacity="0.55"/>`);
for (const [px, py] of [[508, 62], [1148, 62], [1536, 256], [420, 352], [598, 204]])
  P.push(`<path d="M${px - 4},${py} H${px + 4} M${px},${py - 4} V${py + 4}" stroke="${C.steelDim}" stroke-width="1" opacity="0.3"/>`);

/* --------------------------------------------------- vignette + grain */
P.push(rect(0, 0, W, H, { fill: 'url(#vign)' }));
P.push(rect(0, 0, W, H, { fill: '#000', filter: 'url(#grain)', op: 0.07 }));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${P.join('')}</svg>`;

/* ----------------------------------------------------------- safe-area */
const safeOverlay = `
<g>
  <circle cx="124" cy="384" r="76" fill="#1B2634" opacity="0.92"/>
  <circle cx="124" cy="384" r="76" fill="none" stroke="#DDE5EE" stroke-width="2.5" opacity="0.85"/>
  <text x="124" y="392" font-family="Inter" font-size="26" font-weight="600" fill="#8FA3B8" text-anchor="middle" opacity="0.7">PHOTO</text>
  <circle cx="124" cy="326" r="76" fill="none" stroke="#E06C5A" stroke-width="1" stroke-dasharray="5 4" opacity="0.55"/>
</g>`;

/* ------------------------------------------------------------ render */
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'banner.svg'), svg);
fs.writeFileSync(path.join(OUT, 'banner-safe-overlay.svg'), svg.replace('</svg>', safeOverlay + '</svg>'));

function render(svgStr, file, width) {
  const r = new Resvg(svgStr, {
    fitTo: { mode: 'width', value: width },
    font: { fontFiles, defaultFontFamily: 'Inter', loadSystemFonts: false },
  });
  fs.writeFileSync(path.join(OUT, file), r.render().asPng());
  console.log('wrote', file);
}
render(svg, 'banner-1584x396.png', 1584);
render(svg, 'banner-2x-3168x792.png', 3168);
render(svg.replace('</svg>', safeOverlay + '</svg>'), 'preview-linkedin-overlay.png', 1584);
console.log('done');
