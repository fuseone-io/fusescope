# Page template

The parts a new-UI page is built from. Built on `components/ui` and the
`--fs-*` tokens; see [`../ui/README.md`](../ui/README.md) for the rules.

| Part | Use |
| --- | --- |
| `PageTemplate` | Page column: background, gutters, 1600px max width, 24px rhythm. |
| `PageHeader` | Title (`titleMono` for entity names), icon tile, badges, description, meta row, actions slot. |
| `PageTabs` + `useQueryParamTab` | Controlled tabs; the hook keeps the value in a query param (`?tab=`). Only the active tab is mounted. |
| `KpiStrip` + `Stat` | A row of stats in one rounded border, separated by 1px lines. |
| `Panel` | Raised section with optional title, subtitle and actions. |
| `SortableTableHead`, `TablePagination`, `StatusBadge`, `ImpactBar` | Helpers for `components/ui/table`: sortable headers with `aria-sort`, prev/next pagination, tone badges, share bars. `utils.ts` sorts and pages rows. |

## `fs-ui` scope

`PageTemplate` does not carry `fs-ui`: pages still embed legacy widgets
(antd, `@signozhq/ui`, uPlot charts) that the reset would restyle. Each part
scopes its own new-UI markup instead, and `Panel` scopes only its header, so a
legacy chart or table in a panel body renders as before.

## Used by

- Services list (`pages/Services/components/ServicesList`)
- Service detail (`pages/MetricsApplication`, `container/MetricsApplication`)

Stories: `Components/Page Template` (light and dark).
