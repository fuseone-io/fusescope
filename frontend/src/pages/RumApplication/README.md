# Rum Application

One Real User Monitoring application, in four tabs:

- **Overview**: sessions, views and session error rate, Web Vitals p75 with their good /
  needs-improvement / poor split, top routes by LCP, recent errors linked to the Logs
  explorer, and recent sessions linked to their timeline and to the backend trace of their
  slowest or failing request.
- **Views**: one row per route template with page loads, route changes, LCP / INP / CLS p75,
  time on view, errors and the slowest request. A route opens a sheet with its vitals over
  time and release markers, slowest requests with their trace and backend service,
  browsers and OS, and recent sessions.
- **Errors**: coming soon.
- **Sessions**: sessions filtered by release, browser, route, duration, user and errors; a
  session opens its timeline: a summary, the views along the session with action and error
  ticks, and each view's request waterfall and events, linking requests to their trace and
  errors to the Logs explorer.

Reached from a row of the applications list.

## Structure

| Path | Purpose |
| --- | --- |
| `index.tsx` | Header, routed tabs, toolbar and the settings sheet. |
| `components/` | Header, toolbar and the Overview panels. |
| `Views/` | The Views tab and its route sheet. |
| `Sessions/` | The session list and its filters. |
| `SessionTimeline/` | One session's timeline. |
| `hooks/` | The application and its overview; the release param. |
| `utils.ts` | Explorer filters, the tab of a path and the params tabs share. |

## Data

- `GET /api/v1/rum/applications/{id}` and `/status`.
- `POST /api/v5/query_range` for the Overview (`lib/rum/overviewQueries.ts`,
  `lib/rum/sessionRequests.ts`).
- `GET /api/v1/rum/applications/{id}/views`, `/views/{route}` (route percent-encoded),
  `/sessions` and `/sessions/{sessionId}`, through the generated client.

## State

In the URL: the tab (route), `release` on every tab, `route` for the open route sheet, and
the session filters and page (`browser`, `route`, `userId`, `hasError`, `minDuration`,
`maxDuration`, `page`, `pageSize`). Sorting, the open sheet section, the event kind filter
and expanded views are component state. The time range is the global one.

## Routing

| Route | Tab |
| --- | --- |
| `ROUTES.RUM_APPLICATION` (`/frontend/applications/:id`) | Overview |
| `ROUTES.RUM_APPLICATION_VIEWS` (`…/views`) | Views |
| `ROUTES.RUM_APPLICATION_SESSIONS` (`…/sessions`) | Sessions |
| `ROUTES.RUM_APPLICATION_SESSION` (`…/sessions/:sessionId`) | Session timeline |

The breadcrumb names the application from the query cache, and a session by its short id.
