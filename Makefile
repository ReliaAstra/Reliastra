.PHONY: help frontend backend test lint install cli cli-test cli-wrappers-test cli-version-check cli-release-check cli-artifacts cli-install-smoke cli-dry-run mcp-install test-mcp smoke-mcp mcp-capabilities mcp-check-config mcp-stdio

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
	@echo "  make cli-wrappers-test"
	@echo "                  Smoke-test the npm/PyPI installers (fake release)"
	@echo "  make cli-version-check"
	@echo "                  The four version-bearing CLI files agree"
	@echo "  make cli-release-check"
	@echo "                  Everything release-cli.yml checks before tagging"
	@echo "  make cli-artifacts VERSION=v0.2.1 [DIST=dist]"
	@echo "                  Every platform's binary + archive, checksums verified"
	@echo "  make cli-install-smoke [DIST=dist]"
	@echo "                  npm + pip install from a dist/, then run the CLI"
	@echo "  make cli-dry-run"
	@echo "                  goreleaser --snapshot: build a release, publish nothing"
	@echo "  make mcp-install"
	@echo "                  Install the MCP server's (separate) dependencies"
	@echo "  make test-mcp   Run the MCP server test suite"
	@echo "  make smoke-mcp  Drive the real server with a real MCP client, both transports"
	@echo "  make mcp-capabilities"
	@echo "                  Print the verified capability registry as JSON"
	@echo "  make mcp-check-config"
	@echo "                  Validate MCP configuration from the environment and print it"
	@echo "  make mcp-stdio  Run the MCP server on stdio (needs RELIASTRA_API_KEY)"
	@echo "  make prod-host"
	@echo "                  print the production host address from the untracked local file"

# Production host addresses live in deploy/production/.host.local, which is
# gitignored because this repository is public. This target exists so no doc
# has to ever inline the address.
prod-host:
	@if [ -f deploy/production/.host.local ]; then \
		. ./deploy/production/.host.local; \
		echo "ssh reliastra@$$TS_HOST"; \
	else \
		echo "deploy/production/.host.local not found."; \
		echo "cp deploy/production/.host.local.example deploy/production/.host.local"; \
		echo "and fill it in, or read it from the operator password manager."; \
		exit 1; \
	fi

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
	cd backend && python -m ruff check app/ tests/ mcp_server/ scripts/

# ── MCP server ─────────────────────────────────────────────────────────────
# A separate, optional process: backend/mcp_server. Its dependencies are
# deliberately not in backend/requirements.txt (see backend/requirements-mcp.txt
# for why, and for the evidence that co-installing them changes no existing
# version). `make test` already covers tests/unit/mcp once they are installed.
mcp-install:
	cd backend && pip install -r requirements-mcp.txt

test-mcp:
	cd backend && pytest tests/unit/mcp -q

# Not a unit test: spawns the server as a real subprocess on both transports and
# drives it with the official SDK client. Needs no database, no Redis and no
# network - it points the upstream at a port nothing listens on.
smoke-mcp:
	cd backend && python scripts/mcp_smoke.py

mcp-capabilities:
	cd backend && python -m mcp_server --print-capabilities

mcp-check-config:
	cd backend && python -m mcp_server --check-config

mcp-stdio:
	cd backend && python -m mcp_server --transport stdio

cli:
	cd cli && go build ./...

cli-test:
	cd cli && test -z "$$(gofmt -l .)" && go vet ./... && go test -race ./...

cli-wrappers-test:
	bash cli/test/wrappers_smoke_test.sh

cli-version-check:
	cli/scripts/version.sh check

# Local equivalent of the validate + test stages of release-cli.yml:
# run before `git tag`. Add VERSION=vX.Y.Z to also assert the tree is at
# the version about to be tagged.
cli-release-check: cli-version-check cli-test cli-wrappers-test
	@if [ -n "$(VERSION)" ]; then cli/scripts/version.sh check "$(VERSION)"; fi
	cd cli && for t in linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64; do \
	  GOOS=$${t%/*} GOARCH=$${t##*/} CGO_ENABLED=0 go build -o /dev/null ./cmd/reliastra && echo "ok $$t"; done
	cd cli/npm && npm pack --dry-run
	cd cli/python && rm -rf dist && python3 -m build --quiet && python3 -m twine check --strict dist/*

# Release artifacts: every platform a user can install on, present and
# matching checksums.txt. Resolves GoReleaser's real dist/ layout from
# dist/artifacts.json, so it works whether raw binaries sit at the root
# (older GoReleaser) or in per-target directories (2.x).
cli-artifacts:
	bash cli/test/artifacts_check.sh "$(VERSION)" "$(DIST)"

# Install the way a user does and run it: npm install -g, pip install,
# --version, --help, a real command, a real exit code. With DIST set, the
# download comes from a loopback copy of that dist/ instead of GitHub.
cli-install-smoke:
	bash cli/test/install_smoke_test.sh $(if $(VERSION),--version $(VERSION),) $(if $(DIST),--dist $(DIST),) --skip-release-url

cli-dry-run:
	goreleaser release --snapshot --clean --skip=publish
