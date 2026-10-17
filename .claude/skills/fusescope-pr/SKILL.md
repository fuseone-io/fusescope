---
name: fusescope-pr
description: Finish a FuseScope change and open its pull request. Runs the checks CI runs for the areas the branch touched, splits generated code into its own commit, writes conventional commits and a PR body that follows the template, and suggests the CI labels. Use when the user says a change is done, asks to commit, to open/prepare a PR, or to "ship" a branch.
---

# Ship a FuseScope change

Rules this skill applies: [CLAUDE.md](../../../CLAUDE.md), [pull-requests](../../rules/pull-requests.md), [comments](../../rules/comments.md), and for frontend changes [frontend/AGENTS.md](../../../frontend/AGENTS.md).

## 1. Branch

If on `main`, create a branch first (`fix/…`, `feat/…`, `chore/…`). Never commit to `main`.

## 2. Classify the diff

`git diff --stat $(git merge-base origin/main HEAD)` plus unstaged changes. Tick every area touched:

| Area | Paths |
|---|---|
| Go | `*.go`, `go.mod`, `go.sum` |
| API contract | handlers/routes in `pkg/apiserver`, `pkg/types` request/response types |
| SQL | `pkg/sqlmigration`, `pkg/sqlstore`, `pkg/sqlschema`, `pkg/modules/**/store*.go` |
| Frontend | `frontend/**` |
| Integration tests | `tests/integration/**`, `tests/fixtures/**` |
| E2E | `tests/e2e/**` |
| CI | `.github/**` |

## 3. Tests-first check

For a behaviour change or bug fix, there must be a test in the diff that fails without the change. If there is none, stop and say so. Copy/visual tweaks, generated code and behaviour-preserving refactors are exempt.

## 4. Run the checks for each area

Run them; fix failures before going on. Report each with pass/fail.

- **Go**: `GOTOOLCHAIN=go1.25.7 go build ./...`, `gofmt -l $(git diff --name-only … -- '*.go')` (must print nothing), `GOTOOLCHAIN=go1.25.7 go test ./<touched packages>/...`, `golangci-lint run ./<touched packages>/...`, `go mod tidy` leaves `go.mod`/`go.sum` unchanged.
- **API contract**: `make gen-openapi-specs`, then `cd frontend && npx pnpm@10 generate:api`. Any resulting change is committed separately (step 5).
- **Mocks**: interfaces listed in `.mockery.yml` changed → `make gen-mocks`.
- **SQL**: run the affected integration suite on both stores, from `tests/`:
  `uv run pytest --basetemp=./tmp/ -vv --reuse --sqlstore-provider sqlite integration/tests/<suite>` and again with `--sqlstore-provider postgres`.
- **Frontend** (Node 22, `npx pnpm@10`): `tsgo --noEmit`, `lint`, `fmt`, `test <changed paths>`; the full `test` when providers, hooks or utils changed; `build` when routing, config or dependencies changed.
- **E2E**: when a flow changed, run the relevant spec (stack up per `docs/contributing/tests/e2e.md`).
- **License**: when dependencies, imports or clean-room features are involved, run the `license-guard` agent and resolve BLOCKING findings.

## 5. Commits

- One logical change per commit. Generated files (`docs/api/openapi.yml`, `frontend/src/api/generated/**`, mocks) in their own commit: `chore(api): regenerate OpenAPI spec and client`.
- Title: conventional, scoped, imperative, ≤ 72 chars (`fix(frontend): …`, `feat(sqlstore): …`).
- Body: only when a decision needs explaining; never restate the diff. Never `Closes #…` in commits.
- Clean-room features: the body states they were implemented without consulting SigNoz `ee/` code.
- End with the AI trailer given by the session (e.g. `Co-Authored-By: Claude … <noreply@anthropic.com>`).

## 6. Pull request

Ask before pushing or opening the PR unless the user already said to.

Title = the main commit title. Body from [`.github/pull_request_template.md`](../../../.github/pull_request_template.md), keeping only headings that have content and deleting their `<!-- -->` placeholders:

```
#### Description

- <what changed and why, for a reviewer skimming; 1–4 bullets>

#### Test plan

- [x] <test written first: what it asserts, that it failed before the fix>
- [x] <checks from step 4 that ran>

#### Issues closed by this PR

Closes #<n>
```

Add `#### Screenshots / Screen Recordings` for visible UI changes and `#### Additional Information` for breaking changes or follow-ups. End with the session's PR attribution line.

`gh pr create --title … --body-file …`, then suggest labels:

- `safe-to-integrate` when Go, SQL or integration tests changed (integration CI only runs with it).
- `safe-to-e2e` when e2e should run and the diff doesn't touch `frontend/` or `tests/e2e/`.

## 7. Report

Branch, commits (sha + title), checks with results, PR URL, labels to add. Mention anything skipped and why.
