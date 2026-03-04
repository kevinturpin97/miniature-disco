.PHONY: help up down build logs restart migrate makemigrations shell test test-backend test-frontend lint format superuser seed simulate prod-up prod-down prod-build backup loadtest

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Docker commands
up: ## Start all services
	docker compose up -d

up-build: ## Build and start all services
	docker compose up -d --build

down: ## Stop all services
	docker compose down

down-v: ## Stop all services and remove volumes
	docker compose down -v

build: ## Build all Docker images
	docker compose build

logs: ## Show logs for all services
	docker compose logs -f

logs-backend: ## Show backend logs
	docker compose logs -f backend

logs-celery: ## Show celery worker logs
	docker compose logs -f celery-worker

logs-bridge: ## Show LoRa bridge logs
	docker compose logs -f lora-bridge

restart: ## Restart all services
	docker compose restart

restart-backend: ## Restart backend service
	docker compose restart backend

# Django commands
migrate: ## Run Django migrations
	docker compose exec backend python manage.py migrate

makemigrations: ## Create new Django migrations
	docker compose exec backend python manage.py makemigrations

shell: ## Open Django shell
	docker compose exec backend python manage.py shell

superuser: ## Create a Django superuser
	docker compose exec backend python manage.py createsuperuser

collectstatic: ## Collect static files
	docker compose exec backend python manage.py collectstatic --noinput

# Testing
test: test-backend test-frontend ## Run all tests

test-backend: ## Run backend tests
	docker compose exec backend pytest -v

test-frontend: ## Run frontend tests
	docker compose exec frontend npm run test:run

# Code quality
lint: ## Run linters
	docker compose exec frontend npm run lint

format: ## Format code
	docker compose exec frontend npm run format

# Database
db-shell: ## Open PostgreSQL shell
	docker compose exec postgres psql -U greenhouse -d greenhouse

db-reset: ## Reset database (WARNING: destroys data)
	docker compose down -v
	docker compose up -d postgres redis mosquitto
	@echo "Waiting for postgres to be ready..."
	@sleep 5
	docker compose up -d backend
	@sleep 3
	$(MAKE) migrate
	$(MAKE) superuser

# Frontend
npm-install: ## Install frontend dependencies
	docker compose exec frontend npm install

# Status
ps: ## Show running containers
	docker compose ps

# Data
seed: ## Create demo seed data
	docker compose exec backend python manage.py seed_data

simulate: ## Simulate sensor data (Ctrl+C to stop)
	docker compose exec backend python manage.py simulate_data --backfill 24

simulate-live: ## Run live sensor simulation only
	docker compose exec backend python manage.py simulate_data --interval 10

# Production
prod-build: ## Build production Docker images
	docker compose -f docker-compose.prod.yml build

prod-up: ## Start production services
	docker compose -f docker-compose.prod.yml up -d

prod-down: ## Stop production services
	docker compose -f docker-compose.prod.yml down

prod-logs: ## Show production logs
	docker compose -f docker-compose.prod.yml logs -f

ssl: ## Generate self-signed SSL certificates
	./scripts/generate-ssl.sh

# Observability (Sprint 18)
backup: ## Run PostgreSQL backup manually
	docker compose -f docker-compose.prod.yml exec pg-backup /scripts/backup-postgres.sh

loadtest: ## Run Locust load tests (opens web UI on :8089)
	locust -f locustfile.py --host=http://localhost:8000

health: ## Check all health endpoints
	@echo "Liveness:" && curl -s http://localhost:8000/api/health/ | python -m json.tool
	@echo "\nReadiness:" && curl -s http://localhost:8000/api/health/ready/ | python -m json.tool
	@echo "\nDetailed:" && curl -s http://localhost:8000/api/health/detailed/ | python -m json.tool
