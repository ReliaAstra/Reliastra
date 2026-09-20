#!/usr/bin/env node
/*
 * LinkedIn banner generator — AI Infrastructure Security Engineer
 * Canvas: 1584 x 396 (LinkedIn personal-profile banner, 4:1)
 * Renders via @resvg/resvg-js with embedded Manrope + IBM Plex Mono TTFs.
 *
 * Themes: THEME=light (default, airy/relaxing) | THEME=dark (graphite)
 *
 * Outputs (light):  banner-1584x396.png, banner-2x-3168x792.png,
 *                   preview-linkedin-overlay.png, banner.svg
 * Outputs (dark):   same names with -dark suffix.
 *                   plus preview-linkedin-overlay(-dark).png safe-area proof.
 */
const fs = require('fs');
const path = require('path');

const TOOLS = "/home/user/.cache/tools";
const { Resvg } = require(path.join(TOOLS, 'node_modules/@resvg/resvg-js'));
const OUT = '/home/user/Reliastra/design/linkedin-banner';
const THEME_NAME = process.env.THEME || 'light';

const INTER = path.join(TOOLS, 'node_modules/@expo-google-fonts/inter');
const JBM = path.join(TOOLS, 'node_modules/@expo-google-fonts/jetbrains-mono');
const MAN = path.join(TOOLS, 'node_modules/@expo-google-fonts/manrope');
const PLEX = path.join(TOOLS, 'node_modules/@expo-google-fonts/ibm-plex-mono');
const fontFiles = [
  '500Medium/Manrope_500Medium.ttf', '600SemiBold/Manrope_600SemiBold.ttf',
  '700Bold/Manrope_700Bold.ttf', '800ExtraBold/Manrope_800ExtraBold.ttf',
].map(f => path.join(MAN, f)).concat([
  '400Regular/IBMPlexMono_400Regular.ttf', '500Medium/IBMPlexMono_500Medium.ttf',
  '600SemiBold/IBMPlexMono_600SemiBold.ttf',
].map(f => path.join(PLEX, f)));

const F_DISP = 'Manrope';
const F_MONO = 'IBM Plex Mono';

