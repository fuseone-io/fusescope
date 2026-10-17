#!/usr/bin/env bash
# PostToolUse hook: formats the edited file with the formatter CI checks.
set -u

command -v jq >/dev/null 2>&1 || exit 0

file=$(jq -r '.tool_input.file_path // empty')
[ -f "$file" ] || exit 0

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"

case "$file" in
  *.go)
    command -v gofmt >/dev/null 2>&1 && gofmt -w "$file"
    ;;
  "$root"/frontend/*.ts | "$root"/frontend/*.tsx | "$root"/frontend/*.js | "$root"/frontend/*.mjs)
    oxfmt="$root/frontend/node_modules/.bin/oxfmt"
    [ -x "$oxfmt" ] && (cd "$root/frontend" && "$oxfmt" "$file" >/dev/null 2>&1)
    ;;
esac
exit 0
