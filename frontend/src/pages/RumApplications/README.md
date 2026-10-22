# Rum Applications

The Frontend › Applications list: every Real User Monitoring application with its sessions,
session error rate, Web Vitals p75 and SDK in the global time range, and the setup sheet that
creates and edits them. Reached from the **Frontend** item in the side nav.

## Structure

| Path | Purpose |
| --- | --- |
| `index.tsx` | Header, KPI strip, toolbar, table or empty state, and the setup sheet. |
| `components/` | KPIs, toolbar, table and row cells, empty and unavailable states. |
| `hooks/useApplicationsList.ts` | Applications plus their query-side metrics and SDK support. |
| `types.ts`, `utils.ts` | Row and filter types; KPI totals and filtering. |
| `stories/` | Page stories, including the setup sheet's states. |

## Data

- `GET /api/v1/rum/applications` (`useListRUMApplications`); every role reads it. Writes and
  `GET …/keys` are Admin and Editor only, so viewers get the sheet read-only, without keys.
- `GET /api/v1/rum/applications/{id}/status` for the server's supported SDK versions.
- `POST /api/v5/query_range`: sessions, error sessions and vitals per application now and a
  period back, the latest SDK and activity (`lib/rum/applicationsQueries.ts`).

## State

Filters and the open sheet are component state; server state is React Query.

## Routing

`ROUTES.RUM_APPLICATIONS` (`/frontend/applications`), `RumApplicationsPage` in
`AppRoutes/pageComponents.ts`. `/frontend` maps to it in the side nav.
