# Rum Application

One Real User Monitoring application, in four tabs:

- **Overview**: sessions, views and session error rate, Web Vitals p75 with their good /
  needs-improvement / poor split, top routes by LCP, recent error groups linked to their
  detail, and recent sessions linked to their timeline and to the backend trace of their
  slowest or failing request.
- **Views**: one row per route template with page loads, route changes, LCP / INP / CLS p75,
  time on view, errors and the slowest request. A route opens a sheet with its vitals over
  time and release markers, slowest requests with their trace and backend service,
  browsers and OS, and recent sessions.
- **Errors**: groups by fingerprint with their trend, events, share of sessions, releases,
  "New in" and "Source map missing" badges, filtered by search, source and route. A group
  opens its detail: the stack symbolicated through uploaded source maps (original or
  minified, library frames folded) or the upload command when the release has none, the
  latest events, breadcrumbs ending with the error, the failed request before it with its
  backend trace, and the affected sessions.
- **Sessions**: sessions filtered by release, browser, route, duration, user and errors; a
  session opens its timeline: a summary, the views along the session with action and error
  ticks, and each view's request waterfall and events, linking requests to their trace and
  errors to their group, with their logs beside.

The header's **Create alert** menu, a route sheet's **Create alert** and an error group's
**Alert on this error** open the alert editor on a frontend template (`lib/rum/alertTemplates.ts`):
LCP p75 per route or on one route, session error rate, and the JS error count of the
application or of one error.

Reached from a row of the applications list.

## Structure

| Path | Purpose |
| --- | --- |
| `index.tsx` | Header, routed tabs, toolbar and the settings sheet. |
| `components/` | Header, toolbar and the Overview panels. |
| `Views/` | The Views tab and its route sheet. |
| `Errors/` | The error groups, their filters and one group's detail (`ErrorDetail/`). |
| `Sessions/` | The session list and its filters. |
| `SessionTimeline/` | One session's timeline. |
| `hooks/` | The application and its overview; the release param. |
| `utils.ts` | Explorer filters, the tab of a path and the params tabs share. |

## Data

- `GET /api/v1/rum/applications/{id}` and `/status`.
- `POST /api/v5/query_range` for the Overview (`lib/rum/overviewQueries.ts`,
  `lib/rum/sessionRequests.ts`).
- `GET /api/v1/rum/applications/{id}/views`, `/views/{route}` (route percent-encoded),
  `/sessions`, `/sessions/{sessionId}`, `/errors`, `/errors/{fingerprint}` and
  `/sourcemaps`, through the generated client.

## State

In the URL: the tab (route), `release` on every tab, `route` for the open route sheet, the
error filters (`q`, `source`, `route`) and selected `event`, and the session filters and page (`browser`, `route`, `userId`, `hasError`, `minDuration`,
`maxDuration`, `page`, `pageSize`). Sorting, the open sheet section, the event kind filter
and expanded views are component state. The time range is the global one.

## Routing

| Route | Tab |
| --- | --- |
| `ROUTES.RUM_APPLICATION` (`/frontend/applications/:id`) | Overview |
| `ROUTES.RUM_APPLICATION_VIEWS` (`…/views`) | Views |
| `ROUTES.RUM_APPLICATION_SESSIONS` (`…/sessions`) | Sessions |
| `ROUTES.RUM_APPLICATION_SESSION` (`…/sessions/:sessionId`) | Session timeline |
| `ROUTES.RUM_APPLICATION_ERRORS` (`…/errors`) | Errors |
| `ROUTES.RUM_APPLICATION_ERROR` (`…/errors/:fingerprint`) | Error group |

The breadcrumb names the application from the query cache, a session by its short id and an
error group by its fingerprint.
