# FuseScope demo

Single-host Docker Compose deployment of a public FuseScope demo with live sample data, behind Cloudflare.

| Service | Role | Limit |
|---|---|---|
| `clickhouse` (+ `zookeeper`, `init-clickhouse`) | telemetry store, 3-day retention | 4.5 GiB, 2 CPU (+384 MiB, 0.2) |
| `telemetrystore-migrator` | `fusescope-schema migrate`: creates or migrates the schema, then exits | 256 MiB, 0.25 |
| `fusescope-collector` | OTLP (internal only), RUM (`/rum/v1/traces`, `/rum/v1/logs`) and host metrics | 768 MiB, 0.5 |
| `fusescope` | API, web UI, browser SDK, ingest policy for the collector (SQLite) | 768 MiB, 0.5 |
| `caddy` | TLS on host port 8443, the only published port | 128 MiB, 0.2 |
| `hotrod`, `hotrod-load` | traced sample app and a slow load loop | 128 + 32 MiB |
| `logs-*`, `traces-payment-errors` | telemetrygen logs and error spans | 48 MiB each |
| `rum-sample`, `rum-react-sample`, `rum-driver` | a plain and a React page using `@fusescope/browser`, driven by headless Chromium | 96 + 96 + 640 MiB |

OTLP (`/v1/*`) has no auth, so it is not exposed. Browsers send RUM to `/rum/v1/traces` and `/rum/v1/logs`, which
Caddy proxies to the collector's TLS listener; the collector checks each request's key and origin against the ingest
policy FuseScope publishes to it over OpAMP (`fusescope:4321`, TLS 1.3, bearer token). The token and both
certificates, from a CA of the demo's own, are generated once into `ingest/`.

The kit runs no image of the earlier collector (`fusescope-otel-collector`): `fusescope-collector` receives and
writes, and `fusescope-schema`, from the same image, creates and migrates the schema. On a schema the earlier
collector's migrator created, `fusescope-schema` adopts it and applies its own migrations, after which the earlier
migrator refuses it; there is no going back (collector-server `deploy/shadow/CUTOVER.md` §8).

The collector mounts the host root read-only at `/hostfs` and shares the host's UTS namespace, so the host appears in
Infrastructure › Hosts under its own hostname. Network metrics are not collected: from a bridged container they would
describe the collector's network namespace, not the host's.

## Install

On the host, as root, copy this directory to `/opt/fusescope`, then:

```bash
cp .env.example .env    # set FUSESCOPE_HOST, FUSESCOPE_URL, ADMIN_EMAIL, DEMO_EMAIL
./install.sh 0.151.0
```

`install.sh` is safe to re-run. It:

1. generates `JWT_SECRET` in `.env` (mode 600), and the ingest token and certificates in `ingest/`;
2. runs `firewall/apply.sh`: an nftables table `inet fusescope_demo` that drops the Caddy port unless the
   source is a Cloudflare range, hooked before Docker's DNAT, and restored at boot by
   `fusescope-demo-firewall.service`;
3. starts the store and backend, then `bootstrap.sh` registers the admin (which closes self sign-up), creates the
   demo Viewer without email (invite, then a reset-password token), sets 3-day retention and creates the two RUM
   applications;
4. starts Caddy and the generators.

Passwords are written only to `credentials.txt` (mode 600).

## Update

```bash
./update.sh 0.159.0
```

From an install older than 0.159.0, which ingested RUM in the backend, `update.sh` also creates `ingest/` and points
`RUM_ENDPOINT` at `FUSESCOPE_URL`; the old `otel-collector` is removed as an orphan.

`fusescope-schema` keeps its history in KeeperMap tables, which ClickHouse enables only with `keeper_map_path_prefix`
(`clickhouse/config.d/zz-keeper-map.xml`), read at its startup. Before the migrator runs, `install.sh` and `update.sh`
(`ensure_keeper_map` in `lib.sh`) start ClickHouse, recreate it when the running server lacks the value (an install
from before the setting), and stop if it still does: the migrator, the collector and the backend then stay as they
were.

The first update that runs `fusescope-schema` on a schema the earlier collector's migrator created adopts it and
applies `0002`: one way only. Take a backup of the ClickHouse and ZooKeeper volumes first (collector-server
`deploy/shadow/CUTOVER.md` §8). `test/schema-update.sh` runs that update on a throwaway project, from the kit at an
earlier commit, without touching the demo:

```bash
test/schema-update.sh            # needs Docker and network access to pull the images
```

## TLS

`FUSESCOPE_TLS=internal` serves a self-signed certificate (Cloudflare SSL mode "Full"). For "Full (strict)",
put the Cloudflare Origin CA certificate in `certs/origin.pem` and `certs/origin.key` (mode 600), set
`FUSESCOPE_TLS=origin` and run `docker compose up -d caddy`.

Caddy trusts `CF-Connecting-IP` only from Cloudflare ranges and forwards it as `X-Forwarded-For`, which the
collector's RUM rate limiter and the public dashboards' limiter (`dashboard.public.ratelimit.trust_forwarded_for`)
read. Re-run `firewall/apply.sh` and restart Caddy to
refresh the ranges.
