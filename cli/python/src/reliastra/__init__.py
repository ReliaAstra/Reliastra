"""Command reliastra — the PyPI installer shim for the RELIASTRA CLI.

The actual CLI is the Go binary published by GoReleaser (.goreleaser.yaml
at the repository root). This package adds nothing to the CLI's behavior:
it locates the binary, downloads it on first use, checks its SHA-256
against the release's own checksums.txt, and then runs it with the
arguments and exit codes passed straight through.

Deliberate design choices, in order of importance:

    Nothing runs at install time. The wheel is pure Python and contains no
    build hooks, so `pip install` and `pipx install` execute no downloaded
    code. The download happens on the first explicit `reliastra`
    invocation, where the user can see it fail and why.

    The download is verified. checksums.txt comes from the same GitHub
    release as the binary; a mismatch refuses to execute anything.

    No dependencies. Standard library only (the CLI itself is a
    zero-dependency Go binary; an installer you cannot audit is not an
    installer). Python 3.9 or newer.

    Works identically under pip and pipx: the console-script entry point
    is the whole package. pipx's isolated venv is irrelevant to it.

Environment:

    RELIASTRA_BIN          run this existing binary instead of downloading
    RELIASTRA_RELEASE_URL  release asset base URL (default: GitHub)
    RELIASTRA_CACHE        cache directory (default: see _cache_dir()
                           below; shared with the npm wrapper of the same
                           version)
"""

from __future__ import annotations

import hashlib
import os
import platform
import stat
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

REPO = "ReliaAstra/Reliastra"
DEFAULT_RELEASE_URL = f"https://github.com/{REPO}/releases/download"

# Hosts http (rather than https) is tolerated on: the smoke test serves a
# fake release from loopback, and a loopback mirror is a legitimate
# airgapped setup. See _release_base().
_LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})

# Fallback for running from a source checkout, where importlib.metadata
# cannot see an installed distribution. The release workflow rewrites this
# line to match the tag, the same as pyproject.toml's version.
__version__ = "0.2.0"


def _version() -> str:
    try:
        from importlib.metadata import PackageNotFoundError, version as _v

        return _v("reliastra")
    except PackageNotFoundError:
        return __version__


def _cache_dir() -> Path:
    override = os.environ.get("RELIASTRA_CACHE")
    if override:
        return Path(override)
    home = Path.home()
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", home / "AppData" / "Local"))
        return base / "reliastra" / "Cache"
    if sys.platform == "darwin":
        return home / "Library" / "Caches" / "reliastra"
    base = os.environ.get("XDG_CACHE_HOME", str(home / ".cache"))
    return Path(base) / "reliastra"


def _binary_path() -> Path:
    exe = ".exe" if sys.platform == "win32" else ""
    return _cache_dir() / f"v{_version()}" / f"reliastra{exe}"


def _platform_pair() -> tuple[str, str]:
    goos = {"Linux": "linux", "Darwin": "darwin", "Windows": "windows"}.get(platform.system())
    machine = platform.machine().lower()
    goarch = {"x86_64": "amd64", "amd64": "amd64", "arm64": "arm64", "aarch64": "arm64"}.get(machine)
    if not goos or not goarch:
        _fail(
            f"no prebuilt reliastra binary for {platform.system()}/{platform.machine()}.\n"
            f"Supported: linux/darwin/windows on amd64/arm64.\n"
            f"Install with Go instead: go install github.com/{REPO}/cli/cmd/reliastra@latest"
        )
    return goos, goarch


def _fail(message: str) -> "NoReturn":  # type: ignore[valid-type]
    print(f"reliastra: {message}", file=sys.stderr)
    sys.exit(1)


def _release_base() -> str:
    """The validated release asset base URL.

    RELIASTRA_RELEASE_URL exists for mirrors and airgapped networks, so it
    has to stay configurable — but it is also the one environment variable
    that decides where a binary is downloaded from, so it is restricted to
    https (or http on loopback, which is how
    cli/test/wrappers_smoke_test.sh serves a fake release). Anything else —
    `file:`, `ftp:`, a bare path — is refused instead of being resolved: a
    wrapper that fetches from an attacker-chosen scheme is worse than one
    that asks for a mirror over TLS.
    """
    raw = os.environ.get("RELIASTRA_RELEASE_URL", DEFAULT_RELEASE_URL).rstrip("/")
    parsed = urllib.parse.urlparse(raw)
    if parsed.scheme != "https":
        loopback = (parsed.hostname or "") in _LOOPBACK_HOSTS
        if not (parsed.scheme == "http" and loopback):
            _fail(
                "RELIASTRA_RELEASE_URL must be an https URL "
                f"(http is allowed only on localhost): {raw}"
            )
    return raw


