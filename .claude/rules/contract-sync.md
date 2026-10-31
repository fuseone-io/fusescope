# Contract sync

Two clients consume FuseScope's API contract and must ship with it:

| Repo | Consumes |
|---|---|
| `fuseone-io/fusescope-mcp-server` | API paths, payloads, query/alert/dashboard schemas, tool descriptions |
| `fuseone-io/terraform-provider-fusescope` | resource APIs (CRUD paths, request/response bodies, enums, defaults) |

## What counts as a contract change

- An HTTP route added, removed or renamed, or its request/response shape, enum values, defaults or validation changed.
- `docs/api/openapi.yml` changes (`make gen-openapi-specs`).
- Query builder, alert rule, dashboard, notification channel or route policy schemas.
- Auth: headers, roles, API key behaviour.
- Feature availability: something removed from or rejected by the community build.

## Rule

- A contract change is not done until both clients are updated. Open the follow-up PRs in the same work session, or open an issue in each client repo when the change is deferred.
- Link them from the backend PR's **Additional Information**: `MCP: <PR or issue>` / `Terraform: <PR or issue>`, or `MCP/Terraform: not affected — <reason>`.
- New API that a client should expose (a resource, a tool) belongs in `docs/api/openapi.yml` first. Clients generate from the spec; never hand-code around a missing spec entry.
- Removals and rejections land in the clients too: stop advertising what the backend refuses.
- Merge order: backend first, then the clients, released against a backend version that has the change.
