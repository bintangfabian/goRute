-include .env
export

RAW_DIR := data/raw

.DEFAULT_GOAL := help
.PHONY: help install api web test check gen-api fetch-gtfs fetch-osm otp-build otp-up db-up down

help: ## Tampilkan daftar perintah
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-11s\033[0m %s\n", $$1, $$2}'

install: ## Install dependency web & backend
	cd web && pnpm install
	cd backend && go mod download

api: ## Jalankan API Go di :8080
	cd backend && go run ./cmd/api

web: ## Jalankan web app (Vite) di :5173
	cd web && pnpm dev

test: ## Jalankan test backend
	cd backend && go test ./...

check: ## Vet + test backend, lint + build web
	cd backend && go vet ./... && go test ./...
	cd web && pnpm lint && pnpm build

gen-api: ## Generate tipe TypeScript dari backend/api/openapi.yaml
	cd web && pnpm gen:api

fetch-gtfs: ## Unduh GTFS TransJakarta ke data/raw
	cd backend && go run ./cmd/pipeline fetch -out ../$(RAW_DIR)

fetch-osm: ## Unduh OSM Jawa & potong ke Jabodetabek (butuh osmium)
	RAW_DIR=$(RAW_DIR) ./scripts/fetch-osm.sh

otp-build: ## Build graph OTP dari GTFS + OSM (butuh Docker)
	cp $(RAW_DIR)/transjakarta-gtfs.zip $(RAW_DIR)/jabodetabek.osm.pbf otp/
	docker compose --profile build run --rm otp-build

otp-up: ## Jalankan OTP di :8081
	docker compose up -d otp

db-up: ## Jalankan PostgreSQL + PostGIS di :5432
	docker compose up -d db

down: ## Matikan semua container
	docker compose down
