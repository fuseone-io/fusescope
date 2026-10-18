# Working with Claude Code

The repo ships its Claude Code setup in `.claude/`, so everyone gets the same rules, agents, skills and hooks.

## Setup

1. Open the repo in Claude Code and accept the folder trust prompt. It offers to install the plugins declared in `.claude/settings.json`: `gopls-lsp`, `pyright-lsp` and `skill-creator` from the official marketplace.
2. Install what the plugins and hooks call: `gopls` (`go install golang.org/x/tools/gopls@latest`), `pyright` (`npm i -g pyright`), `jq`, and `gh` (authenticated).
3. Toolchain as in [CLAUDE.md](../../CLAUDE.md#toolchain): `GOTOOLCHAIN=go1.25.14`, Node 22, `npx pnpm@10`, `uv`.

## What is in `.claude/`

| Path | What |
|---|---|
| `rules/` | Topic rules loaded by path (comments, Go, pytest, pull requests) |
| `agents/license-guard.md` | Read-only review of a branch against the license posture |
| `agents/playwright-test-*.md` | Plan, generate and heal e2e specs |
| `skills/fusescope-pr/` | Run the CI checks for the touched areas and open the PR |
| `skills/signoz-page-story/` | Storybook page stories with msw mocks |
| `hooks/cleanroom-guard.sh` | Blocks git access to `ee/`/`cmd/enterprise` and fetching signoz.io docs |
| `hooks/format.sh` | `gofmt` / `oxfmt` on every edited file |

`frontend/.claude/skills/scaffold-feature` scaffolds frontend features.

## Workflow

| Change | Flow |
|---|---|
| Bug | regression test first → fix → `/code-review` → `fusescope-pr` |
| Feature | design in the issue → one PR per slice, tests first → `/code-review` → `fusescope-pr` |
| Clean-room feature | as above, plus `license-guard` and `/security-review` before the PR |

Work on one branch per change, in a git worktree when running several sessions at once.

Personal tooling (output compressors, context plugins) belongs in your user settings, not in `.claude/settings.json`.
