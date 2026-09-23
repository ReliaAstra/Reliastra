#!/usr/bin/env node
"use strict";

// Command reliastra — the npm installer shim for the RELIASTRA CLI.
//
// The actual CLI is the Go binary published by GoReleaser
// (.goreleaser.yaml at the repository root). This shim adds nothing to the
// CLI's behavior: it locates the binary, downloads it on first use, checks
// its SHA-256 against the release's own checksums.txt, and then runs it
// with the arguments and exit codes passed straight through.
//
// Deliberate design choices, in order of importance:
//
//   Nothing runs at install time. There is no postinstall script, so
//   `npm install` makes no network request and executes no downloaded
//   code. The download happens on the first explicit `reliastra`
//   invocation, where the user can see it fail and why.
//
//   The download is verified. checksums.txt comes from the same GitHub
//   release as the binary; a mismatch refuses to execute anything.
//
//   No dependencies. The package is one file using only Node >= 18
//   built-ins (global fetch included), mirroring the CLI's own standard
//   library-only rule: an installer you cannot audit is not an installer.
//
// Environment:
//
//   RELIASTRA_BIN          run this existing binary instead of downloading
//   RELIASTRA_RELEASE_URL  release asset base URL (default: GitHub)
//   RELIASTRA_CACHE        cache directory (default: see cacheDir() below;
//                          shared with the PyPI wrapper of the same version)

const { spawnSync } = require("child_process");
const { createHash } = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = "ReliaAstra/Reliastra";
const DEFAULT_RELEASE_URL = `https://github.com/${REPO}/releases/download`;

// Exit behavior mirrors the CLI's own contract: 0 success, anything else
// is a failure the pipeline can act on. The CLI's codes (cli/cmd/reliastra
// main.go) are passed through untouched; the shim itself exits 1.
function fail(message) {
  process.stderr.write(`reliastra: ${message}\n`);
  process.exit(1);
}

// The published package version equals the CLI release tag (minus the v),
// enforced by the release workflow. The shim downloads that exact version.
const VERSION = require("../package.json").version;

// The release base URL, validated before anything is fetched from it.
//
// The override exists for mirrors and airgapped networks, so it has to stay
// configurable — but it is also the one environment variable that decides
// where a binary is downloaded from, so it is restricted to https (or http
// on loopback, which is how cli/test/wrappers_smoke_test.sh serves a fake
// release). Anything else — `file:`, `ftp:`, a bare path — is refused rather
// than silently resolved: a wrapper that fetches from an attacker-chosen
// scheme is worse than one that asks for a mirror over TLS.
function releaseBase() {
  const raw = (process.env.RELIASTRA_RELEASE_URL || DEFAULT_RELEASE_URL).replace(/\/+$/, "");
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(`RELIASTRA_RELEASE_URL is not a valid URL: ${raw}`);
  }
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    fail(
      `RELIASTRA_RELEASE_URL must be an https URL (http is allowed only on localhost): ${raw}`
    );
  }
  return raw;
}

// npm platform keys → Go toolchain GOOS/GOARCH keys (the release asset names).
function platformPair() {
  const goos = { linux: "linux", darwin: "darwin", win32: "windows" }[process.platform];
  const goarch = { x64: "amd64", arm64: "arm64" }[process.arch];
  if (!goos || !goarch) {
    fail(
      `no prebuilt reliastra binary for ${process.platform}/${process.arch}.\n` +
        `Supported: linux/darwin/windows on amd64/arm64.\n` +
        `Install with Go instead: go install github.com/${REPO}/cli/cmd/reliastra@latest`
    );
  }
  return [goos, goarch];
}

// Cache layout: <cache>/v<version>/reliastra[.exe]. Per version, so an
// upgrade re-downloads exactly once; shared with the PyPI wrapper so the
// two installers never keep rival copies of the same binary.
function cacheDir() {
  const override = process.env.RELIASTRA_CACHE;
  if (override) return override;
  const home = os.homedir();
  switch (process.platform) {
    case "win32":
      return path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "reliastra", "Cache");
    case "darwin":
      return path.join(home, "Library", "Caches", "reliastra");
    default:
      return path.join(process.env.XDG_CACHE_HOME || path.join(home, ".cache"), "reliastra");
  }
}

function binaryPath() {
  const [, exe] = process.platform === "win32" ? [null, ".exe"] : [null, ""];
  return path.join(cacheDir(), `v${VERSION}`, `reliastra${exe}`);
}

// Release assets are named reliastra_{version}_{goos}_{goarch}, and
// GoReleaser appends .exe to Windows binary uploads. checksums.txt is the
// authority on which name actually shipped; candidates are tried in order
// so the shim survives an upstream naming change without a code release.
function assetCandidates(goos, goarch) {
  const base = `reliastra_${VERSION}_${goos}_${goarch}`;
  return goos === "windows" ? [`${base}.exe`, base] : [base];
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": `reliastra-installer/${VERSION}` } });
  if (!res.ok) fail(`could not fetch ${url}: HTTP ${res.status}`);
  return res.text();
}

