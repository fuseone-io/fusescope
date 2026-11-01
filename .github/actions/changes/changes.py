import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field

PR_EVENTS = {"pull_request", "pull_request_target"}

# First match wins.
RULES: list[tuple[str, re.Pattern]] = [
    ("docs", re.compile(r"(^|/)[^/]+\.md$|^docs/(adr|brand|contributing|img)/")),
    ("infra", re.compile(r"^\.github/|^go\.(mod|sum)$|^frontend/(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$|^tests/(fixtures/|conftest\.py$)|(^|/)Dockerfile[^/]*$|^Makefile$")),
    ("api", re.compile(r"^docs/api/")),
    ("go", re.compile(r"^(pkg|cmd|scripts|templates|conf)/|^\.(golangci|mockery)\.yml$")),
    ("frontend", re.compile(r"^frontend/")),
    ("suite", re.compile(r"^tests/integration/tests/[^/]+/")),
    ("e2e", re.compile(r"^tests/e2e/")),
]

# Integration selectors understood by tests/integration/groups.py.
ALL = "all"
UI = "ui"


@dataclass
class Decision:
    go: bool = False
    js: bool = False
    e2e: bool = False
    integration: set[str] = field(default_factory=set)
    reasons: list[str] = field(default_factory=list)

    def run_everything(self, reason: str) -> None:
        self.go = self.js = self.e2e = True
        self.integration = {ALL}
        self.reasons.append(reason)

    def outputs(self) -> dict[str, str]:
        integration = ALL if ALL in self.integration else " ".join(sorted(self.integration))
        return {
            "go": str(self.go).lower(),
            "js": str(self.js).lower(),
            "e2e": str(self.e2e).lower(),
            "integration": integration,
        }


def category(path: str) -> str:
    for name, pattern in RULES:
        if pattern.search(path):
            return name
    return "unclassified"


def decide(files: list[str], labels: set[str]) -> tuple[Decision, dict[str, list[str]]]:
    by_category: dict[str, list[str]] = {}
    for path in files:
        by_category.setdefault(category(path), []).append(path)

    decision = Decision()
    if "safe-to-e2e" in labels:
        decision.e2e = True
        decision.reasons.append("label safe-to-e2e runs e2e")
    for name in ("infra", "unclassified"):
        if name in by_category:
            decision.run_everything(f"{name} files run everything")
    if "api" in by_category:
        decision.go = decision.js = decision.e2e = True
        decision.integration.add(ALL)
    if "go" in by_category:
        decision.go = True
        decision.integration.add(ALL)
    if "frontend" in by_category:
        decision.js = decision.e2e = True
        decision.integration.add(UI)
    if "suite" in by_category:
        decision.integration.update(path.split("/")[3] for path in by_category["suite"])
    if "e2e" in by_category:
        decision.e2e = True
    return decision, by_category


def changed_files(repo: str, number: str, expected: int) -> list[str]:
    out = subprocess.run(
        ["gh", "api", f"repos/{repo}/pulls/{number}/files", "--paginate", "--jq", ".[] | [.filename, .previous_filename // empty] | @json"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    entries = [json.loads(line) for line in out.splitlines() if line]
    # The API lists at most 3000 files.
    if len(entries) != expected:
        raise RuntimeError(f"listed {len(entries)} of {expected} changed files")
    return [path for entry in entries for path in entry]


def summary(event: str, decision: Decision, by_category: dict[str, list[str]]) -> str:
    lines = [f"### Changes ({event})", ""]
    if by_category:
        lines += ["| category | files | first |", "|---|---|---|"]
        lines += [f"| {name} | {len(paths)} | `{paths[0]}` |" for name, paths in sorted(by_category.items())]
        lines.append("")
    lines += [f"- {reason}" for reason in decision.reasons]
    outputs = decision.outputs()
    lines += [
        f"- goci: {'run' if decision.go else 'skip (no Go, docs/api or infra change)'}",
        f"- jsci test, storybook: {'run' if decision.js else 'skip (no frontend, docs/api or infra change)'}",
        f"- e2e: {'run' if decision.e2e else 'skip (no frontend, tests/e2e, docs/api or infra change)'}",
        f"- integration: groups for `{outputs['integration']}` (`ui`: suites that drive the web UI)" if outputs["integration"] else "- integration: skip (no Go, frontend, suite or infra change)",
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    event = os.environ["EVENT"]
    decision = Decision()
    by_category: dict[str, list[str]] = {}
    if event not in PR_EVENTS:
        decision.run_everything(f"event {event} runs everything")
    else:
        try:
            files = changed_files(os.environ["GITHUB_REPOSITORY"], os.environ["PR_NUMBER"], int(os.environ["CHANGED_FILES"]))
        except (subprocess.CalledProcessError, RuntimeError, ValueError) as err:
            print(f"::warning::cannot list changed files, running everything: {err}")
            decision.run_everything("changed files unknown, running everything")
        else:
            labels = {label for label in os.environ.get("LABELS", "").split(",") if label}
            decision, by_category = decide(files, labels)

    text = summary(event, decision, by_category)
    print(text)
    for env, content in (
        ("GITHUB_OUTPUT", "".join(f"{key}={value}\n" for key, value in decision.outputs().items())),
        ("GITHUB_STEP_SUMMARY", text),
    ):
        if os.environ.get(env):
            with open(os.environ[env], "a", encoding="utf-8") as fh:
                fh.write(content)
    return 0


if __name__ == "__main__":
    sys.exit(main())
