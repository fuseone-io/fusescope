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

Adicionadas pelo FuseScope:

- **Metastore em PostgreSQL**: o backend roda sobre PostgreSQL (usuários, dashboards, alertas, autorização) em implantações com várias réplicas e alta disponibilidade, ou sobre SQLite num único nó. No SigNoz original o PostgreSQL só existia na edição proprietária; a implementação do FuseScope é open source.
- **Single sign-on com OpenID Connect**: Microsoft Entra ID, Keycloak, Okta, Auth0, Google ou qualquer provedor OIDC, com mapeamento de grupos para papéis. Configure pela interface ou declare no arquivo de configuração (somente leitura na interface, segredos vindos de variáveis de ambiente). No SigNoz original o OIDC só existia na edição proprietária.
- **Single sign-on com SAML 2.0**: login iniciado pelo FuseScope ou pelo provedor, com qualquer provedor SAML 2.0 (Keycloak, ADFS, Okta, Entra ID, …) e o mesmo mapeamento de grupos para papéis. No SigNoz original o SAML só existia na edição proprietária.
- **Sem envio de telemetria para terceiros**: analytics e o stats reporter vêm desligados por padrão.

## Roadmap

O objetivo do FuseScope é cobrir o essencial de uma suíte comercial de APM, sem lock-in.

Concluído: ~~rebranding para FuseScope~~, ~~metastore em PostgreSQL~~, ~~SSO com OpenID Connect~~, ~~single sign-on com SAML~~.

Próximos, nesta ordem:

1. Arquivo de longo prazo: exportar dados além da janela quente para Parquet em object storage, com reidratação de volta no ClickHouse ([#11](https://github.com/fuseone-io/fusescope/issues/11)).
2. Real User Monitoring e session replay ([#12](https://github.com/fuseone-io/fusescope/issues/12)).

A lista completa (detecção de anomalias, papéis customizados, synthetics, SLOs, profiling e outros) está nas [issues de roadmap](https://github.com/fuseone-io/fusescope/issues?q=is%3Aopen+label%3Aroadmap).

## Primeiros passos

O FuseScope precisa do ClickHouse e do [coletor OpenTelemetry do FuseScope](https://github.com/fuseone-io/fusescope-otel-collector). Implante com os [charts Helm do FuseScope](https://github.com/fuseone-io/fusescope-charts) ou compile a partir do código-fonte:

```bash
# backend (Go 1.26)
make go-build-community        # → target/<os>-<arch>/fusescope

# frontend (Node 22, pnpm 10)
make js-build                  # → frontend/build

# imagem de container
make docker-build-community    # → ghcr.io/fuseone-io/fusescope
```

### Banco de metadados

O FuseScope guarda seus metadados (usuários, dashboards, regras de alerta, autorização) em SQLite por padrão. Use PostgreSQL para rodar várias réplicas do backend:

```yaml
sqlstore:
  provider: postgres
  postgres:
    dsn: postgres://fusescope:secret@postgres:5432/fusescope?sslmode=disable
```

ou pelo ambiente: `SIGNOZ_SQLSTORE_PROVIDER=postgres` e `SIGNOZ_SQLSTORE_POSTGRES_DSN=…`. No chart Helm, `--set postgresql.enabled=true` sobe o PostgreSQL e já faz a ligação. Todas as opções estão em [`conf/example.yaml`](conf/example.yaml).

### Single sign-on

Adicione um domínio OpenID Connect em *Settings → Single Sign-on* ou declare no arquivo de configuração:

```yaml
authdomain:
  domains:
    - name: exemplo.com.br
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

A URI de redirecionamento a cadastrar no provedor é `https://<host-do-fusescope>/api/v1/complete/oidc`. Mais exemplos (Keycloak, Okta) estão em [`conf/example.yaml`](conf/example.yaml).

Para SAML, adicione um domínio SAML na mesma página com o entity ID, a URL de SSO e o certificado de assinatura do provedor (todos estão no metadata dele). Cadastre o FuseScope no provedor com o entity ID `<host-do-fusescope>` e a URL de ACS `https://<host-do-fusescope>/api/v1/complete/saml`, e defina `global.external_url` para que o FuseScope só aceite respostas destinadas ao próprio host.

Para um ambiente local de desenvolvimento (ClickHouse + coletor), veja [docs/contributing/development.md](docs/contributing/development.md).

## Contribuindo

Issues e pull requests são bem-vindos. Leia o [CONTRIBUTING.md](CONTRIBUTING.md) e as regras de engenharia em [CLAUDE.md](CLAUDE.md) (testes antes, limites de licença) antes de abrir um PR, e reporte problemas de segurança como descrito no [SECURITY.md](SECURITY.md).

## Créditos e licença

O FuseScope se apoia no trabalho do time e da comunidade do [SigNoz](https://signoz.io), cujo código sob licença MIT é a base deste projeto. "SigNoz" é marca da SigNoz Inc.; o FuseScope não é afiliado nem endossado pela SigNoz Inc.

O código-fonte deste repositório é distribuído sob a [Licença MIT](LICENSE), e o binário do backend `fusescope` é somente MIT: não inclui código AGPL. O [fusescope-otel-collector](https://github.com/fuseone-io/fusescope-otel-collector) é um programa separado, licenciado sob **AGPL-3.0**. Os avisos de terceiros estão no [NOTICE](NOTICE).