def _ensure_executable(binary: Path) -> None:
    """Restore the executable bit on a cached binary that lost it.

    A cache copied between machines or unpacked by a tool that dropped
    modes would otherwise fail with a bare PermissionError from exec.
    Windows has no exec bit, so this is a no-op there.
    """
    if sys.platform == "win32" or not binary.exists():
        return
    try:
        if not os.access(str(binary), os.X_OK):
            binary.chmod(binary.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    except OSError:
        # Not ours to fix (another user's cache, read-only mount); the exec
        # attempt below reports the failure with the path in it.
        pass


def _fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": f"reliastra-installer/{_version()}"})
    try:
        with urllib.request.urlopen(request) as response:  # noqa: S310 (https/file URLs by design)
            return response.read()
    except Exception as err:  # urllib raises a zoo; one clear message is kinder
        _fail(f"could not fetch {url}: {err}")


def _parse_checksums(blob: bytes) -> dict[str, str]:
    """Parse `sha256sum`-style lines: "<64 hex chars>␣␣<filename>"."""
    checksums: dict[str, str] = {}
    for line in blob.decode("utf-8", "replace").splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) == 2 and len(parts[0]) == 64:
            checksums[parts[1].lstrip("*")] = parts[0].lower()
    return checksums


def _download_binary() -> Path:
    goos, goarch = _platform_pair()
    base = _release_base()
    release_dir = f"{base}/v{_version()}"

    print(
        f"reliastra: first run — downloading reliastra {_version()} ({goos}/{goarch})",
        file=sys.stderr,
    )
    checksums = _parse_checksums(_fetch(f"{release_dir}/checksums.txt"))

    # Release assets are named reliastra_{version}_{goos}_{goarch}, and
    # GoReleaser appends .exe to Windows binary uploads. checksums.txt is
    # the authority on which name actually shipped; candidates are tried
    # in order so the shim survives an upstream naming change.
    base_name = f"reliastra_{_version()}_{goos}_{goarch}"
    candidates = [f"{base_name}.exe", base_name] if goos == "windows" else [base_name]
    asset = next((c for c in candidates if c in checksums), None)
    if asset is None:
        _fail(
            f"checksums.txt for release v{_version()} lists no binary for {goos}/{goarch}.\n"
            f"Check {release_dir} — if the release is newer than this shim, upgrade pip; "
            f"otherwise report it."
        )
    expected = checksums[asset]

    binary = _fetch(f"{release_dir}/{asset}")
    actual = hashlib.sha256(binary).hexdigest()
    if actual != expected:
        _fail(
            f"checksum mismatch for {asset}.\n"
            f"  expected {expected}\n"
            f"  actual   {actual}\n"
            f"The download did not match the release's checksums.txt and was not executed. "
            f"Retry; if it persists, do not use this machine's copy and report the release."
        )

    target = _binary_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    # Write beside the target, then rename: a failed download never leaves
    # a half-written file where the real binary belongs.
    fd, tmp_name = tempfile.mkstemp(dir=str(target.parent), prefix=".download.")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(binary)
        os.chmod(tmp_name, 0o755)
        try:
            os.replace(tmp_name, target)
        except OSError:
            # Windows cannot replace a file another run holds open; if a
            # usable binary is already in place, prefer it over failing.
            if not (sys.platform == "win32" and target.exists()):
                raise
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
    return target


def _run(binary: Path, args: list[str]) -> None:
    try:
        code = subprocess.call([str(binary), *args])  # noqa: S603 (fixed program, user args)
    except FileNotFoundError:
        _fail(f"binary missing at {binary} — delete RELIASTRA_CACHE and retry")
    except KeyboardInterrupt:
        sys.exit(130)
    sys.exit(code)


def main() -> None:
    override = os.environ.get("RELIASTRA_BIN")
    if override:
        binary = Path(override)
        if not binary.exists():
            _fail(f"RELIASTRA_BIN points at {override}, which does not exist")
        _ensure_executable(binary)
        _run(binary, sys.argv[1:])
        return
    binary = _binary_path()
    if not binary.exists():
        binary = _download_binary()
    else:
        _ensure_executable(binary)
    _run(binary, sys.argv[1:])


if __name__ == "__main__":
    main()
