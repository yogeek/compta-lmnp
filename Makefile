.PHONY: up down build test test-backend test-frontend lint migrate seed logs shell-backend shell-frontend

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build --no-cache

test: test-backend test-frontend

test-backend:
	docker compose run --rm backend pytest tests/ -v --cov=app --cov-report=term-missing

test-frontend:
	docker compose run --rm frontend npm run test -- --run

lint:
	docker compose run --rm backend ruff check app/ tests/
	docker compose run --rm frontend npm run lint

migrate:
	docker compose run --rm backend alembic upgrade head

seed:
	docker compose run --rm backend python -m app.db.seed

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend

logs-frontend:
	docker compose logs -f frontend

shell-backend:
	docker compose exec backend bash

shell-frontend:
	docker compose exec frontend sh

backup:
	docker run --rm -v lmnp_data:/data -v $(PWD):/backup alpine \
		tar czf /backup/lmnp_backup_$$(date +%Y%m%d_%H%M%S).tar.gz /data

dev-backend:
	cd backend && pip install -e ".[dev]" && uvicorn app.main:app --reload --port 8000

clean:
	docker compose down -v
	find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
