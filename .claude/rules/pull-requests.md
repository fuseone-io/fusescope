# Pull requests

- **Follow the template** (`.github/pull_request_template.md`): fill in its headings (Description / Test plan / Issues closed by this PR / Screenshots / Additional Information). Don't add sections the template doesn't have.
- **Keep only the headings that apply.** Delete every heading that has nothing under it, along with its `<!--...-->` placeholder comment. The body must never contain an empty heading — if only Description applies, the body has exactly that one heading.
- **Keep the description concise and human-readable.** A few non repetitive bullets saying what changed and why, for a reviewer skimming it — not a wall of text, not a restatement of the diff, not generated boilerplate and not the user agent conversation details.
- **Reference issues with `Closes #issue-number`** under "Issues closed by this PR" so they auto-close on merge. This goes in the PR description only — never in commit messages.
- **Breaking changes can be added in additional information section** if any.
- **AI-assisted commits end with a `Co-Authored-By:` trailer** naming the model (e.g. `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
- **Keep the commit body short and human readable** focused on decision made if any. Commit body must not re-iterate the changes done, skip if title is sufficient in conveying the change.
- **Use conventional commit format** for commits and PR title.
- **Docs-only PRs skip CI by path.** Markdown and `docs/` (except `docs/api/`, the OpenAPI spec) are in each workflow's `paths-ignore`; no `[skip ci]` needed. When adding a documentation folder, add it to the `paths-ignore` lists in `goci`, `jsci`, `e2eci` and `integrationci`.
- **Amending and force-pushing are fine on PR branches** before merge. Never rewrite `main`; merges are fast-forward and only with CI green.
