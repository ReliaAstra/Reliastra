.PHONY: help frontend backend test lint install cli cli-test cli-check cli-wrappers-test cli-artifacts cli-install-smoke cli-dry-run cli-release-prep

help:
	@echo "Reliastra monorepo"
	@echo ""
	@echo "  make install    Install frontend and backend dependencies"
	@echo "  make frontend   Run the Next.js app on :3000"
	@echo "  make backend    Run the FastAPI app on :8000"
	@echo "  make test       Run backend tests"
	@echo "  make lint       Lint frontend and backend"
	@echo "  make cli        Build the reliastra CLI"
	@echo "  make cli-test   Format-check, vet and test the CLI"
	@echo "  make cli-check  The whole release gate: CLI + npm/PyPI packaging"
	@echo "  make cli-wrappers-test"
	@echo "                  Smoke-test the npm/PyPI installers (fake release)"
	@echo "  make cli-artifacts VERSION=0.2.1 [DIST=dist]"
	@echo "                  Verify built release artifacts and checksums"
	@echo "  make cli-install-smoke [VERSION=0.2.1] [DIST=dist]"
	@echo "                  Install through npm and pip, then run the CLI"
	@echo "  make cli-dry-run"
	@echo "                  goreleaser --snapshot: build a release, publish nothing"
	@echo "  make cli-release-prep VERSION=0.2.1"
	@echo "                  Set the CLI version everywhere it must appear"

install:
	cd frontend && npm install
	cd backend && pip install -r requirements.txt

frontend:
	cd frontend && npm run dev

backend:
	cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

test:
	cd backend && pytest -v

lint:
	cd frontend && npm run lint
	cd backend && python -m ruff check app/ tests/

cli:
	cd cli && go build ./...

cli-test:
	cd cli && test -z "$$(gofmt -l .)" && go vet ./... && go test -race ./...

cli-wrappers-test:
	bash cli/test/wrappers_smoke_test.sh

# The gate the release pipeline runs (cli/test/release_check.sh), locally:
# one version everywhere, gofmt/vet/test, the full cross-compile matrix,
# goreleaser check, npm and PyPI packaging checks, installer smoke test.
# RELIASTRA_CHECK_SKIP_GO=1 skips only the Go checks, for a machine with no
# Go toolchain.
cli-check:
	bash cli/test/release_check.sh

# Verify what would be uploaded: every platform's binary and archive,
# present and matching checksums.txt.
cli-artifacts:
	bash cli/test/artifacts_check.sh "$(VERSION)" "$(DIST)"

# Install the way a user does and run it: npm install -g, pip install,
# --version, --help, a real command, a real exit code.
cli-install-smoke:
	bash cli/test/install_smoke_test.sh $(if $(VERSION),--version $(VERSION),) $(if $(DIST),--dist $(DIST),) --skip-release-url

# A release, built but not published. Inspect dist/ by hand.
cli-dry-run:
	goreleaser release --snapshot --clean --skip=publish

# Cutting a release starts here: one version, in all five places it has to
# appear. See cli/RELEASING.md.
cli-release-prep:
	@test -n "$(VERSION)" || { echo "usage: make cli-release-prep VERSION=0.2.1"; exit 1; }
	@case "$(VERSION)" in \
		[0-9]*.[0-9]*.[0-9]*) ;; \
		*) echo "VERSION must be <major>.<minor>.<patch>[-prerelease]"; exit 1 ;; \
	esac
	sed -i 's/^var version = "[^"]*"/var version = "$(VERSION)"/' cli/cmd/reliastra/main.go
	sed -i 's/^  "version": "[^"]*"/  "version": "$(VERSION)"/' cli/npm/package.json
	sed -i 's/^version = "[^"]*"/version = "$(VERSION)"/' cli/python/pyproject.toml
	sed -i 's/^__version__ = "[^"]*"/__version__ = "$(VERSION)"/' cli/python/src/reliastra/__init__.py
	@echo "version set to $(VERSION) in:"
	@echo "  cli/cmd/reliastra/main.go"
	@echo "  cli/npm/package.json"
	@echo "  cli/python/pyproject.toml"
	@echo "  cli/python/src/reliastra/__init__.py"
	@echo ""
	@echo "next: update cli/CHANGELOG.md, run 'make cli-check', commit, then 'git tag v$(VERSION)'"
