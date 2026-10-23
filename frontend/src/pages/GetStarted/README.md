# Get Started

The data source catalog at `/get-started` and the in-app setup guides at
`/get-started/:guideId`. Reached from the sidebar's **New source**, Home, the
Logs, Traces and Metrics empty states and the Integrations header. The old
`/get-started-with-signoz-cloud` redirects here, keeping its query.

## Structure

| Path | Purpose |
| --- | --- |
| `index.tsx` | The catalog: ingestion panel, search and goal filter, sections, OTLP snippets. |
| `constants.ts` | The catalog config: one `CatalogEntry` per source, grouped in `CATALOG_SECTIONS`. |
| `guides/` | One module per in-app guide (`nodejs`, `python`, `java`, `dotnet`, `go`) and the shared snippet builders. Commands must match the docs page each guide links. |
| `Guide/` | The guide page: four steps, the aside, and the status polling. |
| `components/IngestionEndpoints` | The OTLP endpoints with copy buttons and the admin's inline edit. Also used on Home. |
| `GetStartedRedirect.tsx` | The old route's redirect. |

An entry opens its in-app guide when it has a `guideId`, an in-app page when it
has an `appRoute` (RUM, integrations), and its docs page otherwise. Docs slugs
are checked against the published pages in `__tests__/catalog.test.ts`.

## Data

| Endpoint | Hook | Used for |
| --- | --- | --- |
| `GET /api/v1/onboarding/ingestion` | `useIngestion` | Endpoints in the panel, the snippets and Home. |
| `PUT /api/v1/onboarding/ingestion` | `useUpdateOnboardingIngestion` | Admin override of the OTLP/HTTP URL; `''` clears it. |
| `GET /api/v1/onboarding/status` | `useOnboardingStatus` | The status strip (every 30 s) and a guide's step 4 (every 5 s, with `service` and `since`). |
| `GET /api/v1/integrations/:id/connection_status` | `useReceivingIntegrations` | "Receiving" on installed built-in integrations. |

The community collector takes no ingestion key, so nothing here calls the
gateway ingestion keys API.

## State

Search text and goal filter are mirrored to the URL as `?q=` and `?goal=`; the
input reads local state so fast typing is not lost. A guide's service name,
environment, route and runtime are local state.

## Routing

`GET_STARTED` and `GET_STARTED_GUIDE` in `constants/routes.ts`, lazy pages
`GetStartedPage`, `GetStartedGuidePage` and `GetStartedRedirect` in
`AppRoutes/pageComponents.ts`. All roles can open them; only admins see the
endpoint edit.
