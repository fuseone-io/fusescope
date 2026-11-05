# 0007 · Cost observability (FinOps)

- Status: proposed
- Deciders: FuseOne maintainers. Storage, schema ownership, credentials and the allocation model span several PRs and three repos (backend, collector migrator, charts).
- Related: [ADR 0001](0001-agpl-collector-dependency.md) (no collector imports), [ADR 0002](0002-long-term-archive.md) (lease, fenced commits), [ADR 0009](0009-fusescope-collector.md) (Apache-2.0 `fusescope-collector` and its migrator, which owns new databases).

## Context

FuseScope shows what a service does, not what it costs. Teams want cloud and Kubernetes spend next to the traces and metrics of the services that cause it: cost per service, per request, per tenant. Plugging in an external engine such as OpenCost was considered and declined. It is another deployment that reads its own Prometheus, prices nodes from public list prices until a bill is wired in, and would duplicate metrics FuseScope already stores; Vantage likewise replaced its OpenCost integration with its own agent, which needs no Prometheus [V2]. We build the cost engine into the backend instead.

Code was read on `main` at `ef3cc1b09`, charts at `d5d7187`, collector at `27c4cea`. External facts were checked on 2026-10-30 and are cited in [Sources](#sources).

### What exists

- **Cost Meter** (`/meter`, `frontend/src/pages/MeterExplorer`) measures **FuseScope's own ingest**: log records, spans, data points and their bytes, as `signoz.meter.*` metrics per `service.name`, environment and host. The collector's `signozclickhousemeter` exporter writes them hourly to `signoz_meter.samples` (1-year TTL; table owned by the migrator). The backend queries them through `meterstatementbuilder` as the `meter` source of query builder v5. It says nothing about cloud bills.
- **LLM pricing rules** (`pkg/modules/llmpricingrule`) price LLM tokens on spans, pushed to collectors over OpAMP.
- **Kubernetes metrics we already collect** with the `k8s-infra` chart:
  - `k8s_cluster`: `k8s.container.cpu_request` and `k8s.container.memory_request` (on by default upstream), `k8s.node.allocatable_cpu` and `allocatable_memory` (off upstream, enabled by the chart's `allocatableTypesToReport: [cpu, memory]`) [M1][M2];
  - `kubeletstats`: `k8s.pod.cpu.usage`, `k8s.pod.memory.working_set`, `k8s.node.cpu.usage`, `k8s.node.memory.working_set`, `k8s.volume.capacity` [M3]. The per-container metrics the allocator needs (`container.cpu.usage`, `container.memory.working_set`) come from the receiver's `container` metric group, which phase 1's chart change enables where the chart has it off;
  - `k8sattributes`: namespace, workload, node and pod uid on every signal.
- **Gaps for costing.** Node metrics carry no instance type, zone, capacity type (spot or on-demand) or provider id, so a node can't be priced or matched to a bill line. `k8sattributes` can copy node labels (`extract.labels[].from: node`) [M4]. `extractLabels` is empty, so pod labels such as `team` are not on the metrics. There are no GPU metrics.
- **Scheduling.** The archive module ([ADR 0002](0002-long-term-archive.md), #150, PRs #160–#199) runs work under a SQL lease with an epoch that fences commits (`implarchive/lease.go`, `archive_lease`).
- **Credentials.** `pkg/query-service/utils/encryption` is AES-CFB without authentication; it is not fit for new secrets.
- **Alerts.** Threshold and PromQL rules work in the community build. Anomaly rules are a declared type with no implementation (#13).

### Billing data

| Provider | Export | Format and delivery | Restatement |
|---|---|---|---|
| AWS | Data Exports: **CUR 2.0** (fixed schema, hourly/daily/monthly, optional resource ids and split cost allocation for containers) and **FOCUS 1.2 with AWS columns** [A1][A3] | Parquet (snappy) or gzip CSV in S3 under `…/data/BILLING_PERIOD=YYYY-MM/`, refreshed at least daily; `Manifest.json` is written after all files arrive [A2] | The month is refreshed until it ends and may change for two weeks after; in overwrite mode files are replaced, in create-new mode the manifest points to the latest run [A2] |
| GCP | Cloud Billing **export to BigQuery**: standard `gcp_billing_export_v1_<id>` and detailed `gcp_billing_export_resource_v1_<id>`; a native **FOCUS export** (preview, up to FOCUS 1.2) and an older FOCUS 1.0 view [G1][G3][G4] | BigQuery, updated through the day with no latency guarantee [G2] | Rows are never changed; corrections are new negating rows, and `invoice.month` can differ from the usage month [G1] |
| Azure | Cost Management **exports**: actual, amortized and **FOCUS** (actual and amortized in one; 1.0, 1.0r2, 1.2-preview) [Z1][Z2] | CSV (gzip) or Parquet (snappy) to a Storage account, partitioned files under 1 GB, `manifest.json`, overwrite by default [Z1] | Daily exports are month to date; in the first 5 days of a month a hidden run rewrites the previous month, since late charges arrive up to 72 h after it ends [Z1] |

**FOCUS** (FinOps Open Cost and Usage Specification) is an open specification of one billing schema, run under the Joint Development Foundation with the FinOps Foundation and licensed **CC-BY-4.0** [F1][F2]. The latest release is **1.4**, ratified 2026-06-04 [F3]. Its mandatory cost and usage columns are `BilledCost`, `EffectiveCost`, `ListCost`, `ContractedCost`, `BillingAccountId/Name`, `BillingCurrency`, `BillingPeriodStart/End`, `ChargeCategory`, `ChargeClass`, `ChargeDescription`, `ChargePeriodStart/End`, `ServiceProviderName`, `HostProviderName`, `InvoiceIssuerName`, `PricingQuantity/Unit`, `ServiceCategory` and `ServiceName`; `ResourceId`, `Tags`, `RegionId`, `SkuId`, `SubAccountId` and `ConsumedQuantity` are conditional [F5]. 1.3 replaced `ProviderName` and `PublisherName` with `ServiceProviderName` and `HostProviderName`, and 1.4 removed the old names [F4]. Custom columns are prefixed `x_`. The clouds export older versions (AWS 1.2, Azure 1.2-preview, GCP up to 1.2), so we must map versions.

### Kubernetes allocation, as OpenCost and Kubecost do it

OpenCost is Apache-2.0 and a CNCF incubating project [O1]. We read its specification and documentation for the model; no code is used.

- **Price per unit.** A node's hourly cost becomes a price per vCPU-hour, GB-RAM-hour and GPU-hour. On-prem uses a custom price sheet; OpenCost's defaults are $0.031611 per vCPU-hour and $0.004237 per GB-hour, from GCP us-central1 [O4]. Clouds use public list prices: the unauthenticated AWS bulk price list and spot data feed, the GCP Billing Catalog API (API key), the Azure Rate Card or price sheet [O5][P1][P2][P3]. The Azure Retail Prices API is unauthenticated too [P4].
- **Allocation.** Each container is charged `max(request, usage)` of CPU, RAM and GPU per hour; persistent volumes by PVC requested size; network by egress class (zone, region, internet); load balancers by forwarding rule [O2].
- **Idle** = asset cost − workload cost. Idle, shared and overhead costs can be split evenly, proportionally or by a custom metric; the API shares idle per cluster or per node, off by default [O2][O3]. Kubecost adds shared namespaces and labels [K1].
- **Datadog** splits node cost 60 % CPU / 40 % memory, and separates *workload idle* (requested − used) from *cluster idle* (capacity nobody requested) [D2].

### Market

- **Datadog Cloud Cost Management** ingests AWS, Azure, GCP and Oracle bills and SaaS costs, keeps 15 months, allocates pod and idle cost, maps cost to services through the APM service catalog, and alerts on changes, anomalies, thresholds, forecasts and budgets [D1][D3]. Custom costs are FOCUS-aligned files [D4]; unit costs have their own API [D5].
- **Grafana Cloud** estimates Kubernetes cost with OpenCost from public price lists, not from ingested bills; its FOCUS support covers only Grafana's own bill [R1][R2].
- **Vantage** allocates Kubernetes cost per minute with its own agent, including an `__idle__` namespace [V1], turns costs into **unit costs** with business metrics such as cost per user or request [V3], and exports FOCUS [V4].

Our advantage is the store: bills, traces and RED metrics in one ClickHouse, joined on `service.name` with no tag export and no second agent.

## Goals

- Cost per provider, account, service, team and namespace, from **real bills**, normalized to FOCUS.
- **Kubernetes cost per workload and service** from metrics we already collect, on any cloud or on-prem.
- **Unit economics**: cost per 1k requests, per tenant, per business metric, next to RED metrics.
- Budgets and cost alerts with the existing alerting.
- Self-hosted and air-gapped installs work with a price sheet alone.

Non-goals: buying or managing commitments, invoicing, chargeback workflows, and cloud console features (rightsizing actions are recommendations only).

## Decisions

### 1. A cost module in the backend

`pkg/modules/cost` (types in `pkg/types/costtypes`) has five parts. Sources implement one interface, one implementation per provider; the rest are plain components.

| Part | Does |
|---|---|
| **Sources** | Read one provider's export for a billing period: AWS, GCP, Azure, price sheet, FuseScope meter |
| **Loader** | Normalizes rows to FOCUS, applies mapping rules, writes and publishes one load |
| **Allocator** | Splits Kubernetes node cost over pods per hour (§5) |
| **Series builder** | Derives the daily cost series that queries, dashboards and alerts read (§3) |
| **Scheduler** | Runs sources and the allocator under a lease (§7) |

Configuration (sources, price sheets, mapping rules, budgets) lives in the SQL metastore and works on SQLite and PostgreSQL.

### 2. FOCUS 1.4 is the internal model

Every source writes FOCUS-shaped rows in **1.4 names**; older exports are mapped (`ProviderName` → `ServiceProviderName`, absent columns empty). We store the FOCUS columns FuseScope uses, in snake case, plus extension columns:

| Column | |
|---|---|
| `x_source_id`, `x_load_id` | which source and load wrote the row |
| `x_service_name` | FuseScope `service.name`, from mapping rules (§6) |
| `x_team`, `x_environment` | from mapping rules |
| `x_k8s_cluster`, `x_k8s_namespace`, `x_k8s_workload` | for allocated rows |
| `x_allocation` | `billed`, `allocated`, `idle`, `shared` |

The FOCUS version written is recorded per load. Provider columns outside FOCUS are dropped. Resource ids and tags are kept through FOCUS's own `ResourceId` and `Tags` columns.

### 3. Storage: `fusescope_costs`, owned by the migrator

**Tables** (each with a `distributed_` table, `Replicated*` engines on a cluster):

| Table | Grain | Key / partition | Retention |
|---|---|---|---|
| `line_items` | source grain (hourly or daily) | `ORDER BY (org_id, x_source_id, x_load_id, charge_period_start, service_category, x_service_name)`, `PARTITION BY toYYYYMM(billing_period_start)` | 25 months |
| `allocations` | pod × hour | `ORDER BY (org_id, x_source_id, x_load_id, x_k8s_namespace, x_k8s_workload, pod, hour)`, monthly partitions; `x_source_id` = `k8s:<cluster>` | 90 days |
| `published_loads` | load key × period | `ReplicatedReplacingMergeTree(version)` on **every** node, not sharded (no `distributed_` table), `ORDER BY (org_id, x_source_id, period)` | `TTL period_end + INTERVAL 26 MONTH`, on the period, not the insert time |
| `samples`, `samples_agg_1d` | series × day | `signoz_meter.samples` columns plus `org_id`, `x_source_id` and `x_load_id`, which lead the `ORDER BY` of both tables; `samples_agg_1d` aggregates per load | 25 months |

- `x_load_id` follows the source or cluster in every key, so the published-load filter and the deletes of a load read only that load's granules.
- `samples` holds **cost series**: `fusescope.cost.effective`, `fusescope.cost.billed`, `fusescope.cost.list`, as delta sums with labels `provider`, `billing_account`, `sub_account`, `service_category`, `provider_service`, `region`, `service.name`, `team`, `environment`, `k8s.cluster.name`, `k8s.namespace.name`, `charge_category`, `allocation`, `currency`. No resource id: per-resource drill-down reads `line_items`.
- Because the series have the meter's shape, **the meter statement builder serves them as a new `cost` source** with another database, adding `org_id = ?` and the published-load filter below to every query. Query builder, dashboards, formulas across sources and threshold alerts work on cost without a new query engine.
- **Budget series are gauges.** A budget job, under its own lease key `cost:budgets`, writes two gauges per budget scope and day as loads keyed `(budget, month)`, recomputed from the published series after every publish of any source or cluster and hourly, so a restated month or an allocator rerun moves them too: `fusescope.cost.mtd`, the calendar month-to-date total (it restarts on the 1st), and `fusescope.cost.forecast`, the month-end projection (month to date plus a linear forecast over the days left). Each point holds the whole value, so rules and charts read the latest point and never sum them. The `cost` source implements "latest" as `argMax(value, unix_milli)`, not the meter's `anyLast`, which isn't time-ordered, and **always reads gauges from `samples`**: the `cost` source passes a table hint for gauge metrics, so `WhichSamplesTableToUse`, which switches to `samples_agg_1d` for ranges of 30 days or more, never sends them to that table's `anyLast(last)`. Budget rules evaluate over a 26-hour window (a day plus refresh lag); the hourly budget run writes today's point whether or not anything changed, so the window always holds a point; no calendar window is needed on the alert path (§8, §9).

**Loads are published, not overwritten.**

- A load writes all its rows, `line_items` or `allocations` **and its series** in `samples`, under a new `x_load_id`, then publishes in one SQL transaction fenced by the lease epoch (`cost_load`: source, period, load id, rows, checksums, FOCUS version, status). Series are never rewritten in place.
- **Load keys share one namespace** in `x_source_id`: a source's id (a generated UUID, so never of the `k8s:` or `budget:` form, nor `budgets`), `k8s:<cluster>` for the allocator and `budget:<budget id>` for budget gauges, so the three can't collide and the filter below is defined for every table.
- **A load covers one period of one lease key**: a billing month of a source, or a UTC day of a cluster for the allocator, whose hourly run republishes each day its 48-hour window touches (at most three loads per run). Each touched day is recomputed **in full**, all 24 hours, not only the hours inside the window, so superseding a day never drops its earlier hours. A recomputed day or a source period is **written only when its checksums changed**: the run first computes the checksums with a `SELECT` over the inputs (no insert), plus the versions of what it applies to them: the mapping rules (§6), the price sheet and, for the allocator, the bill loads matched to its nodes (§7). It compares them with the published load's, and writes a new load only on a difference, so in steady state the allocator publishes about one load per cluster per day (today's), not one per run, and closed days stop churning. A rule or price change, or a node bill arriving, changes those versions, so it republishes what it touches. Budget months aren't gated: each budget run rewrites them, since they are small and must gain today's point when no input changed.
- **Readers resolve loads in ClickHouse.** On publish, after the metastore commit, the backend inserts `(org_id, x_source_id, period, x_load_id, version)` into `published_loads`, a small `ReplacingMergeTree(version)` keyed by `(org_id, x_source_id, period)`. Every query of `line_items`, `allocations`, `samples` and `samples_agg_1d` filters `x_load_id IN (SELECT argMax(x_load_id, version) FROM published_loads WHERE org_id = ? GROUP BY x_source_id, period)`. `published_loads` is replicated to every node and not sharded (the migrator defines its replica path without the `{shard}` macro). Readers resolve it **once, on the initiator**, with `GLOBAL IN`, so every shard filters by the same load ids and a query can't mix a new load on one shard with the old one on another while the insert replicates. The insert uses `insert_quorum='auto'` (a majority), so one replica down doesn't stop publishing, and the superseded load is deleted only once every replica holds the new row (checked with `clusterAllReplicas`); until then it stays `superseded` and the next run retries. One insert switches a period from one load to the next, so a query on any replica never sees a period twice or not at all, and no query carries a list of ids (25 months of daily cluster loads are a few thousand rows of `published_loads`). A crash between the metastore commit and this insert is repaired at the start of the next run, which re-inserts any published load missing from `published_loads`; a stale lease holder can't commit, so it never inserts.
- ClickHouse writes aren't fenced, and needn't be: a holder that lost its lease writes rows under its own load id, which it can't publish, so no reader ever sees them.
- After publishing, the superseded load is removed from every table with a lightweight `DELETE FROM <local table> ON CLUSTER <cluster> WHERE x_load_id = …` (a lightweight delete can't target a `distributed_` table, so it runs on the local tables of every shard through the distributed DDL queue), issued on `samples_agg_1d` as well, since a materialized view doesn't carry deletes to its target. `DROP PARTITION` is never used (ADR 0002, E4).
- **Superseded loads are tracked until deleted.** `cost_load` records each superseded load as `superseded` and sets it to `deleted` only after its `ON CLUSTER` delete succeeds; each run retries the deletes of its lease key's loads still `superseded`, so a timeout or a crash after publishing doesn't leak rows.
- **Unpublished loads are swept.** A load that wrote rows and then failed, crashed or lost its lease is never published or superseded; each run deletes, from every table, the rows of loads **of its own lease key**, where a lease key owns exactly these `x_source_id` values: `cost:<source id>` owns `<source id>`, `cost:k8s:<cluster>` owns `k8s:<cluster>`, and `cost:budgets` owns every `budget:<id>` of the org (no other key uses the `budget:` prefix), that are not published and older than the run timeout, and marks them `abandoned` in `cost_load`. A writer checks its lease before each insert batch and stops once it has lost or outlived it, so a load older than the run timeout has no live writer. Each run also re-sweeps `abandoned` loads, so rows a stale writer inserted after a sweep are removed by the next run.

**Schema ownership: the migrator owns `fusescope_costs`** (resolved in review).

The cost tables are created and changed by the **Apache-2.0 schema migrator in `fusescope-collector`** (the distribution of ADR 0009, built in the `fusescope-collector-server` repository, which the roadmap names), which owns every new database (ADR 0009); the AGPL fork's migrator is not changed. The backend creates and alters no tables; its lightweight deletes go through the distributed DDL queue with `ON CLUSTER`, as the archive's do.

- **Migrator side.** `fusescope_costs` is one of the Apache migrator's databases, with its own migrations: the database, the tables above with their `distributed_` tables, engines, keys and TTLs, and `schema_migrations_v2`. Migrations are numbered, additive, and tested like the meter migrations. They ship with a `fusescope-collector` release, so cost schema versions follow its versions.
- **Backend side.** The backend only writes rows (`INSERT`, `INSERT … SELECT FROM s3()`/`azureBlobStorage()`), runs the versioned-load swap and the sweep (lightweight `DELETE` of superseded and abandoned loads), and reads with its own SQL. It imports no collector package (ADR 0001); table and column names are constants written here, as for the other databases.
- **Missing or older schema.** Each backend release declares the lowest cost migration id it needs. At startup and before each run, it reads `fusescope_costs.schema_migrations_v2` for that id with status `finished`. If the database or the migration is missing, cost is **disabled with a status**, "Cost needs schema migrator ≥ vX.Y; run the migrator", shown in Settings and the API, and the scheduler skips its work. Nothing else in the backend is affected, and the feature enables itself on the next check once the migrator has run.
- **Order of releases.** A schema change is released in the migrator first; the backend release that uses it raises its required migration id. Columns are only added, so a newer schema never breaks an older backend.
- **Privileges.** The backend's ClickHouse user needs `INSERT`, `SELECT` and `ALTER DELETE` on `fusescope_costs.*` and the `CLUSTER` grant for `ON CLUSTER` deletes, plus the `S3` and `AZURE` source privileges for the table functions; the migrator keeps the DDL rights it already has.
- **Internal only.** The backend makes outbound calls (billing exports, STS, BigQuery, price lists) and writes to ClickHouse. It exposes nothing new to the internet.

### 4. Sources

Credentials come from **workload identity** first (IRSA/EKS Pod Identity, GKE Workload Identity, Azure Workload Identity). Static keys are the fallback, sealed with AES-256-GCM under a key from config (`cost.credentials.key`), never returned by the API and never logged.

| Source | How it reads |
|---|---|
| **AWS** | The FOCUS 1.2 export (preferred) or CUR 2.0, Parquet. The backend assumes the read-only role (STS, optional external id), reads the period's `Manifest.json`, and has ClickHouse read exactly the listed objects with `s3()` and the session credentials. Rows go `INSERT … SELECT` into `line_items`; billing data never passes through the backend. A changed manifest means a new load of the whole month. After the insert, the backend reads `Manifest.json` and the objects' ETags again and discards the load if anything changed, since in overwrite mode AWS replaces objects in place; create-new mode is recommended and avoids the race. |
| **Azure** | The FOCUS export, Parquet. Same flow with a short-lived user-delegation SAS, `azureBlobStorage()` and the run's `manifest.json`. |
| **GCP** | The native FOCUS export table, or the FOCUS view where it isn't enabled. ClickHouse can't read BigQuery, so the backend queries one invoice month with the BigQuery client and inserts in batches. The export is append-only, so a month is reloaded when its `max(export_time)` moves, **at most once a day** and again when the invoice closes, since BigQuery bills the customer per byte scanned; delta loads over `export_time` are a later optimisation. |
| **Price sheet** | User-defined prices per vCPU-hour, GB-RAM-hour, GPU-hour and GB-month, with overrides per instance type, node label or node pool, and spot and committed discount factors. It prices on-prem nodes and any cloud without a bill. Optionally seeded from the public AWS Price List, Azure Retail Prices and GCP Cloud Billing Catalog APIs; air-gapped installs edit it by hand. |
| **FuseScope** (optional) | The Cost Meter's `signoz.meter.*` volumes times a price per GB or per million points, as provider `FuseScope`. Observability spend then shows up as one more line, per service. |

Each source checks its permissions with a dry run when it's saved, and shows its last load, lag and errors. Secrets passed to ClickHouse table functions must not appear in `system.query_log`; phase 2 verifies the masking of `s3()` and `azureBlobStorage()` arguments, and uses a temporary named collection where it doesn't hold.

### 5. Kubernetes allocator

Computed in ClickHouse from `signoz_metrics`, per cluster and hour:

1. **Node cost.** From the bill when a `line_items` row matches the node (phase 2), through a per-provider normalisation of the node's `providerID`: AWS `aws:///<zone>/i-…` → the instance id, matched to `ResourceId` (the source's dry run fails if the export lacks resource ids); GCP `gce://<project>/<zone>/<name>` → `//compute.googleapis.com/projects/<project>/zones/<zone>/instances/<name>`; Azure scale-set nodes `azure:///subscriptions/…/virtualMachineScaleSets/<vmss>/virtualMachines/<n>` → the scale set's resource id, whose cost is split over its instances by hours run. Golden tests cover each form; otherwise from the price sheet by instance type and capacity type. A whole-node price is split into CPU and RAM by the node's shape: CPU share = `cores × p_cpu / (cores × p_cpu + GB × p_ram)`, with `cores` and `GB` from `k8s.node.allocatable_cpu` and `allocatable_memory` and the unit prices from the price sheet (default OpenCost's, § Context). A memory-optimised node gets a smaller CPU share than a compute-optimised one at the same price.
2. **Pod allocation.** For each **container**, `max(request, average usage)` of CPU cores and RAM bytes, then summed per pod, times the unit price and the fraction of the hour it ran, as OpenCost does, so one container over its request doesn't cancel another under it. Usage is per container (`kubeletstats` `container.cpu.usage` and `container.memory.working_set`, which the chart enables); requests come from `k8s.container.cpu_request` and `memory_request`.
3. **Overcommit.** When allocations exceed the node's allocatable capacity, they are scaled down to it, so a node's cost is never allocated twice.
4. **Idle** is the node cost left over, written as an `idle` row per node. It is shown separately by default and can be shared over workloads by allocation.
5. **Shared** namespaces and labels (default `kube-system`, the FuseScope agents, ingress) are redistributed **per node**: a shared pod's cost goes to the other workloads on the same node, by allocation, as `shared` rows on the receiving workloads, or to the node's `idle` when it runs nothing else. They **replace** the shared namespaces' own `allocated` rows, which are not written.
6. **Reconciliation.** Per node and hour, `allocated + shared + idle` equals the node cost, and the cluster's total equals what was billed for its nodes; any difference is reported as `unreconciled` on the cluster.

The chart adds the pod annotation `resource.opentelemetry.io/service.name` through `k8sattributes` `extract.annotations`, so mapping rule 1 (§6) sees what the pod's own telemetry uses, and node labels (`from: node`): `node.kubernetes.io/instance-type`, set by the kubelet only on clouds, `topology.kubernetes.io/region` and `zone` [L1]; the capacity type from `karpenter.sh/capacity-type` (`spot`, `on-demand`, `reserved`) [L2], `eks.amazonaws.com/capacityType` (`ON_DEMAND`, `SPOT`) [L3] or the GKE and AKS equivalents; the provider id; and the pod labels used for mapping (`app.kubernetes.io/instance`, `app.kubernetes.io/name`, `team`, configurable). On-prem nodes without an instance type are priced per node pool or label.

Persistent volumes (`k8s.volume.capacity` × storage price, then bill-matched), GPUs (device requests or DCGM metrics) and network egress come later (phase 5).

### 6. Mapping cost to services and teams

Rules map rows to `x_service_name`, `x_team` and `x_environment`, first match wins:

1. **Kubernetes rows:** the pod's `resource.opentelemetry.io/service.name` annotation, then the `app.kubernetes.io/instance` label, then `app.kubernetes.io/name`, then the workload name: the order the OpenTelemetry Kubernetes conventions give for `service.name` [S1], so two releases of one chart stay two services and match the `service.name` `k8sattributes` sets on their telemetry; `team` from a pod or namespace label.
2. **Cloud rows:** tag keys in priority order, e.g. `service`, `app`, `fusescope:service`; `team` from `team` or `owner`; account → team as a fallback.
3. **Unmapped** rows keep `x_service_name = ''` and are listed in the UI as the top unmapped spend, with a suggested rule.

Rules are applied at load time. Changing a rule re-applies it to open periods with a new load, and to closed ones on demand, within the allocator's horizon for Kubernetes rows (§7).

### 7. Scheduling and idempotency

- Each source runs every 6 h (configurable), each cluster's allocator every hour, each under the archive's lease pattern with key `cost:<source id>` or `cost:k8s:<cluster>`. The lease is extracted to a shared package when the archive PRs merge.
- A source loads every period whose export changed since the last published load: the open month, the previous month until its invoice is final, and any older period whose manifest or BigQuery partition changed (late credits and corrections), up to `cost.restatement_window` (default 3 months).
- The allocator recomputes the last 48 h on each run, so late metrics are counted, and recomputes past periods when a price sheet changes or a node's billed cost arrives, **within its horizon**: the shorter of the `allocations` retention (90 days) and the `signoz_metrics` retention. A restated bill or price change older than that updates `line_items` and the cloud series but not the Kubernetes split, whose series keep their last load and are marked "allocated with prices as of <date>" in the UI.
- A run changes published data only by publishing a new load, never by rewriting one, so a re-run, a crash or a lost lease leaves the published data untouched.

### 8. Queries the UI needs

| Question | Read |
|---|---|
| Cost over time by provider, account, service, team, namespace, region | `samples` via the `cost` source |
| Top resources, tags, line items | `line_items`, published loads only |
| Workload, pod, idle and shared cost | `allocations` |
| Cost per 1k requests | formula: `cost.effective` per `service.name` ÷ (request count from the RED span metrics ÷ 1000), same day buckets. Span metrics are computed in the collector before tail sampling and kept like other metrics, so the ratio is neither inflated by tail sampling nor empty once traces expire. SDK head sampling drops spans before the collector sees them; services that head-sample get the count scaled by their sampling rate when spans carry it (the `th` sub-key of the OpenTelemetry `ot` entry in `tracestate`, `ot=th:…`), and otherwise the cost per request is labelled an estimate |
| Cost per tenant | a service's cost split by each tenant's share of its requests, from the RED span metrics with `tenant.id` (or a configured span attribute) added as a span-metrics dimension; without it, no tenant split is shown |
| Budget burn and forecast | the latest points of the `fusescope.cost.mtd` and `fusescope.cost.forecast` gauges (§3) |

Unit cost uses data we already have, so it needs no new pipeline. A request-weighted split is an estimate and is labelled so.

### 9. UI

New screens get Claude Design boards before they are built.

| Screen | Contents |
|---|---|
| **Cost explorer** (`/cost`) | totals, trend, group by any dimension, effective / billed / list switch, drill-down to line items or pods, unmapped spend, saved views |
| **Service page** | a cost card: month-to-date cost, trend, cost per 1k requests, top cost components |
| **Kubernetes** | cost per cluster, namespace and workload, idle and shared, from infra monitoring pages |
| **Budgets** | budget per scope (any filter) **in one currency**: a scope that spans sources with different billing currencies is refused, or split into one budget per currency; monthly amount, thresholds on actual and forecast; each budget creates threshold rules on the `cost` source over the latest point of `fusescope.cost.mtd` and of `fusescope.cost.forecast` |
| **Settings** | sources, price sheets, mapping rules, freshness and errors |
| **Recommendations** (phase 5) | rightsizing per workload: p95 usage vs request over 14 days, estimated monthly saving |

The Cost Meter stays where it is and remains about FuseScope's own volume. The cost explorer links to it, and the optional FuseScope source turns its volumes into money.

### 10. Accuracy

- **Amortization.** `EffectiveCost` (amortized commitments, after discounts) is the default; `BilledCost` matches the invoice. Both are kept.
- **Credits, refunds and taxes** are their own `charge_category`. They are shown separately and not allocated to services by default.
- **Currency.** Each source has one billing currency. Different currencies are never summed; a display currency with user-supplied rates comes later.
- **Late data.** AWS may change a month for two weeks after it ends, Azure rewrites it in the first 5 days, GCP appends corrections indefinitely with an invoice month that can differ from usage [A2][Z1][G1]. The UI marks periods that are not final and the source's last load.
- **Kubernetes estimates.** Usage is averaged per hour from 30 s samples; pods shorter than a scrape interval are missed. Price-sheet nodes are list-price estimates until a bill is matched; the cluster shows the unreconciled amount.

## Security

- **Read-only, least-privilege roles**, documented per provider:
  - AWS: `s3:ListBucket` and `s3:GetObject` on the export's prefix only, since the bucket policy grants AWS only `s3:PutObject` [A4]; `kms:Decrypt` if the bucket uses a customer key; optional `bcm-data-exports:GetExport` and `ListExports` to check the export [A5].
  - GCP: `roles/bigquery.dataViewer` on the billing dataset and `roles/bigquery.jobUser` on the project that runs the query (standard BigQuery roles; the billing docs only name the roles that create the export [G2]).
  - Azure: `Storage Blob Data Reader` on the export container [Z4]; optional `Cost Management Reader` to check exports [Z3].
- No write, no billing-console and no organization-wide permissions are asked for.
- Credentials: workload identity first; sealed static keys otherwise; never in API responses, logs or ClickHouse query text in clear.
- **Who sees cost.** Cost is sensitive. Two new resource kinds in the community authz, granted to its managed roles as `cloud-integration` is: `cost` (read, Editors and Admins) and `cost_source` (Admins only). Changing that split needs custom roles, which the community build doesn't implement.

## Licence posture

- No OpenCost or Kubecost code. We read the public OpenCost specification and documentation for the model, which is not copyrightable as such, and write our own allocator.
- FOCUS is CC-BY-4.0 [F2]; we implement its columns and attribute it in `NOTICE` and the docs.
- New dependencies, each in its own PR and asked for first: `cloud.google.com/go/bigquery` (Apache-2.0) for the GCP source; the AWS and Azure SDK modules for STS and SAS (Apache-2.0, MIT).
- No collector code is imported. The cost DDL lives in the Apache-2.0 migrator in `fusescope-collector` (ADR 0009) and the backend talks to the tables only through SQL, as for every other database.

## Roadmap

Each phase ships behind a feature flag, with docs and an e2e test.

Effort is a rough estimate in engineer-weeks, per repo.

| Phase | Scope | Repos (effort) | Exit criteria |
|---|---|---|---|
| **1 · Kubernetes from our metrics** | migrator: `fusescope_costs` database, `allocations`, `published_loads`, `samples` and `samples_agg_1d` tables; metastore: `cost_load` and the lease; backend: schema check and disabled status, `cost` module skeleton, price sheet, allocator, mapping rules for k8s, `cost` query source, Kubernetes cost and a first explorer; chart adds node and pod labels and enables kubeletstats' `container` metric group | fusescope-collector-server (1), fusescope (5–6), fusescope-charts (1) | on a kind cluster and an on-prem cluster, `allocated + shared + idle` equals node cost for every node and hour, with no `allocated` rows left for shared namespaces; namespace and service totals visible in the explorer |
| **2 · AWS** | migrator: `line_items`; AWS source (FOCUS and CUR 2.0), STS and workload identity, loads and restatement, tag mapping, node bill matching, explorer drill-down | fusescope-collector-server (0.5), fusescope (4–5), fusescope-charts (0.5) | a month of a real account matches its invoice total to the cent in `BilledCost`; a restated day is reloaded without duplicates in `samples` or `samples_agg_1d`, and a run killed before publishing leaves no rows after the sweep |
| **3 · GCP and Azure** | GCP source over the FOCUS view, Azure FOCUS export source; migrator columns only if the FOCUS mapping needs them | fusescope (3–4), fusescope-collector-server (≤0.5) | same invoice match for one GCP and one Azure account |
| **4 · Unit economics, budgets, alerts** | cost card on the service page, cost per 1k requests, per-tenant split, budgets as threshold rules on the budget gauges, the optional FuseScope source, cost anomalies on the anomaly rule of #13 | fusescope (3–4) | a budget alert on `fusescope.cost.forecast` fires in a test; the service page shows cost per 1k requests matching a hand computation |
| **5 · Recommendations and more** | rightsizing, persistent volumes, GPUs, network egress, display currency; migrator columns for new cost components | fusescope (4), fusescope-collector-server (0.5), fusescope-charts (1) | rightsizing suggestions on the demo cluster with estimated savings |

## Resolved decisions

| # | Question | Decision |
|---|---|---|
| 1 | Who owns the cost schema | the Apache-2.0 migrator in `fusescope-collector`, which owns new databases (ADR 0009); the backend loads and reads only, creates no tables and imports no collector code (§3) |
| 2 | Database name | `fusescope_costs`: a new contract has no SigNoz name to keep |
| 5 | Who reads cost by default | Editors and Admins, through the `cost` managed role (Security) |
| 7 | FuseScope as a cost source | phase 4, off by default |

## Open decisions

| # | Question | Recommendation |
|---|---|---|
| 3 | GCP read path | BigQuery client (new dependency) over exporting the view to GCS, which needs write access to a bucket |
| 4 | Idle cost default | shown separately, shareable per view |
| 6 | Cost anomalies | wait for #13 rather than a cost-only detector |

## Consequences

- Cloud bills and Kubernetes cost sit beside telemetry, so cost per service and per request need no export and no second tool.
- The collector side owns all ClickHouse DDL, new databases in the Apache migrator (ADR 0009). Cost schema changes need a `fusescope-collector` release before the backend can use them, and installs that skip the migrator see cost disabled until they run it.
- The `cost` source reuses the meter's query path; changes to `meterstatementbuilder` must keep both working.
- Cost accuracy depends on providers' exports and on our chart labels. Price-sheet costs are estimates and are labelled as such.
- New credentials to protect. Workload identity keeps most installs free of static secrets.

## Sources

Checked 2026-10-30.

- [A1] AWS CUR 2.0 table dictionary: https://docs.aws.amazon.com/cur/latest/userguide/table-dictionary-cur2.html
- [A2] AWS Data Exports delivery: https://docs.aws.amazon.com/cur/latest/userguide/dataexports-export-delivery.html
- [A3] AWS Data Exports tables (FOCUS 1.2 with AWS columns): https://docs.aws.amazon.com/cur/latest/userguide/dataexports-table-dictionary.html
- [A4] AWS Data Exports S3 bucket policy: https://docs.aws.amazon.com/cur/latest/userguide/dataexports-s3-bucket.html
- [A5] AWS Data Exports access control: https://docs.aws.amazon.com/cur/latest/userguide/bcm-data-exports-access.html
- [G1] GCP standard usage export schema: https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/standard-usage
- [G2] GCP export setup: https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-setup
- [G3] GCP FOCUS export: https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/focus-export
- [G4] GCP FOCUS 1.0 view: https://cloud.google.com/blog/topics/cost-management/cloud-costs-come-into-view-with-focus-v1-0-ga
- [Z1] Azure exports: https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-improved-exports
- [Z2] Azure FOCUS dataset: https://learn.microsoft.com/en-us/azure/cost-management-billing/dataset-schema/cost-usage-details-focus
- [Z3] Azure Cost Management access: https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/assign-access-acm-data
- [Z4] Azure storage roles: https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/storage
- [F1] FOCUS: https://focus.finops.org/focus-specification/
- [F2] FOCUS licence: https://github.com/FinOps-Open-Cost-and-Usage-Spec/FOCUS_Spec/blob/working_draft/license.md
- [F3] FOCUS releases: https://github.com/FinOps-Open-Cost-and-Usage-Spec/FOCUS_Spec/releases
- [F4] FOCUS 1.4 changelog: https://github.com/FinOps-Open-Cost-and-Usage-Spec/FOCUS_Spec/blob/v1.4/CHANGELOG.md
- [F5] FOCUS 1.4 cost and usage columns: https://github.com/FinOps-Open-Cost-and-Usage-Spec/FOCUS_Spec/tree/v1.4/specification/datasets/cost_and_usage/columns
- [O1] OpenCost repository and CNCF incubation: https://github.com/opencost/opencost, https://www.cncf.io/blog/2024/10/31/opencost-advances-to-the-cncf-incubator/
- [O2] OpenCost specification: https://opencost.io/docs/specification
- [O3] OpenCost API: https://opencost.io/docs/integrations/api
- [O4] OpenCost default prices: https://github.com/opencost/opencost/blob/develop/configs/default.json
- [O5] OpenCost AWS, GCP and Azure pricing: https://opencost.io/docs/configuration/aws, https://opencost.io/docs/configuration/gcp, https://opencost.io/docs/configuration/azure
- [K1] Kubecost allocation API: https://docs.kubecost.com/apis/monitoring-apis/api-allocation
- [P1] AWS Price List bulk API: https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/using-the-aws-price-list-bulk-api-fetching-price-list-files-manually.html
- [P2] AWS Price List query API: https://docs.aws.amazon.com/aws-cost-management/latest/APIReference/API_pricing_GetProducts.html
- [P3] GCP Cloud Billing Catalog API: https://docs.cloud.google.com/billing/v1/how-tos/catalog-api
- [P4] Azure Retail Prices API: https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices
- [D1] Datadog Cloud Cost Management: https://docs.datadoghq.com/cloud_cost_management/
- [D2] Datadog container cost allocation: https://docs.datadoghq.com/cloud_cost_management/container_cost_allocation/
- [D3] Datadog cost tags: https://docs.datadoghq.com/cloud_cost_management/tags/
- [D4] Datadog custom costs: https://docs.datadoghq.com/cloud_cost_management/setup/custom/
- [D5] Datadog unit cost API: https://docs.datadoghq.com/api/latest/cloud-cost-management/create-a-unit-cost/
- [R1] Grafana Cloud Kubernetes cost: https://grafana.com/docs/grafana-cloud/monitor-infrastructure/kubernetes-monitoring/manage-costs/
- [R2] Grafana FOCUS: https://grafana.com/whats-new/2026-04-23-focus--standardized-cost-and-usage-data/
- [V1] Vantage Kubernetes: https://docs.vantage.sh/kubernetes
- [V2] Vantage Kubernetes agent: https://www.vantage.sh/blog/kubernetes-cost-monitoring-agent
- [V3] Vantage per-unit costs: https://docs.vantage.sh/per_unit_costs/
- [V4] Vantage changelog (FOCUS export): https://docs.vantage.sh/changelog
- [M1] k8sclusterreceiver metrics: https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/k8sclusterreceiver/documentation.md
- [M2] k8sclusterreceiver `allocatable_types_to_report`: https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/k8sclusterreceiver/README.md
- [M3] kubeletstatsreceiver metrics: https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/kubeletstatsreceiver/documentation.md
- [M4] k8sattributesprocessor: https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/processor/k8sattributesprocessor/README.md
- [L1] Kubernetes well-known labels: https://kubernetes.io/docs/reference/labels-annotations-taints/
- [L2] Karpenter NodePools: https://karpenter.sh/docs/concepts/nodepools/
- [L3] EKS managed node groups: https://docs.aws.amazon.com/eks/latest/userguide/managed-node-groups.html
- [S1] OpenTelemetry, service name from Kubernetes attributes: https://opentelemetry.io/docs/specs/semconv/non-normative/k8s-attributes/
