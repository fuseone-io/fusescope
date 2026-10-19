# Page template

The parts a new-UI page is built from. Built on `components/ui` and the
`--fs-*` tokens; see [`../ui/README.md`](../ui/README.md) for the rules.

| Part | Use |
| --- | --- |
| `PageTemplate` | Page column: background, 1600px max width, 24px rhythm, and the same padding on every side as the app header's horizontal padding (16px, 32px from `md`). |
| `PageHeader` | Title (`titleMono` for entity names), icon tile, badges, description, meta row, actions slot. |
| `PageTabs` + `useQueryParamTab` | Controlled tabs; the hook keeps the value in a query param (`?tab=`). Only the active tab is mounted. |
| `KpiStrip` + `Stat` | A row of stats in one rounded border, separated by 1px lines. |
| `Panel` | Raised section with optional title, subtitle and actions. |
| `SortableTableHead`, `TablePagination`, `StatusBadge`, `ImpactBar` | Helpers for `components/ui/table`: sortable headers with `aria-sort`, prev/next pagination, tone badges, share bars. `utils.ts` sorts and pages rows. |
| `HeaderBandLayout` + `CompactPageHeader` | Explorer-style pages without route tabs (`ModuleTabsLayout` has them): the same full-width band with a one-row header above full-width content. `bounded` hands the remaining viewport height to panes that scroll on their own. |
| `NumberedTablePagination` | Server-side paging: visible range, numbered pages and a page-size menu. |
| `RailToggleButton` | Collapses a filter rail, or reopens it from the toolbar. |
| `UserAvatarCell` | A user in a table cell: their initial in a circle, then their email. |
| `HttpStatusCodeBadge` | An HTTP status code as a `StatusBadge`; `httpStatusTone` maps a code to its tone. |

## `fs-ui` scope

`PageTemplate` does not carry `fs-ui`: pages still embed legacy widgets
(antd, `@signozhq/ui`, uPlot charts) that the reset would restyle. Each part
scopes its own new-UI markup instead, and `Panel` scopes only its header, so a
legacy chart or table in a panel body renders as before.

## Used by

- Services list (`pages/Services/components/ServicesList`)
- Service detail (`pages/MetricsApplication`, `container/MetricsApplication`)
- Traces funnels and funnel detail (`pages/TracesFunnels`, `pages/TracesFunnelDetails`)
- Saved views of every explorer (`pages/SaveView`)
- Trace details (`pages/TraceDetailsV3`)

Stories: `Components/Page Template` (light and dark).
