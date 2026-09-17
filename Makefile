.DEFAULT_GOAL := help
COMPOSE := docker compose

.PHONY: help up down build logs ps restart seed migrate test test-backend test-frontend lint typecheck dev-api dev-web clean nuke

help: ## Muestra esta ayuda
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

up: ## Levanta todo (db + api + web) construyendo las imágenes
	$(COMPOSE) up --build -d
	@echo "Frontend: http://localhost:8080  ·  API docs: http://localhost:8000/api/docs"

down: ## Baja los contenedores (conserva los datos)
	$(COMPOSE) down

build: ## Construye las imágenes sin levantar
	$(COMPOSE) build

logs: ## Sigue los logs de todos los servicios
	$(COMPOSE) logs -f --tail=100

ps: ## Estado de los servicios
	$(COMPOSE) ps

restart: ## Reinicia api y web
	$(COMPOSE) restart api web

seed: ## (Re)siembra los datos de ejemplo — ¡BORRA los movimientos existentes!
	@echo "AVISO: 'make seed' usa --force y reemplaza TODOS los movimientos por los de ejemplo."
	$(COMPOSE) exec api python -m app.seed --force

migrate: ## Aplica las migraciones de Alembic
	$(COMPOSE) exec api alembic upgrade head

test: test-backend test-frontend ## Corre todos los tests

test-backend: ## pytest en un contenedor descartable (no necesitás Python en tu máquina)
	docker compose run --rm --no-deps api sh -c "pip install -q -e '.[dev]' && python -m pytest -q -m 'not postgres'"

test-frontend: ## vitest + typecheck del frontend
	cd frontend && pnpm run test -- --run && pnpm exec tsc --noEmit

test-integration: ## Contrato completo contra el stack levantado (destructivo: re-siembra al final)
	@python3 tests/integration/api_smoke.py; status=$$?; $(COMPOSE) exec -T api python -m app.seed --force; exit $$status

lint: ## ruff (backend) + eslint (frontend)
	cd backend && python -m ruff check .
	cd frontend && pnpm run lint

dev-api: ## API en modo desarrollo (fuera de Docker, requiere Postgres local)
	cd backend && uvicorn app.main:app --reload --port 8000

dev-web: ## Frontend en modo desarrollo con hot reload y proxy a /api
	cd frontend && pnpm run dev

clean: ## Baja los contenedores y BORRA el volumen de datos
	$(COMPOSE) down -v

nuke: clean ## Igual que clean, y además borra artefactos locales de build
	rm -rf frontend/dist frontend/node_modules backend/**/__pycache__
