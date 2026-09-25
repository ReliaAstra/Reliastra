.PHONY: help frontend backend test lint install cli cli-test cli-wrappers-test cli-version-check cli-release-check

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