/* ---------------------------------------------------------------- palettes */
const THEMES = {
  light: {
    bgTop: '#EDF6FC', bgMid: '#DCEBF8', bgBot: '#C7DFF3',
    eyebrow: '#2E6FA9', subText: '#48607C', bullet: '#1B8FBE',
    slateT1: '#22384F', slateT2: '#46617E',
    secT1: '#7EC5EC', secT2: '#1C6FAE', secGlow: '#BFE3F7', secGlowOp: 0.5,
    glowCyan: '#FFFFFF', glowCyanOp: 0.55, glowBlue: '#AFD5F2', glowBlueOp: 0.55,
    bigGlowOp: 0.5,
    gridMinor: 'rgba(60,100,145,0.055)', gridMajor: 'rgba(60,100,145,0.09)',
    hairline: 'rgba(55,95,140,0.14)',
    arcStroke: '#5E86AC', arcOp: 0.18,
    panelStroke: 'rgba(55,95,140,0.20)', cardStroke: 'rgba(45,85,130,0.16)',
    panelSheen: 'rgba(255,255,255,0.9)',
    panel1: 0.75, panel2: 0.42, card1: 0.88, card2: 0.62,
    shadow: true,
    gpu1: '#9FD3F0', gpu2: '#4E9BD4', glyphStroke: '#4E6A88',
    flow: '#6E93B8', bus: '#5E96C4', busOp: 0.65, tapOp: 0.4,
    boundary: '#6C93BC', boundaryOp: 0.85, dropOp: 0.35, boundaryLabel: '#4E6E96',
    fadeCol: '#7A93AE',
    ruleCol: '#1B8FBE',
    cyan: '#1B9DCB', cyanSoft: '#3FB2DE', blue: '#3273C0', green: '#2FA67A',
    dotGray: '#8AA0B6',
    meta: '#93A8BE', metaDim: '#9DB2C6', cardHead: '#7E94AA',
    numFill: '#9CACBE', labelFill: '#2C3E54', subFill: '#6C8098',
    metricText: '#5E7A98',
    chipFill: 'rgba(255,255,255,0.78)', chipStroke: 'rgba(50,90,130,0.26)', chipText: '#4A688C',
    haloFill: '#3E6288', haloStroke: '#E9F2FA',
    vignCol: '#2C4A6E', vignOp: 0.08,
    grainConst: 0, grainOp: 0.035,
    frame: 'rgba(55,95,140,0.16)', tick: '#7E9AB8',
    photoFill: '#28455F', photoStroke: '#FFFFFF', photoText: '#C2D4E4', danger: '#C05A44',
  },
  dark: {
    bgTop: '#0C0F14', bgMid: '#0E131A', bgBot: '#0A0D12',
    eyebrow: '#58A0D0', subText: '#93A7BD', bullet: '#56C8F0',
    slateT1: '#F4F8FC', slateT2: '#BCC9D9',
    secT1: '#C4EEFF', secT2: '#4A90DC', secGlow: '#2FA8E0', secGlowOp: 0.30,
    glowCyan: '#67E8F9', glowCyanOp: 0.13, glowBlue: '#4C8DE8', glowBlueOp: 0.10,
    bigGlowOp: 0.42,
    gridMinor: 'rgba(151,168,190,0.032)', gridMajor: 'rgba(151,168,190,0.055)',
    hairline: 'rgba(148,166,188,0.09)',
    arcStroke: '#67E8F9', arcOp: 0.05,
    panelStroke: 'rgba(147,167,191,0.17)', cardStroke: 'rgba(148,180,215,0.11)',
    panelSheen: 'rgba(255,255,255,0.08)',
    panel1: 0.05, panel2: 0.012, card1: 0.05, card2: 0.015,
    shadow: false,
    gpu1: '#9FE4FA', gpu2: '#3D9BE0', glyphStroke: '#7E93AB',
    flow: '#4E76A4', bus: '#4A7FAE', busOp: 0.55, tapOp: 0.32,
    boundary: '#3D5F8C', boundaryOp: 0.85, dropOp: 0.32, boundaryLabel: '#54708F',
    fadeCol: '#94A6BC',
    ruleCol: '#56C8F0',
    cyan: '#56C8F0', cyanSoft: '#6FD4F2', blue: '#4C8DE8', green: '#3ECF8E',
    dotGray: '#5A7188',
    meta: '#4E6076', metaDim: '#44546A', cardHead: '#5A6E86',
    numFill: '#46586E', labelFill: '#AEBDD0', subFill: '#5A6B80',
    metricText: '#566B84',
    chipFill: 'rgba(148,180,215,0.055)', chipStroke: 'rgba(148,180,215,0.22)', chipText: '#7E93AB',
    haloFill: '#6C8399', haloStroke: '#0B0E12',
    vignCol: '#04060A', vignOp: 0.42,
    grainConst: 1, grainOp: 0.07,
    frame: 'rgba(148,166,188,0.09)', tick: '#5E748E',
    photoFill: '#1B2634', photoStroke: '#DDE5EE', photoText: '#8FA3B8', danger: '#E06C5A',
  },
};
const T = THEMES[THEME_NAME];

const W = 1584, H = 396;
const P = []; // svg parts

function txt(x, y, s, o = {}) {
  const { s: size = 10, w = 400, f = F_DISP, fill = '#fff', ls = 0, a = 'start', op = 1, extra = '' } = o;
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
  const base = { f: F_MONO, s: 6.5, w: 500, fill: T.haloFill, ls: 1, a: 'middle', ...o };
  return txt(x, y, s, { ...base, fill: T.haloStroke, extra: `stroke="${T.haloStroke}" stroke-width="3.5"` }) +
         txt(x, y, s, base);
}