// Parse `sha256sum`-style lines: "<64 hex chars>␣␣<filename>".
function parseChecksums(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+)$/.exec(line.trim());
    if (m) map.set(m[2], m[1].toLowerCase());
  }
  return map;
}

async function downloadBinary() {
  const [goos, goarch] = platformPair();
  const base = releaseBase();
  const releaseDir = `${base}/v${VERSION}`;

  process.stderr.write(`reliastra: first run — downloading reliastra ${VERSION} (${goos}/${goarch})\n`);
  const checksums = parseChecksums(await fetchText(`${releaseDir}/checksums.txt`));

  let asset = null;
  let expected = null;
  for (const candidate of assetCandidates(goos, goarch)) {
    if (checksums.has(candidate)) {
      asset = candidate;
      expected = checksums.get(candidate);
      break;
    }
  }
  if (!asset) {
    fail(
      `checksums.txt for release v${VERSION} lists no binary for ${goos}/${goarch}.\n` +
        `Check ${releaseDir} — if the release is newer than this shim, upgrade with npm; otherwise report it.`
    );
  }

  const res = await fetch(`${releaseDir}/${asset}`, {
    headers: { "User-Agent": `reliastra-installer/${VERSION}` },
  });
  if (!res.ok || !res.body) fail(`could not download ${releaseDir}/${asset}: HTTP ${res.status}`);

  const dir = path.join(cacheDir(), `v${VERSION}`);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.download.${process.pid}`);
  const hash = createHash("sha256");
  // Hash and write in the same loop. Note: a Hash object is NOT a pass-through
  // Transform — piping through it in stream.pipeline emits only the final
  // digest, so the naive `pipeline(body, hash, file)` writes 32 bytes of
  // digest where the binary should be.
  const handle = fs.openSync(tmp, "w", 0o600);
  try {
    for await (const chunk of res.body) {
      hash.update(chunk);
      fs.writeSync(handle, chunk);
    }
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    fail(`download failed: ${err.message}`);
  } finally {
    fs.closeSync(handle);
  }

  const actual = hash.digest("hex");
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    fs.rmSync(tmp, { force: true });
    fail(
      `checksum mismatch for ${asset}.\n` +
        `  expected ${expected}\n` +
        `  actual   ${actual}\n` +
        `The download did not match the release's checksums.txt and was not executed. ` +
        `Retry; if it persists, do not use this machine's copy and report the release.`
    );
  }

  fs.chmodSync(tmp, 0o755);
  const final = binaryPath();
  try {
    fs.renameSync(tmp, final);
  } catch (err) {
    // On Windows a concurrent run may hold the destination; if a usable
    // binary is already in place, prefer it over failing the invocation.
    if (process.platform === "win32" && fs.existsSync(final)) {
      fs.rmSync(tmp, { force: true });
    } else {
      throw err;
    }
  }
  return final;
}

// Constant-time compare without pulling in crypto.timingSafeEqual's throw
// on length mismatch (handled by the caller).
function timingSafeEqual(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Run the real CLI: inherit stdio, pass exit codes through, translate
// signals the way a shell would (SIGINT → 130) so pipelines cannot tell
// the shim from the binary.
function runBinary(bin, args) {
  const result = spawnSync(bin, args, { stdio: "inherit", windowsHide: true });
  if (result.error && result.error.code === "ENOENT") {
    fail(`binary missing at ${bin} — delete RELIASTRA_CACHE and retry`);
  }
  if (result.error) fail(`could not run ${bin}: ${result.error.message}`);
  if (result.status !== null) process.exit(result.status);
  const sig = result.signal === "SIGINT" ? 2 : result.signal === "SIGTERM" ? 15 : 1;
  process.exit(128 + sig);
}

// A cached binary that lost its executable bit — copied between machines,
// unpacked by a tool that dropped modes — would otherwise fail as a
// permission error from spawn. POSIX only: Windows has no exec bit.
function ensureExecutable(bin) {
  if (process.platform === "win32") return;
  try {
    fs.accessSync(bin, fs.constants.X_OK);
  } catch {
    try {
      fs.chmodSync(bin, 0o755);
    } catch {
      // Not ours to fix (another user's cache, read-only mount); runBinary
      // reports the failure with the path in it.
    }
  }
}

async function main() {
  const override = process.env.RELIASTRA_BIN;
  if (override) {
    if (!fs.existsSync(override)) fail(`RELIASTRA_BIN points at ${override}, which does not exist`);
    ensureExecutable(override);
    runBinary(override, process.argv.slice(2));
    return;
  }
  let bin = binaryPath();
  if (!fs.existsSync(bin)) {
    bin = await downloadBinary();
  } else {
    ensureExecutable(bin);
  }
  runBinary(bin, process.argv.slice(2));
}

main().catch((err) => fail(err && err.message ? err.message : String(err)));
