SHELL := /bin/bash
GO ?= go

.PHONY: help test test-domain test-api cover web build run test-db fmt vet lint clean

help: ## list targets
	@grep -hE '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*##' '{printf "  %-14s %s\n", $$1, $$2}'

test: test-domain test-api ## all tests that need no database

test-domain: ## pure logic: duration, distance, rules, state machine
	$(GO) test ./internal/domain/... -count=1 -v

test-api: ## HTTP handlers against the in-memory repository
	$(GO) test ./internal/api/... -count=1

cover: ## coverage report for the domain package
	$(GO) test ./internal/domain/... -coverprofile=coverage.out -covermode=atomic
	$(GO) tool cover -func=coverage.out | tail -12

web: ## typecheck and bundle the TypeScript frontend
	cd web && npm ci --silent && npm run typecheck && npm run build

build: web ## compile the server with the frontend embedded
	$(GO) build -trimpath -ldflags "-s -w" -o bin/server ./cmd/server

run: build ## run locally against $POSTGRES_DSN
	./bin/server

test-db: ## schema and repository tests against a real database (needs POSTGRES_TEST_DSN)
	$(GO) test ./internal/store/... -count=1 -v

fmt: ## gofmt the tree
	$(GO) fmt ./...

vet: ## static checks
	$(GO) vet ./...

lint: fmt vet ## everything CI runs before tests

clean:
	rm -rf bin web/dist coverage.out
