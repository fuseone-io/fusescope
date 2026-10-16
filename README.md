<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/fusescope-logo-white.svg" width="420">
    <source media="(prefers-color-scheme: light)" srcset="docs/brand/fusescope-logo.svg" width="420">
    <img alt="FuseScope" src="docs/brand/fusescope-logo.svg" width="420">
  </picture>
</p>

<p align="center">
  <b>Open source observability for the FuseOne platform — traces, metrics and logs in one place.</b>
</p>

<p align="center">
  <a href="README.pt-br.md">Português</a> ·
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-0f5fb8"></a>
  <a href="https://github.com/fuseone-io/fusescope/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/fuseone-io/fusescope?color=950fb8"></a>
</p>

FuseScope is an OpenTelemetry-native observability platform: APM, distributed tracing, log management, metrics, dashboards and alerts on top of ClickHouse. It is built by [FuseOne](https://github.com/fuseone-io) as a hard fork of [SigNoz](https://github.com/SigNoz/signoz) and is **100% MIT licensed** — the proprietary `ee/` code of SigNoz is not part of this repository.

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

## Roadmap

FuseScope aims to cover the core of a commercial APM suite without lock-in. Planned, in order:

1. Rebranding to FuseScope *(in progress)*.
2. PostgreSQL metastore for highly available deployments.
3. SSO through OIDC (e.g. Keycloak).
4. Long-term archive: export data older than the hot window to Parquet in object storage, with rehydration back into ClickHouse.
5. Real User Monitoring and session replay.

## Getting started

FuseScope needs ClickHouse and the FuseScope OpenTelemetry collector (a fork of `signoz-otel-collector`, coming soon). Until the FuseOne Helm charts are published, build from source:

```bash
# backend (Go 1.25)
make go-build-community        # → target/<os>-<arch>/fusescope

# frontend (Node 22, pnpm 10)
make js-build                  # → frontend/build

# container image
make docker-build-community    # → ghcr.io/fuseone-io/fusescope
```

For a local development environment (ClickHouse + collector), see [docs/contributing/development.md](docs/contributing/development.md).

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR, and report security issues as described in [SECURITY.md](SECURITY.md).

## Credits and license

FuseScope stands on the work of the [SigNoz](https://signoz.io) team and community, whose MIT-licensed code is the foundation of this project. "SigNoz" is a trademark of SigNoz Inc.; FuseScope is not affiliated with or endorsed by SigNoz Inc.

Released under the [MIT License](LICENSE).
