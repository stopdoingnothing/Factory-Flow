.DEFAULT_GOAL := help

# ─── Colours ──────────────────────────────────────────────────────────────────
BOLD  := \033[1m
RESET := \033[0m
GREEN := \033[32m
YELLOW := \033[33m
RED   := \033[31m

# ─── Help ─────────────────────────────────────────────────────────────────────
.PHONY: help
help:
	@echo ""
	@echo "$(BOLD)AECE Checkpoint — Setup & Management$(RESET)"
	@echo ""
	@echo "$(BOLD)First-time setup:$(RESET)"
	@echo "  make setup        Create .env from template and build the application"
	@echo ""
	@echo "$(BOLD)Daily use:$(RESET)"
	@echo "  make start        Start all services"
	@echo "  make stop         Stop all services"
	@echo "  make restart      Restart the application (keeps database running)"
	@echo "  make status       Show running containers and health"
	@echo "  make logs         Tail application logs"
	@echo ""
	@echo "$(BOLD)Maintenance:$(RESET)"
	@echo "  make update       Pull latest code, rebuild and restart"
	@echo "  make backup       Trigger an immediate database backup"
	@echo "  make restore      Restore database from a backup file (prompts for file path)"
	@echo "  make reset-data   $(RED)DANGER$(RESET) — wipe all data and start fresh"
	@echo ""

# ─── First-time setup ─────────────────────────────────────────────────────────
.PHONY: setup
setup: _check-docker _env _dirs build start
	@echo ""
	@echo "$(GREEN)$(BOLD)Setup complete.$(RESET)"
	@echo ""
	@echo "  Application: http://localhost:5000"
	@echo ""
	@echo "  Edit .env to set a strong POSTGRES_PASSWORD and SESSION_SECRET"
	@echo "  before going live."
	@echo ""

.PHONY: _env
_env:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "$(YELLOW)Created .env from .env.example — review and update the values before going live.$(RESET)"; \
	else \
		echo ".env already exists — skipping."; \
	fi

.PHONY: _dirs
_dirs:
	@mkdir -p data/postgres data/backups

# ─── Build ────────────────────────────────────────────────────────────────────
.PHONY: build
build: _check-docker
	@echo "$(BOLD)Building application image...$(RESET)"
	docker compose build app

# ─── Start / Stop ─────────────────────────────────────────────────────────────
.PHONY: start
start: _check-docker _check-env
	@echo "$(BOLD)Starting services...$(RESET)"
	docker compose up -d
	@echo ""
	@echo "$(GREEN)Running at http://localhost:5000$(RESET)"

.PHONY: stop
stop: _check-docker
	@echo "$(BOLD)Stopping services...$(RESET)"
	docker compose down

.PHONY: restart
restart: _check-docker _check-env
	@echo "$(BOLD)Restarting application...$(RESET)"
	docker compose restart app

# ─── Status & Logs ────────────────────────────────────────────────────────────
.PHONY: status
status: _check-docker
	docker compose ps

.PHONY: logs
logs: _check-docker
	docker compose logs -f app

# ─── Update ───────────────────────────────────────────────────────────────────
.PHONY: update
update: _check-docker _check-env
	@echo "$(BOLD)Pulling latest code...$(RESET)"
	git pull
	@echo "$(BOLD)Rebuilding application...$(RESET)"
	docker compose build app
	@echo "$(BOLD)Restarting application...$(RESET)"
	docker compose up -d app
	@echo "$(GREEN)Update complete.$(RESET)"

# ─── Backup ───────────────────────────────────────────────────────────────────
.PHONY: backup
backup: _check-docker
	@echo "$(BOLD)Running immediate backup...$(RESET)"
	@FILENAME=data/backups/factoryflow_manual_$$(date +%Y%m%d_%H%M%S).sql.gz; \
	docker compose exec -T db sh -c \
		"PGPASSWORD=$$POSTGRES_PASSWORD pg_dump -U factoryflow factoryflow | gzip" \
		> $$FILENAME && \
	echo "$(GREEN)Backup saved to $$FILENAME$(RESET)" || \
	echo "$(RED)Backup failed — is the database running? Try: make status$(RESET)"

# ─── Restore ──────────────────────────────────────────────────────────────────
.PHONY: restore
restore: _check-docker
	@echo "$(BOLD)Restore database from backup$(RESET)"
	@echo ""
	@read -p "Path to backup file (.sql.gz): " BACKUP_FILE; \
	if [ ! -f "$$BACKUP_FILE" ]; then \
		echo "$(RED)File not found: $$BACKUP_FILE$(RESET)"; exit 1; \
	fi; \
	echo "$(YELLOW)This will DROP and recreate the database. All current data will be lost.$(RESET)"; \
	read -p "Type YES to confirm: " CONFIRM; \
	if [ "$$CONFIRM" != "YES" ]; then \
		echo "Aborted."; exit 1; \
	fi; \
	echo "$(BOLD)Stopping application...$(RESET)"; \
	docker compose stop app; \
	echo "$(BOLD)Restoring from $$BACKUP_FILE...$(RESET)"; \
	docker compose exec -T db sh -c \
		"PGPASSWORD=$$POSTGRES_PASSWORD psql -U factoryflow -c 'DROP DATABASE IF EXISTS factoryflow; CREATE DATABASE factoryflow;'" && \
	gunzip -c "$$BACKUP_FILE" | docker compose exec -T db sh -c \
		"PGPASSWORD=$$POSTGRES_PASSWORD psql -U factoryflow factoryflow" && \
	echo "$(BOLD)Restarting application...$(RESET)"; \
	docker compose up -d app; \
	echo "$(GREEN)Restore complete.$(RESET)"

# ─── Reset (danger) ───────────────────────────────────────────────────────────
.PHONY: reset-data
reset-data: _check-docker
	@echo "$(RED)$(BOLD)WARNING: This will permanently delete all data.$(RESET)"
	@read -p "Type YES to confirm: " CONFIRM; \
	if [ "$$CONFIRM" != "YES" ]; then echo "Aborted."; exit 1; fi
	docker compose down -v
	rm -rf data/postgres data/backups
	mkdir -p data/postgres data/backups
	docker compose up -d
	@echo "$(GREEN)Data reset complete. Fresh database is running.$(RESET)"

# ─── Guards ───────────────────────────────────────────────────────────────────
.PHONY: _check-docker
_check-docker:
	@command -v docker > /dev/null 2>&1 || \
		(echo "$(RED)Docker is not installed. See https://docs.docker.com/get-docker/$(RESET)" && exit 1)
	@docker compose version > /dev/null 2>&1 || \
		(echo "$(RED)Docker Compose is not available. Ensure Docker Desktop is running.$(RESET)" && exit 1)

.PHONY: _check-env
_check-env:
	@if [ ! -f .env ]; then \
		echo "$(RED).env file not found. Run: make setup$(RESET)"; exit 1; \
	fi
