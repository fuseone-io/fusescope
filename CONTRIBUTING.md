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
- **License.** The source is MIT. New dependencies are MIT, BSD, Apache-2.0 or ISC, or MPL-2.0 used unmodified (never vendored, copied or patched; attributed in `NOTICE`). Never read or copy SigNoz's proprietary `ee/` code: features that only existed there are written clean-room, and the commit says so. Don't add imports of `fusescope-otel-collector` (AGPL-3.0); `make agpl-check` fails on any. Docs are written from our code, never adapted from signoz.io (CC BY-NC-ND).
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
- CI labels, added by maintainers:
  - `safe-to-integrate` runs the integration matrix.
  - `safe-to-e2e` runs Playwright when the diff doesn't touch Go, `frontend/`, `docs/api/` or `tests/e2e/`.
  - `safe-to-test` lets CI run on fork and bot PRs. It runs the PR's code with the repository's secrets (`pull_request_target`), so add it only after reading the diff.
- **On a fork or Dependabot PR, a label authorises one head.**
  - The run also needs an approving review on that head by someone with write or admin permission on the repository.
  - Read the diff, check the head SHA in the PR header, approve, then add the label.
  - The label counts only if it was added after that head was pushed. Each new push or reopen removes the labels (`prlabels`), and an older one is ignored even if it stays.
- **On a PR from this repository, the labels stay across pushes.** `safe-to-integrate` decides whether the integration matrix runs, and it runs again on every push while the label is on.
- **Every PR gets the required verdicts `goci`, `e2e` and `integrationci`.** Each passes without running tests when the diff has nothing for it to test. It fails when tests were needed and either did not pass or lacked a label for the head. A run that does not decide reports as `<name> (ignored)`.
- Dependabot opens grouped PRs weekly (`.github/dependabot.yml`). They get no CI until a maintainer approves the head and adds `safe-to-test`, plus `safe-to-integrate` for the integration matrix. Do both again after Dependabot rebases.
- CI runs what the diff affects, decided by [`.github/actions/changes`](.github/actions/changes/changes.py): a frontend-only PR skips `goci` and runs only the integration suites that drive the UI; a Go-only PR skips the frontend unit and Storybook tests but runs e2e; a suite-only PR runs just that suite's group. Workflows, dependency manifests, test fixtures, Dockerfiles, the Makefile and any unclassified path run everything. Each workflow's `changes` job summary says what ran and why.
- PRs that only change documentation (Markdown files, `docs/` except `docs/api/`) still run the workflows, and their verdicts pass without tests. Don't use `[skip ci]`: a skipped workflow leaves its required check pending and blocks the merge.
- PRs merge by rebase, with CI green.

## Report a problem

Use the [bug report](https://github.com/fuseone-io/fusescope/issues/new?template=bug_report.md), [feature request](https://github.com/fuseone-io/fusescope/issues/new?template=feature_request.md) or [performance](https://github.com/fuseone-io/fusescope/issues/new?template=performance-issue-report.md) templates. Report security issues privately, as described in [SECURITY.md](SECURITY.md).
