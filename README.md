<p align="center">
  <img alt="FuseScope" src="docs/brand/fusescope-logo-universal.svg" width="440">
</p>

<p align="center">
  <b>Open source observability for the FuseOne platform — traces, metrics and logs in one place.</b>
</p>

<p align="center">
  <a href="README.pt-br.md">Português</a> ·
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-0f5fb8"></a>
  <a href="https://github.com/fuseone-io/fusescope/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/fuseone-io/fusescope?color=950fb8"></a>
</p>

FuseScope is an OpenTelemetry-native observability platform: APM, distributed tracing, log management, metrics, dashboards and alerts on top of ClickHouse. It is built by [FuseOne](https://github.com/fuseone-io) as a hard fork of [SigNoz](https://github.com/SigNoz/signoz). The source code in this repository is **MIT licensed**, and the proprietary `ee/` code of SigNoz is not part of it.

## Features

Inherited from SigNoz and available today:

- **APM** — latency, error rate, throughput, Apdex, top operations, database and external calls per service.
- **Distributed tracing** — trace explorer, flame graphs and trace funnels.
- **Logs** — ingestion pipelines, live tail and a visual query builder correlated with traces.
- **Metrics and dashboards** — Query Builder, PromQL or ClickHouse SQL.
- **Infrastructure monitoring** — hosts and Kubernetes.
- **Alerts** — on metrics, traces, logs and exceptions, with Slack, PagerDuty, Opsgenie, Jira, MS Teams, webhook and email channels.
- **Exceptions, API monitoring, messaging queues (Kafka, Celery) and LLM observability.**
- **Tiered retention** — keep recent data on local disks and move older data to an S3-compatible bucket through a ClickHouse `tiered` storage policy.

Added by FuseScope:

- **PostgreSQL metastore** — run the backend on PostgreSQL (users, dashboards, alerts, authorization) for highly available, multi-replica deployments, or on SQLite for a single node. Upstream SigNoz only offered PostgreSQL in its proprietary edition; FuseScope's implementation is open source.
- **Single sign-on with OpenID Connect** — Microsoft Entra ID, Keycloak, Okta, Auth0, Google or any OIDC provider, with group → role mapping. Configure it in the UI or declare it in the configuration file (read-only in the UI, secrets from environment variables). Upstream SigNoz only offered OIDC in its proprietary edition.
- **No phone-home** — usage analytics and the stats reporter are off by default.

## Roadmap

FuseScope aims to cover the core of a commercial APM suite without lock-in.

Done: ~~rebranding to FuseScope~~, ~~PostgreSQL metastore~~, ~~SSO through OpenID Connect~~.

Next, in order:

1. Long-term archive: export data older than the hot window to Parquet in object storage, with rehydration back into ClickHouse ([#11](https://github.com/fuseone-io/fusescope/issues/11)).
2. Real User Monitoring and session replay ([#12](https://github.com/fuseone-io/fusescope/issues/12)).
3. SAML single sign-on ([#7](https://github.com/fuseone-io/fusescope/issues/7)).

The full list — anomaly detection, custom roles, synthetics, SLOs, profiling and more — is tracked in the [roadmap issues](https://github.com/fuseone-io/fusescope/issues?q=is%3Aopen+label%3Aroadmap).

## Getting started

FuseScope needs ClickHouse and the [FuseScope OpenTelemetry collector](https://github.com/fuseone-io/fusescope-otel-collector). Deploy them with the [FuseScope Helm charts](https://github.com/fuseone-io/fusescope-charts), or build from source:

```bash
# backend (Go 1.25)
make go-build-community        # → target/<os>-<arch>/fusescope

# frontend (Node 22, pnpm 10)
make js-build                  # → frontend/build

# container image
make docker-build-community    # → ghcr.io/fuseone-io/fusescope
```

### Metadata store

FuseScope keeps its metadata (users, dashboards, alert rules, authorization) in SQLite by default. Use PostgreSQL to run several backend replicas:

```yaml
sqlstore:
  provider: postgres
  postgres:
    dsn: postgres://fusescope:secret@postgres:5432/fusescope?sslmode=disable
```

or through the environment: `SIGNOZ_SQLSTORE_PROVIDER=postgres` and `SIGNOZ_SQLSTORE_POSTGRES_DSN=…`. With the Helm chart, `--set postgresql.enabled=true` deploys PostgreSQL and wires it in. See [`conf/example.yaml`](conf/example.yaml) for every option.

### Single sign-on

Add an OpenID Connect domain in *Settings → Single Sign-on*, or declare it in the configuration file:

```yaml
authdomain:
  domains:
    - name: example.com
      config:
        kind: oidc
        spec:
          issuer: https://login.microsoftonline.com/<tenant-id>/v2.0
          clientId: <application-id>
          clientSecret: ${FUSESCOPE_ENTRA_CLIENT_SECRET}
      role_mapping:
        defaultRole: VIEWER
        groupMappings:
          <group-id>: ADMIN
```

The redirect URI to register at the identity provider is `https://<fusescope-host>/api/v1/complete/oidc`. More examples (Keycloak, Okta) are in [`conf/example.yaml`](conf/example.yaml).

For a local development environment (ClickHouse + collector), see [docs/contributing/development.md](docs/contributing/development.md).

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the engineering rules in [CLAUDE.md](CLAUDE.md) (tests first, licence boundaries) before opening a PR, and report security issues as described in [SECURITY.md](SECURITY.md).

## Credits and license

FuseScope stands on the work of the [SigNoz](https://signoz.io) team and community, whose MIT-licensed code is the foundation of this project. "SigNoz" is a trademark of SigNoz Inc.; FuseScope is not affiliated with or endorsed by SigNoz Inc.

The source code in this repository is released under the [MIT License](LICENSE). The backend depends on Go packages from [fusescope-otel-collector](https://github.com/fuseone-io/fusescope-otel-collector), which is licensed under the **AGPL-3.0**; compiled FuseScope binaries and images therefore include AGPL-3.0 code and must be distributed in compliance with that license.
