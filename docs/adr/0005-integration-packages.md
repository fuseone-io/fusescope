# 0005 · Integration packages in their own repository

- Status: proposed
- Deciders: FuseOne maintainers. The catalog format, signing, the backend loader and version pinning span several PRs and two repos.
- Related: [`fuseone-io/fusescope-integrations`](https://github.com/fuseone-io/fusescope-integrations), the repository this ADR creates.

## Context

The **Integrations** page lists packaged instructions and assets for one technology each: Redis, PostgreSQL, ClickHouse, the AWS-managed databases and so on. Today they are part of the backend binary, so fixing a collector snippet or adding a dashboard needs a backend release, and nothing checks the snippets against a real collector.

Code was read on `main` at `e6f35f472`.

### What exists

- **Files.** `pkg/query-service/app/integrations/builtin_integrations/<dir>/` holds 8 integrations: clickhouse, mongo, nginx, postgres, redis, aws_rds_mysql, aws_rds_postgres, aws_elasticache_redis. Each has an `integration.json`, an `overview.md`, `config/*.md` steps, dashboards under `assets/dashboards/` (none for nginx), an icon, and its data collected, inline or (clickhouse) in `data-collected.json`. No integration ships pipelines or alerts; all have `"pipelines": []`.
- **Loading** (`builtin.go`). `//go:embed builtin_integrations/*`, read in `init()`, which panics on error. Values of the form `file://<path>` are inlined: `.md` as text, `.json` as parsed JSON, images as base64 data URIs. The result is decoded with `DisallowUnknownFields` into `IntegrationDetails`, which runs the dashboard v2 validation (`PostableDashboardV2.UnmarshalJSON`). The id gets a `builtin-` prefix (`aws_rds_postgres/` declares `aws_rds_postgresql`, so it is served as `builtin-aws_rds_postgresql`). Connection-test metric names are derived from the collected metrics with the Prometheus sanitiser.
- **Serving** (`manager.go`, `controller.go`). `Manager` reads available integrations through the `AvailableIntegrationsRepo` interface (`list`, `get`), implemented only by `BuiltInIntegrations`. `/api/v1/integrations`, `/{id}`, `/{id}/connection_status`, `/install` and `/uninstall` are built on it.
- **Installs.** `installed_integration` stores `type` (the integration id), `config` and `installed_at` per org; there is no version. Install provisions each dashboard once, under the slug `<id without builtin->--<dashboard id>`. Pipelines are not stored: `GetPipelinesForInstalledIntegrations` builds them from the current definition each time collector config is generated, so a changed pipeline would reach every install at the next backend upgrade.
- **Tests.** `builtin_test.go` (loads, no `file://` left, no SigNoz wording or links) and `builtin_collector_config_test.go` from #146 (each snippet exports only through `otlp/fusescope`, with no ingestion key). No test runs a collector on the snippets.
- **Cloud integrations** (`pkg/modules/cloudintegration/implcloudintegration/definitionstore.go`) embed their own service definitions. They are out of scope here; a later ADR can move them the same way.

### Prior art

Ideas only; no code or content was taken from either.

- **Elastic Package Registry.** Versioned, data-only packages (`manifest.yml`, kibana assets, ingest pipelines) in their own repo, a `conditions.kibana.version` constraint per package, a registry that serves every published version, and installs that pin a version until the user upgrades.
- **Datadog `integrations-core`.** One directory per integration with a manifest, metadata (the metrics collected) and dashboards, validated in CI and released independently of the agent.

## Decision

1. **Integrations live in `fuseone-io/fusescope-integrations`** (public, MIT), one directory per package:

   ```
   integrations/<dir>/
     manifest.yaml
     overview.md
     config/*.md
     assets/dashboards/*.json
     assets/pipelines/*.json      one pipeline per file
     assets/alerts/*.json         one rule per file
     data_collected.json
     icon.svg | icon.png | icon.jpg
   ```

   Every file must be referenced by the manifest, and every reference must exist. The repo also holds `schema/manifest.schema.json` and `fsint`, a Go tool that validates, renders, builds the catalog and generates docs. It is Go so the backend can import its types.

2. **The manifest maps `integration.json` one to one**, with paths instead of `file://` URIs, and adds what versioning needs:

   | Field | |
   |---|---|
   | `manifest_version` | Format of the manifest, `1`. |
   | `id` | `<namespace>-<name>`. The id the API serves and `installed_integration.type` stores, e.g. `builtin-redis`. It never changes. `builtin` is reserved for the official catalog. |
   | `version` | Package semver. A released version is immutable; any change bumps it. |
   | `fusescope` | Semver constraint on the backend version, e.g. `>=0.154.0`. |
   | `title`, `description`, `author`, `icon`, `categories`, `overview`, `configuration`, `assets`, `connection_tests` | As today. |
   | `signals` | `logs`, `metrics`, `traces`; must match the non-empty lists in `data_collected.json`. |
   | `data_collected` | `data_collected.json`. |

   An omitted asset list stays `null` and `[]` stays `[]`, because the API serves them differently today (nginx has `"dashboards": null`).

3. **CI validates every package**: the JSON Schema; files; dashboard ids; signals; SigNoz wording and links; the #146 snippet rules; static SVGs; `otelcol-contrib validate` on every full collector config, in the contrib image, with the values the step exports; decoding with the types of `fusescope` `main`, as the API does; Go licences; generated docs in sync. Snippets that need components only fusescope-otel-collector ships (the ClickHouse query-logs receiver) are listed, not validated: that collector has no `validate` command.

4. **A release publishes a signed catalog.** A `v*` tag builds:
   - one reproducible `<id>-<version>.tar.gz` per package (sorted entries, fixed modes, owners and timestamps), holding the files its manifest references;
   - `index.json`: `catalog_version`, source repo, ref and commit, and per package its id, version, `manifest_version`, `fusescope` constraint, title, categories, signals, file name, sha256 and size.

   `index.json` is signed with **cosign keyless through GitHub OIDC**, like the backend image (`release.yaml`), into a Sigstore bundle, `index.json.sigstore.json`. The index carries every package's checksum, so one signature covers the catalog. The release assets go to GitHub releases, and also to GHCR as an OCI artifact pushed with `oras`, `ghcr.io/fuseone-io/fusescope-integrations-catalog:<version>`, which is signed too. The index lists every package version still supported. Versions from earlier releases are carried forward, so a pinned version stays downloadable.

5. **The backend embeds a pinned snapshot of the catalog.** A file in the backend repo names the catalog release. A script downloads that release, verifies it with `cosign verify-blob` against the release workflow's identity, and writes it under the loader's package. `go:embed` ships it. At startup the loader checks each tarball's sha256 against the index, unpacks, renders as `fsint` does, and implements `AvailableIntegrationsRepo`. A failure is a startup error, not a panic. Offline installs work: nothing is fetched at runtime.

6. **Remote sync is optional and comes later.** When enabled, the backend fetches `index.json` and its bundle from a configured URL (by default the latest GitHub release). It verifies the bundle with an embedded Sigstore trusted root, pinned to the release workflow's certificate identity and the GitHub OIDC issuer. Only then does it download packages, checking their sha256, and store them next to the snapshot. It is **off by default**, and must stay off when air-gapped: the snapshot is the source of truth there.

7. **Each installation pins a version.** `installed_integration` gains a `version`. Existing rows read as `1.0.0`, the version the moved packages start at, which serves exactly what they serve today. The backend serves an installed integration's pinned version, including the pipelines it generates, and the latest compatible version to orgs that have not installed it. Upgrading is explicit: an upgrade endpoint re-provisions dashboards by slug and moves the pin. The UI shows "update available". A pinned version must stay resolvable from the snapshot or the synced cache; the catalog drops a version only when a backend release no longer supports it.

8. **Private catalogs** are configured as extra catalog sources, each with its URL and trusted signer. The signer is a Sigstore identity and issuer, or a cosign public key for signers outside GitHub. Their ids must use their own namespace, not `builtin`. A package from a private catalog carries the same trust as an admin installing it by hand.

## Security

- **Packages are data.** Markdown, JSON, YAML and images only; the loader never executes anything from a package. `fsint` rejects SVGs with scripts, `foreignObject`, event handlers, `javascript:` URLs or external references. Icons are served as data URIs in `<img>`, where scripts do not run.
- **What a package can change.** Dashboards go through the dashboard v2 validation; their queries run with the viewer's permissions. Pipelines become collector config pushed to agents over OpAMP, so they are validated as pipelines saved through the API are. Alerts go through rule validation. Collector snippets are text for users to copy and never run.
- **Integrity and origin.** The snapshot is verified when it is updated, and its checksums at every startup. Remote sync verifies the Sigstore bundle against a pinned identity before using anything, and rejects a package whose checksum differs from the signed index. A compromised mirror or registry cannot serve unsigned content.
- **Air-gapped installs** keep remote sync off and run on the embedded snapshot, with no outbound calls.

## Compatibility

- **API and UI are unchanged.** The same ids, fields, null/`[]` distinctions, dashboard slugs and connection tests. CI compares what each package serves with the backend's embedded copy until the backend switches.
- **`manifest_version`.** A backend reads the current version N and N-1. A catalog for a new N is published only after a backend that reads N has shipped. A backend that meets an unknown `manifest_version` or a `fusescope` constraint it does not satisfy skips that package and logs it, never fails startup.
- **`catalog_version`** versions `index.json` the same way.

## Migration plan

| Phase | What | Where |
|---|---|---|
| 0 | Repo, the 8 packages moved unchanged at `1.0.0`, `fsint`, CI, release workflow (dry run only). This ADR. | integrations, backend docs |
| 1 | First catalog release, `v1.0.0`, signed. | integrations |
| 2 | Backend loader: embedded snapshot, the pin file and update script, `AvailableIntegrationsRepo` over the catalog. The current tests are ported to run against it. `builtin_integrations/` is deleted, and the CI equality check stops. | backend |
| 3 | Version pinning: `installed_integration.version` (SQLite and PostgreSQL), existing rows as `1.0.0`, upgrade endpoint, "update available" in the UI. | backend, frontend |
| 4 | Optional signed remote sync, off by default. | backend, charts |
| 5 | Private catalogs. | backend, charts |

Until phase 2, a change to an integration lands in both repos; CI in the integrations repo fails when they diverge.

## Consequences

- **Faster integration fixes.** Snippets, docs and dashboards ship with a catalog release; users get them with the next backend release that bumps the snapshot, or right away once remote sync exists.
- **Snippets are tested.** Every contrib snippet is validated by a real collector in CI, which today runs none.
- **Two repos to keep in step.** Until phase 2 a change lands twice. After it, a backend change to `IntegrationDetails` must keep reading the catalog, which `backend-compat` checks from the other side.
- **Dependencies.** The loader imports `fusescope-integrations` (MIT) and its dependencies: `go.yaml.in/yaml/v3` (MIT), `santhosh-tekuri/jsonschema` (Apache-2.0) and `Masterminds/semver` (MIT). Remote sync adds `sigstore-go` (Apache-2.0). Each is added in its own PR.
- **Snapshot size.** The 8 packages are about 105 KB of tarballs. Keeping supported versions in the snapshot grows it slowly.
- **Release ownership.** Cutting a catalog release, and bumping the backend's pin, become release steps.

## Open questions

- Whether remote sync should default to on for connected installs once phase 4 is proven.
- How many old package versions the catalog keeps beyond those pinned by supported backends.
