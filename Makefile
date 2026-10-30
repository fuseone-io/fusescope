##############################################################
# variables
##############################################################
SHELL                   := /bin/bash
SRC						?= $(shell pwd)
NAME					?= fusescope
OS                      ?= $(shell uname -s | tr '[A-Z]' '[a-z]')
ARCH                    ?= $(shell uname -m | sed 's/x86_64/amd64/g' | sed 's/aarch64/arm64/g')
COMMIT_SHORT_SHA        ?= $(shell git rev-parse --short HEAD)
BRANCH_NAME             ?= $(subst /,-,$(shell git rev-parse --abbrev-ref HEAD))
VERSION                 ?= $(BRANCH_NAME)-$(COMMIT_SHORT_SHA)
TIMESTAMP               ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
ARCHS					?= amd64 arm64
TARGET_DIR              ?= $(shell pwd)/target

GO_BUILD_VERSION_LDFLAGS 		= -X github.com/fuseone-io/fusescope/pkg/version.version=$(VERSION) -X github.com/fuseone-io/fusescope/pkg/version.hash=$(COMMIT_SHORT_SHA) -X github.com/fuseone-io/fusescope/pkg/version.time=$(TIMESTAMP) -X github.com/fuseone-io/fusescope/pkg/version.branch=$(BRANCH_NAME)
GO_BUILD_ARCHS_COMMUNITY 		= $(addprefix go-build-community-,$(ARCHS))
GO_BUILD_CONTEXT_COMMUNITY 		= $(SRC)/cmd/community
GO_BUILD_LDFLAGS_COMMUNITY 		= $(GO_BUILD_VERSION_LDFLAGS) -X github.com/fuseone-io/fusescope/pkg/version.variant=community

DOCKER_BUILD_ARCHS_COMMUNITY 	= $(addprefix docker-build-community-,$(ARCHS))
DOCKERFILE_COMMUNITY 			= $(SRC)/cmd/community/Dockerfile
DOCKER_REGISTRY_COMMUNITY 		?= ghcr.io/fuseone-io/fusescope
JS_BUILD_CONTEXT 				= $(SRC)/frontend

##############################################################
# directories
##############################################################
$(TARGET_DIR):
	mkdir -p $(TARGET_DIR)

##############################################################
# common commands
##############################################################
.PHONY: help
help: ## Displays help.
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-z0-9A-Z_-]+:.*?##/ { printf "  \033[36m%-40s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

##############################################################
# devenv commands
##############################################################
.PHONY: devenv-clickhouse
devenv-clickhouse: ## Run clickhouse in devenv
	@cd .devenv/docker/clickhouse; \
	docker compose -f compose.yaml up -d

.PHONY: devenv-postgres
devenv-postgres: ## Run postgres in devenv
	@cd .devenv/docker/postgres; \
	docker compose -f compose.yaml up -d

.PHONY: devenv-fusescope-otel-collector
devenv-fusescope-otel-collector: ## Run fusescope-otel-collector in devenv (requires clickhouse to be running)
	@cd .devenv/docker/fusescope-otel-collector; \
	docker compose -f compose.yaml up -d

.PHONY: devenv-up
devenv-up: devenv-clickhouse devenv-fusescope-otel-collector ## Start both clickhouse and fusescope-otel-collector for local development
	@echo "Development environment is ready!"
	@echo "   - ClickHouse: http://localhost:8123"
	@echo "   - Signoz OTel Collector: grpc://localhost:4317, http://localhost:4318"

DEVENV_COMPOSE := docker compose -f .devenv/docker/compose.yaml
DEVENV_TMP     := .devenv/tmp
DEV_UI_PORT    ?= 3301
DEV_EMAIL      ?= admin@fusescope.local
DEV_PASSWORD   ?= FuseScope-dev-1

