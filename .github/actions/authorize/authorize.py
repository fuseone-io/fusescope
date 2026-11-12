"""Decides, for one workflow run, which SHA it tests, whether it is the run
that decides the workflow's verdict, and whether its pull request is
authorised to run tests at that SHA.

A safe-to-* label authorises only the head it was added to: it counts when
it is on the pull request now and its last "labeled" event came after the
head appeared, the earliest pull request run GitHub created for that SHA.
The labels in the event payload are never read, so a label added to an
earlier head never authorises a later one. The data comes from the API, and
no pull request code runs here.
"""

import json
import os
import subprocess
import sys
from dataclasses import dataclass, field

PR_EVENTS = {"pull_request", "pull_request_target"}
DEPENDABOT = "dependabot[bot]"


@dataclass(frozen=True)
class Context:
    repo: str
    event: str
    action: str
    number: str
    head_sha: str
    sha: str
    label: str
    fork: bool
    user: str
    relevant: bool
    triggers: tuple[str, ...]
    trusted_requires: tuple[str, ...]
    untrusted_requires: tuple[str, ...]
    merge_group: str = "run"


@dataclass
class Decision:
    sha: str
    ignored: bool = False
    trusted: bool = True
    required: tuple[str, ...] = ()
    authorized: bool = True
    run: bool = False
    passes_without_tests: bool = False
    reason: str = ""

    def outputs(self) -> dict[str, str]:
        b = lambda v: str(v).lower()
        return {
            "sha": self.sha,
            "ignored": b(self.ignored),
            "trusted": b(self.trusted),
            "required": ",".join(self.required),
            "authorized": b(self.authorized),
            "run": b(self.run),
            "pass": b(self.passes_without_tests),
            "reason": self.reason,
        }


def decide(c: Context, fresh: dict[str, bool]) -> Decision:
    if c.event not in PR_EVENTS:
        if c.event == "merge_group" and c.merge_group == "pass":
            return Decision(sha=c.sha, passes_without_tests=True, reason="merge_group: this workflow does not run in the merge queue")
        return Decision(sha=c.sha, run=True, reason=f"{c.event} runs everything")

    trusted = not c.fork and c.user != DEPENDABOT
    d = Decision(sha=c.head_sha, trusted=trusted, required=c.trusted_requires if trusted else c.untrusted_requires)
    labeled = c.action == "labeled"
    if c.event == "pull_request":
        if labeled and (not trusted or c.label not in c.triggers):
            d.ignored, d.reason = True, f"pull_request {c.action} {c.label or '-'} does not decide this workflow"
    elif not trusted and labeled and c.label in c.triggers:
        pass
    else:
        d.ignored, d.reason = True, f"pull_request_target {c.action} {c.label or '-'} does not decide this workflow for a {'trusted' if trusted else 'fork or dependabot'} pull request"
    if d.ignored:
        d.authorized = False
        return d

    if not c.relevant:
        d.passes_without_tests, d.reason = True, "no change this workflow tests"
        return d

    missing = [label for label in d.required if not fresh.get(label, False)]
    d.authorized = not missing
    tests_here = c.event == ("pull_request" if trusted else "pull_request_target")
    d.run = d.authorized and tests_here
    if missing:
        d.reason = f"needs {', '.join(missing)} added to {c.head_sha[:12]} after it was pushed"
    elif not tests_here:
        d.reason = f"a fork or dependabot pull request runs tests only on the labeled event; add {', '.join(d.required)} to {c.head_sha[:12]}"
    else:
        d.reason = "runs" + (f" with {', '.join(d.required)} added to {c.head_sha[:12]}" if d.required else "")
    return d


def head_time(runs: list[tuple[str, str]]) -> str | None:
    """When the head appeared: the earliest pull request run for its SHA."""
    times = [created for event, created in runs if event in PR_EVENTS]
    return min(times) if times else None


def is_fresh(label: str, current: set[str], events: list[tuple[str, str]], since: str | None) -> bool:
    if since is None or label not in current:
        return False
    times = [created for name, created in events if name == label]
    return bool(times) and max(times) > since


def gh(*args: str) -> list[str]:
    out = subprocess.run(["gh", "api", *args], check=True, capture_output=True, text=True).stdout
    return [line for line in out.splitlines() if line]


def freshness(c: Context, labels: tuple[str, ...]) -> dict[str, bool]:
    runs = [tuple(json.loads(line)) for line in gh(f"repos/{c.repo}/actions/runs?head_sha={c.head_sha}&per_page=100", "--paginate", "--jq", ".workflow_runs[] | [.event, .created_at] | @json")]
    since = head_time(runs)
    current = set(gh(f"repos/{c.repo}/issues/{c.number}/labels", "--paginate", "--jq", ".[].name"))
    events = [tuple(json.loads(line)) for line in gh(f"repos/{c.repo}/issues/{c.number}/events?per_page=100", "--paginate", "--jq", '.[] | select(.event == "labeled") | [.label.name, .created_at] | @json')]
    print(f"head {c.head_sha[:12]} appeared at {since}; labels now: {sorted(current) or '-'}")
    return {label: is_fresh(label, current, events, since) for label in labels}


def split(value: str) -> tuple[str, ...]:
    return tuple(part for part in value.split(",") if part)


def context() -> Context:
    env = os.environ
    return Context(
        repo=env["GITHUB_REPOSITORY"],
        event=env["EVENT"],
        action=env.get("ACTION", ""),
        number=env.get("PR_NUMBER", ""),
        head_sha=env.get("HEAD_SHA", ""),
        sha=env["GITHUB_SHA"],
        label=env.get("LABEL", ""),
        fork=env.get("HEAD_FORK", "false") == "true",
        user=env.get("PR_USER", ""),
        relevant=env["RELEVANT"] == "true",
        triggers=split(env.get("TRIGGERS", "")),
        trusted_requires=split(env.get("TRUSTED_REQUIRES", "")),
        untrusted_requires=split(env.get("UNTRUSTED_REQUIRES", "")),
        merge_group=env.get("MERGE_GROUP", "run"),
    )


def main() -> int:
    c = context()
    preliminary = decide(c, fresh={})
    fresh: dict[str, bool] = {}
    if not preliminary.ignored and preliminary.required and c.relevant:
        fresh = freshness(c, preliminary.required)
    d = decide(c, fresh)
    text = "\n".join([f"### Authorize ({c.event} {c.action})", ""] + [f"- {k}: `{v}`" for k, v in d.outputs().items()]) + "\n"
    print(text)
    for env, content in (("GITHUB_OUTPUT", "".join(f"{k}={v}\n" for k, v in d.outputs().items())), ("GITHUB_STEP_SUMMARY", text)):
        if os.environ.get(env):
            with open(os.environ[env], "a", encoding="utf-8") as fh:
                fh.write(content)
    return 0


if __name__ == "__main__":
    sys.exit(main())
