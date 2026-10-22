# FuseScope demo

Single-host Docker Compose deployment of a public FuseScope demo with live sample data, behind Cloudflare.

| Service | Role | Limit |
|---|---|---|
| `clickhouse` (+ `zookeeper`, `init-clickhouse`) | telemetry store, 3-day retention | 4.5 GiB, 2 CPU (+384 MiB, 0.2) |
| `telemetrystore-migrator` | creates/migrates the schema, then exits | 256 MiB, 0.25 |
| `otel-collector` | OTLP receiver, internal only | 384 MiB, 0.3 |
| `fusescope` | API, web UI, RUM gateway (SQLite) | 768 MiB, 0.5 |
| `caddy` | TLS on host port 8443, the only published port | 128 MiB, 0.2 |
| `hotrod`, `hotrod-load` | traced sample app and a slow load loop | 128 + 32 MiB |
| `logs-*`, `traces-payment-errors` | telemetrygen logs and error spans | 48 MiB each |
| `rum-sample`, `rum-driver` | page using `@fusescope/browser`, driven by headless Chromium | 96 + 640 MiB |

The collector has no auth, so OTLP (`/v1/*`) is not exposed. Browsers send to `/rum/v1/*`, which FuseScope
serves with per-application keys and allowed origins.

## Install

On the host, as root, copy this directory to `/opt/fusescope`, then:

```bash
cp .env.example .env    # set FUSESCOPE_HOST, FUSESCOPE_URL, ADMIN_EMAIL, DEMO_EMAIL
./install.sh 0.151.0
```

`install.sh` is safe to re-run. It:

1. generates `JWT_SECRET` in `.env` (mode 600);
2. runs `firewall/apply.sh`: an nftables table `inet fusescope_demo` that drops the Caddy port unless the
   source is a Cloudflare range, hooked before Docker's DNAT, and restored at boot by
   `fusescope-demo-firewall.service`;
3. starts the store and backend, then `bootstrap.sh` registers the admin (which closes self sign-up), creates the
   demo Viewer without email (invite, then a reset-password token), sets 3-day retention and creates the RUM
   application;
4. starts Caddy and the generators.

Passwords are written only to `credentials.txt` (mode 600).

## Update

```bash
./update.sh 0.152.0
```

## TLS

`FUSESCOPE_TLS=internal` serves a self-signed certificate (Cloudflare SSL mode "Full"). For "Full (strict)",
put the Cloudflare Origin CA certificate in `certs/origin.pem` and `certs/origin.key` (mode 600), set
`FUSESCOPE_TLS=origin` and run `docker compose up -d caddy`.

Caddy trusts `CF-Connecting-IP` only from Cloudflare ranges and forwards it as `X-Forwarded-For`, which the RUM
rate limiter reads (`rum.ratelimit.trust_forwarded_for`). Re-run `firewall/apply.sh` and restart Caddy to
refresh the ranges.
