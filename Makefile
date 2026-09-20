.PHONY: help frontend backend test lint install cli cli-test

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
