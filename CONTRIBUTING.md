# Contributing to FuseScope

Thanks for helping. This page is the short version of how we work; the engineering rules in [CLAUDE.md](CLAUDE.md) apply to humans and agents alike, and the guides in [`docs/contributing/`](docs/contributing/) go deeper.

## Pick something to work on

- [Open issues](https://github.com/fuseone-io/fusescope/issues), or [good first issues](https://github.com/fuseone-io/fusescope/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22). The [README roadmap](README.md#roadmap) gives the order for larger work.
- Comment on the issue before you start, so two people don't take the same one.
- Ask in the issue first when the change adds a dependency, touches licensing or the `ee/` boundary, spans several PRs (storage, schema, auth model), or renames an external contract (env var, header, config key, API path).

## Set up

- [Local development](docs/contributing/development.md): toolchain, ClickHouse, collector, backend, frontend, and macOS notes.
- [Integration tests](docs/contributing/tests/integration.md) (pytest) and [e2e tests](docs/contributing/tests/e2e.md) (Playwright).
- [Working with Claude Code](docs/contributing/claude-code.md): the shared agents, skills and hooks in `.claude/`.

## How we work

- **Tests first.** A behaviour change starts with a test that fails; a bug fix starts with a regression test that fails on `main` and stays in the tree. Copy tweaks, generated code and behaviour-preserving refactors are exempt.
- **SQLite and PostgreSQL.** Anything persisted works on both; run the affected integration suite with `--sqlstore-provider sqlite` and `postgres`.
- **License.** The source is MIT. New dependencies are MIT, BSD, Apache-2.0 or ISC only. Never read or copy SigNoz's proprietary `ee/` code: features that only existed there are written clean-room, and the commit says so. Don't add imports of `fusescope-otel-collector` (AGPL-3.0); `make agpl-check` fails on any. Docs are written from our code, never adapted from signoz.io (CC BY-NC-ND).
- **Enterprise-only tests** that the community build can't pass are skipped at collection with a reason that links the roadmap issue, never deleted or left failing.
- **Generated files** (OpenAPI spec, API client, mocks, semconv) are regenerated with the `make gen-*` targets, never hand-edited.
- **Area guides.** Go: [`docs/contributing/go/`](docs/contributing/go/). Frontend: [`frontend/AGENTS.md`](frontend/AGENTS.md).

## Commits and pull requests

- [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), scoped and imperative: `fix(frontend): …`, `feat(sqlstore): …`. One logical change per commit; generated code in its own commit. The body says why, briefly, and only when the title isn't enough.
- Work on a branch; `main` is never rewritten. Amending and force-pushing your PR branch is fine.
- Before opening the PR, run the checks for the areas you touched:

  | Area | Checks |
  |---|---|
  | Go | `GOTOOLCHAIN=go1.26.10 go test ./<pkg>/...`, `gofmt -l`, `golangci-lint run` (v2) |
  | Frontend | `npx pnpm@10 tsgo --noEmit`, `lint`, `fmt`, `test <path>`; `build` when routing, config or dependencies change |
  | API contract | `make gen-openapi-specs`, then `npx pnpm@10 generate:api` in `frontend/` |
  | Integration tests | `make py-fmt`, `make py-lint`, the affected suite on both stores |

- Fill in the [PR template](.github/pull_request_template.md), keeping only the headings that apply. Put `Closes #<n>` in the description, not in commits.
- CI labels, added by maintainers: `safe-to-integrate` runs the integration matrix, `safe-to-e2e` runs Playwright when the diff doesn't touch `frontend/` or `tests/e2e/`, and `safe-to-test` lets CI run on fork and bot PRs.
- PRs that only change documentation (Markdown files, `docs/` except `docs/api/`) skip the Go, frontend, e2e and integration workflows; only the commit check runs. No `[skip ci]` needed.
- PRs merge by rebase, with CI green.

## Report a problem

Use the [bug report](https://github.com/fuseone-io/fusescope/issues/new?template=bug_report.md), [feature request](https://github.com/fuseone-io/fusescope/issues/new?template=feature_request.md) or [performance](https://github.com/fuseone-io/fusescope/issues/new?template=performance-issue-report.md) templates. Report security issues privately, as described in [SECURITY.md](SECURITY.md).