/* ------------------------------------------------------------------ defs */
P.push(`<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${T.bgTop}"/><stop offset="0.55" stop-color="${T.bgMid}"/><stop offset="1" stop-color="${T.bgBot}"/>
  </linearGradient>
  <radialGradient id="glowCyan"><stop offset="0" stop-color="${T.glowCyan}" stop-opacity="${T.glowCyanOp}"/><stop offset="1" stop-color="${T.glowCyan}" stop-opacity="0"/></radialGradient>
  <radialGradient id="glowBlue"><stop offset="0" stop-color="${T.glowBlue}" stop-opacity="${T.glowBlueOp}"/><stop offset="1" stop-color="${T.glowBlue}" stop-opacity="0"/></radialGradient>
  <linearGradient id="silverT" x1="0" y1="128" x2="0" y2="164" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${T.slateT1}"/><stop offset="1" stop-color="${T.slateT2}"/>
  </linearGradient>
  <linearGradient id="cyanT" x1="0" y1="206" x2="0" y2="258" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${T.secT1}"/><stop offset="0.55" stop-color="${T.secT1}"/><stop offset="1" stop-color="${T.secT2}"/>
  </linearGradient>
  <linearGradient id="panelG" x1="0" y1="150" x2="0" y2="286" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="${T.panel1}"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="${T.panel2}"/>
  </linearGradient>
  <linearGradient id="cardG" x1="0" y1="88" x2="0" y2="350" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="${T.card1}"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="${T.card2}"/>
  </linearGradient>
  <linearGradient id="gpuCore" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${T.gpu1}"/><stop offset="1" stop-color="${T.gpu2}"/>
  </linearGradient>
  <linearGradient id="fadeV" x1="0" y1="112" x2="0" y2="300" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${T.fadeCol}" stop-opacity="0"/><stop offset="0.5" stop-color="${T.fadeCol}" stop-opacity="0.32"/><stop offset="1" stop-color="${T.fadeCol}" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="ruleFade" x1="96" y1="0" x2="196" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${T.ruleCol}" stop-opacity="0.85"/><stop offset="1" stop-color="${T.ruleCol}" stop-opacity="0"/>
  </linearGradient>
  <radialGradient id="vign" cx="0.5" cy="0.47" r="0.72">
    <stop offset="0" stop-color="${T.vignCol}" stop-opacity="0"/><stop offset="0.72" stop-color="${T.vignCol}" stop-opacity="0"/><stop offset="1" stop-color="${T.vignCol}" stop-opacity="${T.vignOp}"/>
  </radialGradient>
  <filter id="softGlow" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="6"/>
  </filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
    <feColorMatrix type="matrix" values="0 0 0 0 ${T.grainConst}  0 0 0 0 ${T.grainConst}  0 0 0 0 ${T.grainConst}  0.5 0.5 0.5 0 0"/>
  </filter>
</defs>`);

/* ------------------------------------------------------------- background */
P.push(rect(0, 0, W, H, { fill: 'url(#bg)' }));

// fine engineering grid
const grid = [];
for (let x = 28; x < W; x += 28) {
  grid.push(line(x, 0, x, H, x % 140 === 0 ? T.gridMajor : T.gridMinor, 1));
}
for (let y = 28; y < H; y += 28) {
  grid.push(line(0, y, W, y, y % 140 === 0 ? T.gridMajor : T.gridMinor, 1));
}
P.push(`<g>${grid.join('')}</g>`);

// ambient glows + orbit arcs (depth layer)
P.push(`<ellipse cx="286" cy="228" rx="230" ry="80" fill="url(#glowBlue)"/>`);
P.push(`<ellipse cx="1080" cy="222" rx="440" ry="132" fill="url(#glowBlue)" opacity="${T.bigGlowOp}"/>`);
P.push(`<ellipse cx="1228" cy="196" rx="120" ry="86" fill="url(#glowCyan)"/>`);
P.push(`<ellipse cx="1340" cy="140" rx="70" ry="34" fill="url(#glowCyan)" opacity="0.5"/>`);
P.push(circle(1656, 210, 252, { stroke: T.arcStroke, sw: 1, op: T.arcOp }));
P.push(circle(1656, 210, 332, { stroke: T.arcStroke, sw: 1, op: T.arcOp * 0.7 }));

/* ----------------------------------------------------------- top meta row */
P.push(txt(96, 47, 'AI-SEC / REF-ARCH · REV 2026.09', { f: F_MONO, s: 8, w: 500, fill: T.metaDim, ls: 1.5 }));

