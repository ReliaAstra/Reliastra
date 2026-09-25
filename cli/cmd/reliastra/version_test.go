package main

import "testing"

/* ── Version resolution ────────────────────────────────────────────────────

   `--version` is the one string every distribution channel has to agree on:
   the release tag, the npm package, the PyPI package and the binary all
   report it. These tests pin the classification that decides whether the
   toolchain stamped a real release version into the binary, because a source
   build that claimed to be a release would be indistinguishable from one.

   ─────────────────────────────────────────────────────────────────────────── */

func TestIsSemver_AcceptsStampedVersions(t *testing.T) {
	for _, want := range []string{"v0.2.1", "v1", "v1.2", "v10.20.30", "v0.2.1-rc.1", "v0.2.1+meta", "v0.2.1-rc.1+meta"} {
		if !isSemver(want) {
			t.Errorf("isSemver(%q) = false, want true", want)
		}
	}
}

func TestIsSemver_RejectsNonReleaseVersions(t *testing.T) {
	// "(devel)" is what a `go build` in a checkout stamps; a pseudo-version
	// is what Go stamps for an untagged commit. Neither is a release, and a
	// pseudo-version is the dangerous one: its release part is a perfectly
	// valid 0.0.0, so only its shape gives it away.
	for _, version := range []string{"", "(devel)", "v0.0.0-20260921153000-66736774abcd", "v1.2.3-20260921153000-66736774abcd", "0.2.1", "latest", "v"} {
		if isSemver(version) {
			t.Errorf("isSemver(%q) = true, want false", version)
		}
	}
}

func TestTrimVersionPrefix(t *testing.T) {
	cases := map[string]string{
		"v0.2.1": "0.2.1",
		"0.2.1":  "0.2.1",
		" v1.0":  "1.0",
	}
	for in, want := range cases {
		if got := trimVersionPrefix(in); got != want {
			t.Errorf("trimVersionPrefix(%q) = %q, want %q", in, got, want)
		}
	}
}

// A test binary carries no module version, so versionString falls back to
// the value compiled in — which must itself be bare semver, not `v0.2.0`,
// or the channels would disagree on the format.
func TestVersionString_FallsBackToCompiledVersion(t *testing.T) {
	if _, ok := moduleVersion(); ok {
		t.Fatalf("moduleVersion() reported a version inside `go test`; the fallback is untestable")
	}
	got := versionString()
	if got != trimVersionPrefix(version) {
		t.Errorf("versionString() = %q, want %q", got, trimVersionPrefix(version))
	}
	if !isSemver("v" + got) {
		t.Errorf("versionString() = %q, want bare semver", got)
	}
}

// A `go install …@latest` from a branch with no release tag stamps a
// pseudo-version; the binary must not claim to be release 0.0.0.
func TestModuleVersion_PseudoVersionIsNotARelease(t *testing.T) {
	if !isPseudoVersion("20260921153000-66736774abcd") {
		t.Error("isPseudoVersion did not recognise a pseudo-version stamp")
	}
	for _, stamp := range []string{"", "0.2.1", "rc.1", "20260921-66736774abcd", "20260921153000", "20260921153000-nothex"} {
		if isPseudoVersion(stamp) {
			t.Errorf("isPseudoVersion(%q) = true, want false", stamp)
		}
	}
}
