.PHONY: start dev up down build logs seed pull-models test-backend test-frontend lint migrate migrate-down migrate-auto migrate-history

BACKEND_VENV = cd backend && source .venv/bin/activate

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
	$(BACKEND_VENV) && python scripts/seed.py

pull-models:
	ollama pull llama3.2 || true

test-backend:
	cd backend && source .venv/bin/activate && python -m pytest tests/ -v

test-frontend:
	cd frontend && npx next lint

lint:
	cd backend && source .venv/bin/activate && ruff check app/ tests/ scripts/
	cd frontend && npx next lint

migrate:
	$(BACKEND_VENV) && alembic upgrade head

migrate-down:
	$(BACKEND_VENV) && alembic downgrade -1

migrate-auto:
	$(BACKEND_VENV) && alembic revision --autogenerate -m "$(message)"

migrate-history:
	$(BACKEND_VENV) && alembic history