// region chips (top right)
const chips = [
  { t: 'US-EAST-1', w: 61 }, { t: 'EU-WEST-1', w: 61 }, { t: 'AP-SOUTH-1', w: 66 },
];
let chipX = 1488 - chips.reduce((a, c) => a + c.w, 0) - 16;
for (const ch of chips) {
  P.push(rect(chipX, 37, ch.w, 14, { rx: 7, fill: T.chipFill, stroke: T.chipStroke, sw: 1 }));
  P.push(circle(chipX + 8, 44, 1.7, { fill: T.green }));
  P.push(txt(chipX + 14, 47, ch.t, { f: F_MONO, s: 7, w: 500, fill: T.chipText, ls: 0.5 }));
  chipX += ch.w + 8;
}
P.push(line(96, 58, 1488, 58, T.hairline, 1));

/* --------------------------------------------------- left: primary block */
const LX = 96;
P.push(txt(LX, 112, 'MISSION-CRITICAL PLATFORMS · ZERO TRUST', { f: F_MONO, s: 9.5, w: 500, fill: T.eyebrow, ls: 3 }));
P.push(txt(LX, 162, 'AI INFRASTRUCTURE', { s: 34, w: 800, fill: 'url(#silverT)', ls: 2 }));
// secondary statement, bullets accented
P.push(`<text x="${LX}" y="192" font-family="${F_DISP}" font-size="11.5" font-weight="700" letter-spacing="3.5" fill="${T.subText}">CLOUD <tspan fill="${T.bullet}">•</tspan> KUBERNETES <tspan fill="${T.bullet}">•</tspan> AI SYSTEMS</text>`);
// SECURITY with restrained glow
P.push(`<text x="${LX}" y="256" font-family="${F_DISP}" font-size="64" font-weight="800" letter-spacing="5" fill="${T.secGlow}" opacity="${T.secGlowOp}" filter="url(#softGlow)">SECURITY</text>`);
P.push(txt(LX, 256, 'SECURITY', { s: 64, w: 800, fill: 'url(#cyanT)', ls: 5 }));
P.push(line(LX, 274, 196, 274, 'url(#ruleFade)', 2, { cap: 'round' }));

// divider between text zone and diagram zone
P.push(line(576, 112, 576, 300, 'url(#fadeV)', 1));

/* ------------------------------------------------- diagram card (system) */
const CARD = { x: 602, y: 88, w: 912, h: 262 };
if (T.shadow) P.push(rect(CARD.x + 3, CARD.y + 12, CARD.w, CARD.h, { rx: 14, fill: '#35597E', op: 0.18, extra: 'filter="url(#softGlow)"' }));
P.push(rect(CARD.x, CARD.y, CARD.w, CARD.h, { rx: 12, fill: 'url(#cardG)', stroke: T.cardStroke, sw: 1 }));
P.push(line(CARD.x + 14, CARD.y + 1.5, CARD.x + CARD.w - 14, CARD.y + 1.5, T.panelSheen, 1));
P.push(txt(CARD.x + 20, 110, 'PROD · PLATFORM TOPOLOGY', { f: F_MONO, s: 8, w: 500, fill: T.cardHead, ls: 2 }));
P.push(txt(CARD.x + CARD.w - 20, 110, 'MULTI-REGION · AUTOSCALED · SLO 99.99%', { f: F_MONO, s: 8, w: 500, fill: T.cardHead, ls: 1.5, a: 'end' }));
P.push(line(CARD.x + 20, 120, CARD.x + CARD.w - 20, 120, T.hairline, 1));

/* ------------------------------------------------------- stage geometry */
const X0 = 620, PW = 96, PITCH = 112, PY = 150, PH = 136;
const cx = i => X0 + PW / 2 + i * PITCH;
const px0 = i => X0 + i * PITCH, px1 = i => X0 + i * PITCH + PW;
const FLOW_Y = 216;

