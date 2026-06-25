.PHONY: start dev up down build logs seed pull-models test-backend test-frontend lint

start:
	bash scripts/start.sh

dev:
	docker compose up -d

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f

seed:
	docker compose exec api python scripts/seed.py

pull-models:
	docker compose exec ollama ollama pull llama3.2 || true

test-backend:
	cd backend && source .venv/bin/activate && python -m pytest tests/ -v

test-frontend:
	cd frontend && npx next lint

lint:
	cd backend && source .venv/bin/activate && ruff check app/ tests/ scripts/
	cd frontend && npx next lint
