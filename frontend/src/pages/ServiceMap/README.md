# Service Map

Calls between services as a layered graph (entry points left, deeper
dependencies right), with dependencies that run no SDK inferred from their
callers' spans, a rule-based root cause, the selected node's details and every
caller → callee pair. Reached from the sidebar and the Services list.

## Structure

| Path | Purpose |
| --- | --- |
| `index.tsx` | Header band, filters and the state switch. |
| `components/` | KPI strip, root-cause banner, toolbar, canvas (SVG edges + node buttons), node panel, dependencies table, states. |
| `hooks/` | `useServiceMapGraph` (all map data), `useServiceDetails` (selected service), `useGraphViewport` (pan/zoom/fit), view state. |
| `utils/` | Pure, tested: graph assembly, layered layout, root cause, scene, health, KPIs, requests. |

## Data

- `POST /api/v1/dependency_graph` (`dependency_graph_minutes_v2`): edges from
  spans whose parent is in another service, and from non-SERVER spans carrying
  `db.system` / `messaging.system`. It filters only on
  `deployment.environment`, `k8s.cluster.name` and `k8s.namespace.name`;
  other offered keys (`service.namespace`) scope the map to the services they
  match.
- v5 `query_range`: the Services list's entry-span stats and type signals, plus
  one request for `rpc.system` (protocols), `peer.service` on client spans,
  external addresses from span metrics and the db/messaging systems seen.
- Selected service: the Services pages' KPIs (`useServiceKpis`), top
  operations, SERVER span percentiles and resource attributes.

## Root cause

A service with ≥ 5% errors whose callees are all healthy (members of a failing
cycle count once). The path walks up callers whose calls fail. Dependencies
without an SDK are named with their caller, never blamed alone.