// telemetry bus (above panels)
const BUS_Y = 138;
P.push(line(640, BUS_Y, cx(6), BUS_Y, T.bus, 1, { op: T.busOp, dash: '4 3' }));
P.push(line(640, BUS_Y - 4, 640, BUS_Y + 4, T.bus, 1, { op: T.busOp }));
for (let i = 0; i < 6; i++) {
  P.push(line(cx(i), BUS_Y, cx(i), PY, T.bus, 1, { op: T.tapOp }));
  P.push(circle(cx(i), BUS_Y, 1.8, { fill: T.cyan, op: 0.9 }));
}
P.push(poly(`${cx(6)},${BUS_Y - 2.5} ${cx(6)},${PY - 3}`, { stroke: T.bus, sw: 1, op: 0.7 }));
P.push(poly(`${cx(6) - 3.2},${PY - 7.5} ${cx(6)},${PY - 3} ${cx(6) + 3.2},${PY - 7.5}`, { stroke: T.cyanSoft, sw: 1.2, op: 0.9 }));
P.push(txt(648, 131, 'TELEMETRY · OTLP', { f: F_MONO, s: 7, w: 500, fill: T.bus, ls: 1.5 }));

/* ------------------------------------------------------------- panels */
const stages = [
  { n: '01', l1: 'APPLICATIONS', l2: 'CLIENTS · AGENTS', dot: T.dotGray },
  { n: '02', l1: 'GATEWAY', l2: 'API · INFERENCE', dot: T.dotGray },
  { n: '03', l1: 'IDENTITY', l2: 'POLICY · MTLS', dot: T.blue },
  { n: '04', l1: 'KUBERNETES', l2: 'PLATFORM · CNI', dot: T.green },
  { n: '05', l1: 'SERVICES', l2: 'CONTAINERS', dot: T.dotGray },
  { n: '06', l1: 'GPU FABRIC', l2: 'AI INFERENCE', dot: T.cyan, pulse: true },
  { n: '07', l1: 'OBSERVABILITY', l2: 'TELEMETRY', dot: T.green },
  { n: '08', l1: 'SECURITY', l2: 'IMMUTABLE LEDGER', dot: T.cyan },
];

for (let i = 0; i < 8; i++) {
  const st = stages[i], x0 = px0(i), x1 = px1(i), c = cx(i);
  P.push(rect(x0, PY, PW, PH, { rx: 9, fill: 'url(#panelG)', stroke: T.panelStroke, sw: 1 }));
  P.push(line(x0 + 6, PY + 1, x1 - 6, PY + 1, T.panelSheen, 1));
  P.push(txt(x0 + 9, PY + 16, st.n, { f: F_MONO, s: 7.5, w: 500, fill: T.numFill, ls: 1 }));
  if (st.pulse) P.push(circle(x1 - 11, PY + 12, 5.5, { stroke: T.cyan, sw: 1, op: 0.3 }));
  P.push(circle(x1 - 11, PY + 12, 2.4, { fill: st.dot }));

  P.push(txt(c, 252, st.l1, { s: 9, w: 700, fill: T.labelFill, ls: 1.2, a: 'middle' }));
  P.push(txt(c, 266, st.l2, { f: F_MONO, s: 7, w: 400, fill: T.subFill, ls: 0.4, a: 'middle' }));
}