.PHONY: dev
dev: ## Start ClickHouse, collector, backend and sample telemetry in containers, plus the frontend dev server
	@$(DEVENV_COMPOSE) up -d
	@printf "Waiting for the backend"; \
	for i in $$(seq 1 90); do \
		curl -sf -o /dev/null localhost:8080/api/v1/health && break; \
		printf "."; sleep 2; \
	done; echo; \
	curl -sf -o /dev/null localhost:8080/api/v1/health || { echo "Backend not healthy: $(DEVENV_COMPOSE) logs fusescope"; exit 1; }
	@curl -sf -o /dev/null -X POST localhost:8080/api/v1/register -H 'Content-Type: application/json' \
		-d '{"name":"Admin","email":"$(DEV_EMAIL)","password":"$(DEV_PASSWORD)","orgDisplayName":"FuseScope Dev","orgName":"fusescope-dev"}' || true
	@mkdir -p $(DEVENV_TMP)
	@[ -d frontend/node_modules ] || (cd frontend && npx -y pnpm@10 install)
	@if lsof -ti tcp:$(DEV_UI_PORT) >/dev/null; then \
		echo "Port $(DEV_UI_PORT) busy; frontend dev server not started."; \
	else \
		(cd frontend && VITE_FRONTEND_API_ENDPOINT=http://localhost:8080 exec npx -y pnpm@10 dev --port $(DEV_UI_PORT) --strictPort) > $(DEVENV_TMP)/frontend.log 2>&1 < /dev/null & \
		for i in $$(seq 1 30); do \
			curl -s -o /dev/null localhost:$(DEV_UI_PORT) && break; \
			grep -q "error when starting" $(DEVENV_TMP)/frontend.log 2>/dev/null && break; \
			sleep 1; \
		done; \
		curl -s -o /dev/null localhost:$(DEV_UI_PORT) || { tail -5 $(DEVENV_TMP)/frontend.log; exit 1; }; \
	fi
	@echo "FuseScope dev environment:"
	@echo "   - UI:      http://localhost:$(DEV_UI_PORT) ($(DEV_EMAIL) / $(DEV_PASSWORD))"
	@echo "   - API:     http://localhost:8080"
	@echo "   - OTLP:    grpc://localhost:4317, http://localhost:4318"
	@echo "   - UI logs: $(DEVENV_TMP)/frontend.log"

.PHONY: stop
stop: ## Stop everything started by make dev, keeping data
	@PIDS=$$(lsof -ti tcp:$(DEV_UI_PORT)); [ -z "$$PIDS" ] || kill $$PIDS
	@$(DEVENV_COMPOSE) down

.PHONY: dev-clean
dev-clean: stop ## Stop the dev environment and delete its data
	@$(DEVENV_COMPOSE) down -v

.PHONY: devenv-clickhouse-clean
devenv-clickhouse-clean: ## Clean all ClickHouse data from filesystem
	@echo "Removing ClickHouse data..."
	@cd .devenv/docker/clickhouse; docker compose -f compose.yaml down -v
	@echo "ClickHouse data cleaned!"

##############################################################
# go commands
##############################################################
SIGNOZ_SQLSTORE_SQLITE_PATH ?= signoz.db
SIGNOZ_APISERVER_ADDRESS    ?= 0.0.0.0:8080


.PHONY: go-test
go-test: ## Runs go unit tests
	@go test -race ./...

.PHONY: go-run-community
go-run-community: ## Runs the community go backend server
	@SIGNOZ_INSTRUMENTATION_LOGS_LEVEL=debug \
	SIGNOZ_SQLSTORE_SQLITE_PATH=$(SIGNOZ_SQLSTORE_SQLITE_PATH) \
	SIGNOZ_WEB_ENABLED=false \
	SIGNOZ_TOKENIZER_JWT_SECRET=secret \
	SIGNOZ_ALERTMANAGER_PROVIDER=signoz \
	SIGNOZ_TELEMETRYSTORE_PROVIDER=clickhouse \
	SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_DSN=tcp://127.0.0.1:9000 \
	SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_CLUSTER=cluster \
	go run -race \
		$(GO_BUILD_CONTEXT_COMMUNITY)/*.go server

.PHONY: go-stop
go-stop: ## Stops the go backend server listening on SIGNOZ_APISERVER_ADDRESS, waiting for it to release every port it holds
	@PORT=$(lastword $(subst :, ,$(SIGNOZ_APISERVER_ADDRESS))); \
	PIDS=$$(lsof -ti tcp:$$PORT); \
	if [ -z "$$PIDS" ]; then \
		echo "No signoz server running on port $$PORT."; \
		echo "If it's running on a different port, rerun as: make go-stop SIGNOZ_APISERVER_ADDRESS=host:port"; \
		exit 0; \
	fi; \
	kill $$PIDS 2>/dev/null; \
	for i in $$(seq 1 10); do \
		alive=$$(for p in $$PIDS; do kill -0 $$p 2>/dev/null && echo $$p; done); \
		[ -z "$$alive" ] && break; \
		sleep 1; \
	done; \
	alive=$$(for p in $$PIDS; do kill -0 $$p 2>/dev/null && echo $$p; done); \
	if [ -n "$$alive" ]; then \
		echo "Graceful shutdown did not finish in 10s, sending SIGKILL to $$alive"; \
		kill -9 $$alive 2>/dev/null; \
	fi; \
	echo "Stopped signoz server on port $$PORT (pid $$PIDS)"

.PHONY: go-build-community $(GO_BUILD_ARCHS_COMMUNITY)
go-build-community: ## Builds the go backend server for community
go-build-community: $(GO_BUILD_ARCHS_COMMUNITY)
$(GO_BUILD_ARCHS_COMMUNITY): go-build-community-%: $(TARGET_DIR)
	@mkdir -p $(TARGET_DIR)/$(OS)-$*
	@echo ">> building binary $(TARGET_DIR)/$(OS)-$*/$(NAME)"
	@if [ $* = "arm64" ]; then \
		GOARCH=$* GOOS=$(OS) go build -C $(GO_BUILD_CONTEXT_COMMUNITY) -tags timetzdata -o $(TARGET_DIR)/$(OS)-$*/$(NAME) -ldflags "-s -w $(GO_BUILD_LDFLAGS_COMMUNITY)"; \
	else \
		GOARCH=$* GOOS=$(OS) go build -C $(GO_BUILD_CONTEXT_COMMUNITY) -tags timetzdata -o $(TARGET_DIR)/$(OS)-$*/$(NAME) -ldflags "-s -w $(GO_BUILD_LDFLAGS_COMMUNITY)"; \
	fi




##############################################################
# js commands
##############################################################
.PHONY: js-build
js-build: ## Builds the js frontend
	@echo ">> building js frontend"
	@cd $(JS_BUILD_CONTEXT) && CI=1 pnpm install && pnpm build

##############################################################
# docker commands
##############################################################
.PHONY: docker-build-community $(DOCKER_BUILD_ARCHS_COMMUNITY)
docker-build-community: ## Builds the docker image for community
docker-build-community: $(DOCKER_BUILD_ARCHS_COMMUNITY)
$(DOCKER_BUILD_ARCHS_COMMUNITY): docker-build-community-%: go-build-community-% js-build
	@echo ">> building docker image for $(NAME)"
	@docker build -t "$(DOCKER_REGISTRY_COMMUNITY):$(VERSION)-$*" \
		--build-arg TARGETARCH="$*" \
		-f $(DOCKERFILE_COMMUNITY) $(SRC)

.PHONY: docker-buildx-community
docker-buildx-community: ## Builds the docker image for community using buildx
docker-buildx-community: go-build-community js-build
	@echo ">> building docker image for $(NAME)"
	@docker buildx build --file $(DOCKERFILE_COMMUNITY) \
		--progress plain \
		--platform linux/arm64,linux/amd64 \
		--push \
		--tag $(DOCKER_REGISTRY_COMMUNITY):$(VERSION) $(SRC)



##############################################################
# python commands
##############################################################
.PHONY: py-fmt
py-fmt: ## Run ruff format across the shared tests project
	@cd tests && uv run ruff format .

.PHONY: py-lint
py-lint: ## Run ruff check across the shared tests project
	@cd tests && uv run ruff check --fix .

.PHONY: py-test-setup
py-test-setup: ## Bring up the shared SigNoz backend used by integration and e2e tests, rebuilding signoz from the current sources
	@cd tests && uv run pytest --basetemp=./tmp/ -vv --reuse --rebuild --capture=no integration/bootstrap/setup.py::test_setup

.PHONY: py-test-teardown
py-test-teardown: ## Tear down the shared SigNoz backend
	@cd tests && uv run pytest --basetemp=./tmp/ -vv --teardown --capture=no  integration/bootstrap/setup.py::test_teardown

.PHONY: py-test
py-test: ## Runs integration tests
	@cd tests && uv run pytest --basetemp=./tmp/ -vv --capture=no integration/tests/

.PHONY: py-clean
py-clean: ## Clear all pycache and pytest cache from tests directory recursively
	@echo ">> cleaning python cache files from tests directory"
	@find tests -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	@find tests -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	@find tests -type f -name "*.pyc" -delete 2>/dev/null || true
	@find tests -type f -name "*.pyo" -delete 2>/dev/null || true
	@echo ">> python cache cleaned"


##############################################################
# generate commands
##############################################################
.PHONY: semconv-generate
semconv-generate: ## Regenerate semantic-convention families for Go and TypeScript
	@go run ./scripts/semconv

.PHONY: semconv-check
semconv-check: ## Fail if the generated semantic-convention files are stale
	@go run ./scripts/semconv -check

.PHONY: integrations-catalog
integrations-catalog: ## Fetch and verify the pinned integration catalog release (CATALOG_VERSION=vX.Y.Z moves the pin, COSIGN=path uses a local cosign)
	@go run ./scripts/integrationscatalog $(if $(CATALOG_VERSION),-version $(CATALOG_VERSION)) $(if $(COSIGN),-cosign $(COSIGN))

.PHONY: rum-browser-sdk
rum-browser-sdk: ## Fetch and verify the pinned @fusescope/browser bundle the backend serves (SDK_VERSION=x.y.z moves the pin)
	@go run ./scripts/rumbrowsersdk $(if $(SDK_VERSION),-version $(SDK_VERSION))

.PHONY: agpl-check
agpl-check: ## Fail if the community binary links any AGPL collector package
	@go run ./scripts/agplguard

.PHONY: gen-mocks
gen-mocks:
	@echo ">> Generating mocks"
	@mockery --config .mockery.yml

.PHONY: gen-openapi-specs
gen-openapi-specs:
	@go run ./cmd/community generate openapi
	cd frontend && pnpm generate:api && cd -
