#!/usr/bin/env bash
# PreToolUse hook: blocks reading SigNoz's proprietary ee/ tree from git history
# and fetching signoz.io docs (CC BY-NC-ND). Exit 2 blocks the tool call.
set -u

command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
tool=$(jq -r '.tool_name // empty' <<<"$input")

block() {
  echo "Blocked by cleanroom-guard: $1 See the license posture in CLAUDE.md." >&2
  exit 2
}

case "$tool" in
  Bash)
    cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
    if grep -Eq '(^|[;&|[:space:]])git[[:space:]]' <<<"$cmd" &&
      grep -Eq '(^|[[:space:]:"'\''/])(ee|cmd/enterprise)(/|[[:space:]"'\'']|$)' <<<"$cmd"; then
      block "git access to ee/ or cmd/enterprise is not allowed (clean-room)."
    fi
    if grep -Eq 'signoz\.io/docs' <<<"$cmd"; then
      block "signoz.io docs must not be read or copied."
    fi
    ;;
  WebFetch | mcp__plugin_context-mode_context-mode__ctx_fetch_and_index)
    url=$(jq -r '.tool_input.url // empty' <<<"$input")
    if grep -Eq 'signoz\.io/docs' <<<"$url"; then
      block "signoz.io docs must not be read or copied."
    fi
    if grep -Eq 'github\.com/SigNoz/signoz/(blob|tree|raw)/[^/]+/(ee|cmd/enterprise)/' <<<"$url"; then
      block "SigNoz ee/ sources must not be read (clean-room)."
    fi
    ;;
esac
exit 0