/* --------------------------------------------------------- glyphs layer */
const G = [];
const gs = T.glyphStroke, ga = 0.85;
{ // 01 applications — three clients fanning into one path
  const c = cx(0);
  for (const dx of [-22, 0, 22]) G.push(rect(c + dx - 4.5, 181, 9, 9, { rx: 1.5, stroke: gs, sw: 1, op: ga }));
  G.push(line(c - 17.5, 190, c, 208, gs, 0.8, { op: 0.5 }));
  G.push(line(c, 190, c, 208, gs, 0.8, { op: 0.5 }));
  G.push(line(c + 17.5, 190, c, 208, gs, 0.8, { op: 0.5 }));
  G.push(line(c, 208, c, 215, T.cyanSoft, 1, { op: 0.8 }));
}
{ // 02 gateway — edge node with sidecars
  const c = cx(1);
  G.push(rect(c - 32, 189, 9, 8, { rx: 1.5, stroke: gs, sw: 1, op: ga }));
  G.push(rect(c + 23, 189, 9, 8, { rx: 1.5, stroke: gs, sw: 1, op: ga }));
  G.push(rect(c - 17, 186, 34, 14, { rx: 2.5, stroke: gs, sw: 1, op: ga }));
  G.push(poly(`${c - 6},190.5 ${c - 2},193 ${c - 6},195.5`, { stroke: T.cyanSoft, sw: 1.1, op: 0.9 }));
  G.push(poly(`${c - 1},190.5 ${c + 3},193 ${c - 1},195.5`, { stroke: T.cyanSoft, sw: 1.1, op: 0.9 }));
  G.push(line(c - 23, 193, c - 17, 193, gs, 0.8, { op: 0.5 }));
  G.push(line(c + 17, 193, c + 23, 193, gs, 0.8, { op: 0.5 }));
  G.push(circle(c, 208, 2, { fill: T.blue, op: 0.9 }));
  G.push(line(c, 200, c, 206, gs, 0.8, { op: 0.5 }));
}
{ // 03 identity + policy — stacked planes with enforcement point
  const c = cx(2);
  G.push(rect(c - 15, 179, 30, 11, { rx: 2, stroke: gs, sw: 1, op: ga }));
  G.push(rect(c - 15, 206, 30, 11, { rx: 2, stroke: gs, sw: 1, op: ga }));
  G.push(line(c, 190, c, 206, gs, 0.8, { op: 0.55 }));
  G.push(circle(c, 198, 2.4, { fill: T.cyan, op: 0.95 }));
}
{ // 04 kubernetes — control-plane mesh, one node accented
  const c = cx(3);
  const cells = [[-15, 180, gs], [2, 180, T.cyanSoft], [-15, 197, gs], [2, 197, gs]];
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
    G.push(circle(c + dx + 7.5, 204.5, 1.8, { fill: T.blue, op: 0.85 }));
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
  G.push(poly(`${c - 22},203 ${c - 15},196 ${c - 9},200 ${c - 2},189 ${c + 4},193 ${c + 11},182 ${c + 18},185`, { stroke: T.cyan, sw: 1.3, op: 0.9 }));
  G.push(rect(c - 12, 216, 4, 6, { fill: T.blue, op: 0.7 }));
  G.push(rect(c - 4, 212, 4, 10, { fill: T.blue, op: 0.8 }));
  G.push(rect(c + 4, 208, 4, 14, { fill: T.cyan, op: 0.85 }));
}
{ // 08 security — evidence ledger with attestation
  const c = cx(7);
  G.push(rect(c - 16, 181, 32, 26, { rx: 2.5, stroke: gs, sw: 1, op: 0.95 }));
  G.push(line(c - 10, 188.5, c + 10, 188.5, gs, 0.8, { op: 0.4 }));
  G.push(line(c - 10, 194, c - 1, 194, gs, 0.8, { op: 0.4 }));
  G.push(line(c - 10, 199.5, c - 4, 199.5, gs, 0.8, { op: 0.4 }));
  G.push(poly(`${c + 0},196 ${c + 4},200 ${c + 11},188`, { stroke: T.cyanSoft, sw: 1.4, op: 0.95 }));
}
P.push(`<g>${G.join('')}</g>`);

/* ------------------------------------------------------ flow connectors */
for (let i = 0; i < 7; i++) {
  const xa = px1(i), xb = px0(i + 1);
  P.push(line(xa + 1, FLOW_Y, xb - 6, FLOW_Y, T.flow, 1, { op: 0.9 }));
  P.push(poly(`${xb - 10.5},${FLOW_Y - 3.5} ${xb - 6},${FLOW_Y} ${xb - 10.5},${FLOW_Y + 3.5}`, { stroke: T.cyanSoft, sw: 1.3, op: 0.95 }));
}
// annotated dependency relationships
P.push(haloText((px1(4) + px0(5)) / 2, 234, 'DEPENDENCIES'));
P.push(haloText((px1(6) + px0(7)) / 2, 234, 'EVIDENCE'));

/* --------------------------------------------------- security boundary */
const B_Y = 318;
P.push(line(844, B_Y, 1404, B_Y, T.boundary, 1, { op: T.boundaryOp }));
P.push(line(844, B_Y - 4, 844, B_Y + 4, T.boundary, 1, { op: T.boundaryOp }));
for (let i = 2; i <= 6; i++) P.push(line(cx(i), PH + PY, cx(i), B_Y, T.boundary, 1, { op: T.dropOp }));
P.push(poly(`1404,${B_Y} 1452,${B_Y} 1452,${PH + PY + 5}`, { stroke: T.boundary, sw: 1, op: T.boundaryOp }));
P.push(poly(`${1448.5},${PH + PY + 10} 1452,${PH + PY + 5} 1455.5,${PH + PY + 10}`, { stroke: T.cyanSoft, sw: 1.2, op: 0.9 }));
P.push(txt(1124, 332, 'ZERO-TRUST BOUNDARY · POLICY-AS-CODE', { f: F_MONO, s: 7, w: 500, fill: T.boundaryLabel, ls: 1.2, a: 'middle' }));

