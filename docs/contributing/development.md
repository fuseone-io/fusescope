# Development Guide

This guide sets up a local FuseScope: ClickHouse, the collector, the backend and the frontend.

## What do I need?

| Tool | Version | Notes |
|---|---|---|
| Go | 1.25.14 | Run Go commands with `GOTOOLCHAIN=go1.25.14`; newer Go versions break `bytedance/sonic` |
| Node | 22 ([`frontend/.nvmrc`](../../frontend/.nvmrc)) | nvm, mise or fnm |
| pnpm | 10 | Always `npx pnpm@10 …`; the repo rejects pnpm 11 |
| Docker | with BuildKit (`docker buildx`) | ClickHouse, PostgreSQL and the test containers |
| uv + Python 3.13 | | Integration and e2e tests |
| golangci-lint | v2 | v1 refuses the repo's config |
| gh | | Issues and PRs from the terminal |

> **Tip**: `make help` lists every target.

### macOS with Colima

The default Colima VM (2 CPUs, 4 GiB) can't run ClickHouse, the collector, the backend and PostgreSQL together. Give it more and use Apple's virtualization:

```bash
colima stop && colima start --cpu 6 --memory 12 --vm-type vz --mount-type virtiofs
```

Homebrew's Docker CLI ships without BuildKit, which the image builds need:

```bash
brew install docker-buildx
mkdir -p ~/.docker/cli-plugins
ln -sfn "$(brew --prefix)/opt/docker-buildx/bin/docker-buildx" ~/.docker/cli-plugins/docker-buildx
```

`psycopg2` (integration tests) builds from source and needs `pg_config` and OpenSSL:

```bash
brew install libpq openssl@3
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
export LDFLAGS="-L/opt/homebrew/opt/openssl@3/lib" CPPFLAGS="-I/opt/homebrew/opt/openssl@3/include"
```

Put the exports in your shell profile, then `cd tests && uv sync`.

## How do I get the code?

1. Open your terminal
2. Clone the repository:
   ```bash
   git clone https://github.com/fuseone-io/fusescope.git
   ```
3. Navigate to the project:
   ```bash
   cd fusescope
   ```

## How do I run it locally?

FuseScope has three main components: ClickHouse, the backend and the frontend.

### 1. Setting up ClickHouse

First, we need to get ClickHouse running:

```bash
make devenv-clickhouse
```

This command:
- Starts ClickHouse in a single-shard, single-replica cluster
- Sets up Zookeeper
- Runs the latest schema migrations

### 2. Setting up the FuseScope OpenTelemetry Collector

Next, start the OpenTelemetry Collector to receive telemetry data:

```bash
make devenv-fusescope-otel-collector
```

This command:
- Starts the FuseScope OpenTelemetry Collector
- Listens on port 4317 (gRPC) and 4318 (HTTP) for incoming telemetry data
- Forwards data to ClickHouse for storage

> **Quick setup**: Use `make devenv-up` to start both ClickHouse and OTel Collector together

### 3. Starting the Backend

1. Run the backend server:
   ```bash
   make go-run-community
   ```

2. Verify it's working:
   ```bash
   curl http://localhost:8080/api/v1/health
   ```

   You should see: `{"status":"ok"}`

3. Stop it when you're done:
   ```bash
   make go-stop
   ```

> **Tip**: The API server runs at `http://localhost:8080/` by default. You can configure this using `apiserver.address` configuration option. See
> [running more than one instance](#how-do-i-run-more-than-one-instance) if you need that for agentic testing.

### 4. Setting up the Frontend

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npx pnpm@10 install
   ```

3. Create a `.env` file in this directory:
   ```env
   VITE_FRONTEND_API_ENDPOINT=http://localhost:8080
   ```

4. Start the development server:
   ```bash
   npx pnpm@10 dev
   ```

> **Tip**: the dev server reloads on every change.

## Verifying Your Setup
To verify everything is working correctly:

1. **Check ClickHouse**: `curl http://localhost:8123/ping` (should return "Ok.")
2. **Check OTel Collector**: `curl http://localhost:13133` (should return health status)
3. **Check Backend**: `curl http://localhost:8080/api/v1/health` (should return `{"status":"ok"}`)
4. **Check Frontend**: Open `http://localhost:3301` in your browser

## How do I run more than one instance?

Handy when you keep several branches checked out as separate git worktrees. Every port
and path below is read from the environment, so set them on the `make` call:

```bash
SIGNOZ_APISERVER_ADDRESS=0.0.0.0:8081 \
SIGNOZ_SQLSTORE_SQLITE_PATH=/path/to/main/sqlite.db \
SIGNOZ_INSTRUMENTATION_METRICS_READERS_PULL_EXPORTER_PROMETHEUS_PORT=9091 \
make go-run-community
```

| Variable | Default | Why you'd change it |
| --- | --- | --- |
| `SIGNOZ_APISERVER_ADDRESS` | `0.0.0.0:8080` | Address the API server listens on |
| `SIGNOZ_SQLSTORE_SQLITE_PATH` | `signoz.db` in worktree | To reuse same database |
| `SIGNOZ_INSTRUMENTATION_METRICS_READERS_PULL_EXPORTER_PROMETHEUS_PORT` | `9090` | Bound by the Prometheus metrics exporter on startup |

Point the frontend at whichever backend you want, in `frontend/.env`:

```env
VITE_FRONTEND_API_ENDPOINT=http://localhost:8081
```

Stop an instance using the address it was started on:

```bash
make go-stop SIGNOZ_APISERVER_ADDRESS=0.0.0.0:8081
```

## How to send test data?

Send telemetry to your local FuseScope:

- **OTLP gRPC**: `localhost:4317`
- **OTLP HTTP**: `localhost:4318`

For example, using `curl` to send a test trace:
```bash
curl -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"test-service"}}]},"scopeSpans":[{"spans":[{"traceId":"12345678901234567890123456789012","spanId":"1234567890123456","name":"test-span","startTimeUnixNano":"1609459200000000000","endTimeUnixNano":"1609459201000000000"}]}]}]}'
```
