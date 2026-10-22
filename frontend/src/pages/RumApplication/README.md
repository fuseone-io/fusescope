# Rum Application

One Real User Monitoring application's overview: sessions, views and session error rate,
Web Vitals p75 with their good / needs-improvement / poor split, top routes by LCP, recent
errors linked to the Logs explorer, and recent sessions linked to the backend trace of their
slowest or failing request. Views, Errors and Sessions tabs are placeholders for phase 2.
Reached from a row of the applications list.

## Structure

| Path | Purpose |
| --- | --- |
| `index.tsx` | Header, tabs, release filter, overview and the settings sheet. |
| `components/` | Header, KPIs, routes, errors and sessions panels. |
| `hooks/useApplicationOverview.ts` | The application, its overview query and per-session follow-ups. |
| `utils.ts` | Explorer filters and session id formatting. |

## Data

- `GET /api/v1/rum/applications/{id}` and `/status`.
- `POST /api/v5/query_range`: one scalar request for the overview
  (`lib/rum/overviewQueries.ts`), then errors per session and a raw request for the
  sessions' HTTP spans (`lib/rum/sessionRequests.ts`).

## State

The release filter and the sheet are component state; the time range is the global one.

## Routing

`ROUTES.RUM_APPLICATION` (`/frontend/applications/:id`); the breadcrumb names the
application from the query cache.
