# FuseScope · engineering rules

FuseScope is FuseOne's OpenTelemetry-native observability platform (APM, traces,
metrics, logs, alerts on ClickHouse). It is a **hard fork of SigNoz**: we own the
code and do not track upstream; useful upstream fixes are cherry-picked by hand.

| Repo | What | License |
|---|---|---|
| `fuseone-io/fusescope` (this) | Go backend (`cmd/community`, `pkg/`), React frontend (`frontend/`), integration/e2e tests (`tests/`) | MIT |
| `fuseone-io/fusescope-otel-collector` | collector + ClickHouse schema migrator (owns the telemetry schema) | AGPL-3.0 |
| `fuseone-io/fusescope-charts` | Helm charts | MIT |

These rules apply repo-wide. Topic rules live in [`.claude/rules/`](.claude/rules/)
(comments, Go, pytest, pull requests) and the frontend has its own
[`frontend/CLAUDE.md`](frontend/CLAUDE.md). Go architecture guides are in
[`docs/contributing/go/`](docs/contributing/go/) — read the relevant one before
adding a provider, module, handler or SQL. Claude Code setup (plugins, agents,
skills, hooks): [`docs/contributing/claude-code.md`](docs/contributing/claude-code.md).

## License posture (non-negotiable)

- Source in this repo is **MIT**. Never add GPL/AGPL/SSPL/BUSL/Commons-Clause code
  or dependencies; new dependencies must be MIT, BSD, ISC or Apache-2.0.
- SigNoz's `ee/` and `cmd/enterprise/` trees are **proprietary** and were removed.
  Features that only existed there (PostgreSQL metastore, SSO, RBAC, …) are
  re-implemented **clean-room**: work from our interfaces, the MIT code and public
  docs; never read, copy or translate `ee/` code from git history or upstream.
  Say so in the commit message.
- The backend binary links no `fusescope-otel-collector` (AGPL-3.0) code
  ([ADR 0001](docs/adr/0001-agpl-collector-dependency.md)). Do not add imports of
  collector packages; write shared code (schema constants, helpers) in this repo
  clean-room. `make agpl-check` (`scripts/agplguard`, the `goci` job) fails on
  any collector package. Third-party code is attributed in `NOTICE`.
- Keep SigNoz copyright notices intact (`LICENSE`, file headers).

## Tests first

- **Behaviour changes start with a failing test**: new features, business rules,
  endpoints, migrations, SQL. Write the test, see it fail, then implement.
- **Bug fixes start with a regression test** that fails on `main` and stays in the
  tree.
- Not required for copy/visual tweaks, generated code or behaviour-preserving
  refactors — the existing tests must still pass.
- Go: table-driven, next to the source (see [`go-test`](.claude/rules/go-test.md)).
  Integration: pytest under `tests/` (see [`pytest`](.claude/rules/pytest.md)).
  Frontend: Jest + Testing Library, Storybook play tests, Playwright e2e.
- Anything persisted must work on **both SQLite and PostgreSQL**. CI runs the
  integration suites on both; run the relevant suite on PostgreSQL locally when
  touching SQL, migrations or `pkg/sqlstore`/`pkg/sqlschema`.
- Tests for enterprise-only features that the community build does not ship are
  skipped **with a reason**, never deleted or left failing.

## Toolchain

- Go: `GOTOOLCHAIN=go1.25.14` (newer local Go versions break `bytedance/sonic`).
- Frontend: `npx pnpm@10 …` (the repo rejects pnpm 11). Node 22.
- Integration/e2e: `cd tests && uv run pytest --basetemp=./tmp/ -vv --reuse …`
  (see [`docs/contributing/tests/`](docs/contributing/tests/)).
- Regenerate, never hand-edit, generated files: `make gen-openapi-specs`
  (then `pnpm generate:api`), `make gen-mocks`, `make semconv-generate`.

## Go

The repo conventions win over generic Go advice:

| Rule | Why |
|---|---|
| `gofmt` clean; `golangci-lint` (v2 config) clean | CI blocks otherwise |
| Errors via `pkg/errors` with a type and code (`errors.Newf`, `errors.Wrapf`), checked with `errors.Is/As` — never string compares | API maps types to HTTP status |
| Logging via the provider's `slog` logger; one line per event, right level; **never** log secrets, tokens or passwords | operability, safety |
| ClickHouse identifiers/literals built from input go through `pkg/clickhousesql` | injection safety |
| Functions ≲ 80 lines, files ≲ 500 lines — split by responsibility when longer | reviewability |
| Long-running goroutines take a `context.Context` and stop with it | no leaks |
| No `panic` outside `init`/`Must*` helpers for static input | a bad request must not crash the server |
| No new global mutable state; dependencies are passed through factories/providers | testability |
| No reflection on hot paths | performance |
| Interfaces are introduced where a second implementation or a mock is needed, not before | YAGNI |
| Comments only for non-obvious behaviour ([`go-comments`](.claude/rules/go-comments.md)) | names carry the meaning |

## Brand

- The product name is always **FuseScope** (capital F and S). Lowercase
  `fusescope` only in identifiers, URLs, images and package names.
- Colours: FuseOne blue `#0f5fb8` → purple `#950fb8`; dark ground
  `#031f40` → `#1d0128`; type is Inter. Source of truth:
  `fuseone-io/fuseone-brand`.
- Logo assets live in [`docs/brand/`](docs/brand/) (mark, app icon, light/dark
  and theme-independent lockups); the app icon used by the UI is
  `frontend/src/assets/Logos/fusescope-brand-logo.svg`. Reuse them, never redraw.
- Internal contracts keep their SigNoz names until deliberately migrated:
  `SIGNOZ_*` env vars, `X-SigNoz-URL` / `SigNoz-Api-Key` headers,
  `@signozhq/*` packages, collector component types (`signozlogspipeline`, …).

## Commits and pull requests

- Conventional commits, scoped and imperative: `feat(sqlstore): …`,
  `fix(frontend): …`. One logical change per commit; generated code (OpenAPI,
  API clients) in its own commit.
- Body explains **why**, briefly. AI-assisted commits end with the
  `Co-Authored-By: Claude … <noreply@anthropic.com>` trailer.
- Amending and force-pushing are fine on PR branches before merge; **never
  rewrite `main`**. Merges are fast-forward.
- PRs follow [`.github/pull_request_template.md`](.github/pull_request_template.md)
  and the [`pull-requests`](.claude/rules/pull-requests.md) rule, and are merged
  only with CI green.

## When to ask

- **Ask** before: adding a dependency, anything touching licensing or the
  `ee/` boundary, decisions spanning several PRs (storage, schema, auth model),
  renaming an external contract (env var, header, config key, API path).
- **Don't ask** about mechanical choices (naming, formatting, file layout within
  these rules) — decide and move on.
