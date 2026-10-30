# Public dashboards

Only organization administrators can publish, update or revoke a read-only link from dashboard settings. No license is required. Editors and viewers can read the sharing configuration but cannot publish, change it, or revoke it.

The administrator controls whether anonymous visitors can change the time range. When disabled, the server always uses the configured relative range, ignoring client bounds. Both explicit and default ranges must be positive and cannot exceed 30 days; the server rejects larger ranges. Panel queries come exclusively from the stored dashboard, with variable values taken from its saved defaults (text variables use their saved value). URL parameters cannot replace queries or variable values. Changing saved dashboard defaults changes subsequent public queries. Query and dynamic variables are not queried to discover new values for anonymous visitors; configure explicit defaults when a published panel uses them.

Unpublishing deletes the public configuration. Publishing again generates a new link; the old link stays revoked. Deleting the dashboard also removes its public configuration. Public responses use `Cache-Control: no-store`. Revocation prevents subsequent requests; it cannot erase data a visitor has already received or cancel a query already in flight.

## Audit logs

The audit provider defaults to `noop`. To audit anonymous access, explicitly set `auditor.provider: log`. This enables auditing for all audited routes, not only public dashboards. The `log` provider uses the existing bounded batch queue and writes structured events through the server logger. Publishing, updating and revoking sharing are dashboard update events, distinguished by HTTP method and route. Anonymous dashboard and panel reads are public-dashboard read events, including failed requests that match a public route.

Events include organization (when resolvable), principal, resource, timestamp, HTTP method, route, status, outcome, remote address, user agent and trace correlation when available. Public link identifiers are SHA-256 fingerprints in audit records; transport paths use route templates. Query strings, query bodies and variable values are not included.

Events appear at INFO level under `audit event`, with `event_name`, `audit_timestamp` and structured `audit` fields. The deployment's log collection determines retention and access. This does not introduce an audit UI or a separate permanent store. Queue overflow or export failure can lose events; the existing audit metrics expose dropped events and export errors. Shutdown drains queued events.

Setting `auditor.provider: noop` explicitly disables structured audit events. Request logging still follows the API server's logging configuration. Routes excluded through `apiserver.logging.excluded_routes` are also excluded from audit.