/* ------------------------------------------------------ metrics readout */
const metrics = [
  { x: 624, dot: T.cyan, t: 'GATEWAY 4.2M RPM · P99 12MS' },
  { x: 812, dot: T.blue, t: 'KUBERNETES 1,248 PODS' },
  { x: 986, dot: T.green, t: 'GPU P99 38MS · σ 0.4' },
  { x: 1140, dot: T.dotGray, t: 'EVIDENCE 9F3A··C21 · CHAINED' },
  { x: 1494 - 21 * 4.9, dot: T.green, t: 'UPTIME 214D · MTTR 4M' },
];
for (const m of metrics) {
  P.push(circle(m.x + 2, 365.5, 2, { fill: m.dot }));
  P.push(txt(m.x + 10, 368.5, m.t, { f: F_MONO, s: 7.5, w: 400, fill: T.metricText, ls: 0.8 }));
}

/* ------------------------------------------------- frame, ticks, details */
P.push(rect(20.5, 20.5, W - 41, H - 41, { stroke: T.frame, sw: 1 }));
const ticks = [
  'M20,34 V20 H34', `M${W - 34},20 H${W - 20} V34`,
  `M20,${H - 34} V${H - 20} H34`, `M${W - 34},${H - 20} H${W - 20} V${H - 34}`,
];
P.push(`<path d="${ticks.join(' ')}" fill="none" stroke="${T.tick}" stroke-width="1" opacity="0.55"/>`);
for (const [px, py] of [[508, 62], [1148, 62], [1536, 256], [420, 352], [598, 204]])
  P.push(`<path d="M${px - 4},${py} H${px + 4} M${px},${py - 4} V${py + 4}" stroke="${T.tick}" stroke-width="1" opacity="0.3"/>`);

/* --------------------------------------------------- vignette + grain */
P.push(rect(0, 0, W, H, { fill: 'url(#vign)' }));
P.push(rect(0, 0, W, H, { fill: '#000', filter: 'url(#grain)', op: T.grainOp }));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${P.join('')}</svg>`;

/* ----------------------------------------------------------- safe-area */
const safeOverlay = `
<g>
  <circle cx="124" cy="384" r="76" fill="${T.photoFill}" opacity="0.92"/>
  <circle cx="124" cy="384" r="76" fill="none" stroke="${T.photoStroke}" stroke-width="2.5" opacity="0.85"/>
  <text x="124" y="392" font-family="${F_DISP}" font-size="26" font-weight="600" fill="${T.photoText}" text-anchor="middle" opacity="0.7">PHOTO</text>
  <circle cx="124" cy="326" r="76" fill="none" stroke="${T.danger}" stroke-width="1" stroke-dasharray="5 4" opacity="0.55"/>
</g>`;

/* ------------------------------------------------------------ render */
fs.mkdirSync(OUT, { recursive: true });
const S = THEME_NAME === 'dark' ? '-dark' : '';
fs.writeFileSync(path.join(OUT, `banner${S}.svg`), svg);
fs.writeFileSync(path.join(OUT, `banner${S}-safe-overlay.svg`), svg.replace('</svg>', safeOverlay + '</svg>'));

function render(svgStr, file, width) {
  const r = new Resvg(svgStr, {
    fitTo: { mode: 'width', value: width },
    font: { fontFiles, defaultFontFamily: F_DISP, loadSystemFonts: false },
  });
  fs.writeFileSync(path.join(OUT, file), r.render().asPng());
  console.log('wrote', file);
}
render(svg, `banner${S}-1584x396.png`, 1584);
render(svg, `banner${S}-2x-3168x792.png`, 3168);
render(svg.replace('</svg>', safeOverlay + '</svg>'), `preview-linkedin-overlay${S}.png`, 1584);
console.log(`done [${THEME_NAME}]`);
