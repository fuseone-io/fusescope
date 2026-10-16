<p align="center">
  <img alt="FuseScope" src="docs/brand/fusescope-logo-universal.svg" width="440">
</p>

<p align="center">
  <b>Observabilidade open source da plataforma FuseOne: traces, métricas e logs num só lugar.</b>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="LICENSE"><img alt="Licença: MIT" src="https://img.shields.io/badge/license-MIT-0f5fb8"></a>
  <a href="https://github.com/fuseone-io/fusescope/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/fuseone-io/fusescope?color=950fb8"></a>
</p>

O FuseScope é uma plataforma de observabilidade nativa de OpenTelemetry: APM, tracing distribuído, gestão de logs, métricas, dashboards e alertas sobre ClickHouse. É desenvolvido pela [FuseOne](https://github.com/fuseone-io) como um hard fork do [SigNoz](https://github.com/SigNoz/signoz). O código-fonte deste repositório é **licenciado sob MIT**, e o código proprietário `ee/` do SigNoz não faz parte dele.

## Funcionalidades

Herdadas do SigNoz e disponíveis hoje:

- **APM**: latência, taxa de erro, throughput, Apdex, principais operações, chamadas a banco e a serviços externos.
- **Tracing distribuído**: explorer de traces, flame graphs e funis de traces.
- **Logs**: pipelines de ingestão, live tail e query builder visual, correlacionados com traces.
- **Métricas e dashboards**: Query Builder, PromQL ou SQL do ClickHouse.
- **Monitoramento de infraestrutura**: hosts e Kubernetes.
- **Alertas**: sobre métricas, traces, logs e exceções, com canais Slack, PagerDuty, Opsgenie, Jira, MS Teams, webhook e e-mail.
- **Exceções, monitoramento de APIs, filas de mensagens (Kafka, Celery) e observabilidade de LLMs.**
- **Retenção em camadas**: dados recentes em disco local e dados mais antigos num bucket compatível com S3, via storage policy `tiered` do ClickHouse.

## Roadmap

O objetivo do FuseScope é cobrir o essencial de uma suíte comercial de APM, sem lock-in. Planejado, nesta ordem:

1. Rebranding para FuseScope *(em andamento)*.
2. Metastore em PostgreSQL para implantações em alta disponibilidade.
3. SSO via OIDC (por exemplo, Keycloak).
4. Arquivo de longo prazo: exportar dados além da janela quente para Parquet em object storage, com reidratação de volta no ClickHouse.
5. Real User Monitoring e session replay.

## Primeiros passos

O FuseScope precisa do ClickHouse e do [coletor OpenTelemetry do FuseScope](https://github.com/fuseone-io/fusescope-otel-collector). Implante com os [charts Helm do FuseScope](https://github.com/fuseone-io/fusescope-charts) ou compile a partir do código-fonte:

```bash
# backend (Go 1.25)
make go-build-community        # → target/<os>-<arch>/fusescope

# frontend (Node 22, pnpm 10)
make js-build                  # → frontend/build

# imagem de container
make docker-build-community    # → ghcr.io/fuseone-io/fusescope
```

Para um ambiente local de desenvolvimento (ClickHouse + coletor), veja [docs/contributing/development.md](docs/contributing/development.md).

## Contribuindo

Issues e pull requests são bem-vindos. Leia o [CONTRIBUTING.md](CONTRIBUTING.md) antes de abrir um PR e reporte problemas de segurança como descrito no [SECURITY.md](SECURITY.md).

## Créditos e licença

O FuseScope se apoia no trabalho do time e da comunidade do [SigNoz](https://signoz.io), cujo código sob licença MIT é a base deste projeto. "SigNoz" é marca da SigNoz Inc.; o FuseScope não é afiliado nem endossado pela SigNoz Inc.

O código-fonte deste repositório é distribuído sob a [Licença MIT](LICENSE). O backend depende de pacotes Go do [fusescope-otel-collector](https://github.com/fuseone-io/fusescope-otel-collector), licenciado sob **AGPL-3.0**; por isso, os binários e imagens compilados do FuseScope incluem código AGPL-3.0 e devem ser distribuídos em conformidade com essa licença.
