"""Decides, for one workflow run, which SHA it tests, whether it is the run
that decides the workflow's verdict, and whether its pull request is
authorised to run tests at that SHA.

For a pull request from this repository, a required safe-to-* label is a
cost gate: it counts while it is on the pull request.

For a fork or dependabot pull request it is a trust gate, bound to one head.
It counts when it is on the pull request now and its last "labeled" event
came after the head appeared, measured as the earliest pull request run
GitHub created for that SHA. The run also needs an approving review by an
organisation member whose commit_id is that SHA, which is the head the
maintainer read.

The labels in the event payload are never read. The data comes from the
API, and no pull request code runs here.
"""

import json
import os
import subprocess
import sys
from dataclasses import dataclass, field

PR_EVENTS = {"pull_request", "pull_request_target"}
DEPENDABOT = "dependabot[bot]"
MAINTAINERS = {"OWNER", "MEMBER"}


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


def decide(c: Context, fresh: dict[str, bool], approved: bool = True, head_known: bool = True) -> Decision:
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
    unreviewed = not trusted and not approved
    d.authorized = not missing and not unreviewed
    tests_here = c.event == ("pull_request" if trusted else "pull_request_target")
    d.run = d.authorized and tests_here
    if missing and trusted:
        d.reason = f"needs the {', '.join(missing)} label"
    elif missing and not head_known:
        d.reason = f"head time unknown: no pull request run for {c.head_sha} yet; re-add {', '.join(missing)} once one exists"
    elif missing:
        d.reason = f"needs {', '.join(missing)} added to {c.head_sha} after it was pushed"
    elif unreviewed:
        d.reason = f"needs an approving review by a maintainer on {c.head_sha}, the head being labeled"
    elif not tests_here:
        d.reason = f"a fork or dependabot pull request runs tests only on the labeled event; add {', '.join(d.required)} to {c.head_sha[:12]}"
    else:
        d.reason = "runs" + (f" with {', '.join(d.required)} added to {c.head_sha[:12]}" if d.required else "")
    return d


def head_time(runs: list[tuple[str, str]]) -> str | None:
    """When the head appeared: the earliest pull request run for its SHA."""
    times = [created for event, created in runs if event in PR_EVENTS]
    return min(times) if times else None


def approved_at(reviews: list[dict], sha: str) -> bool:
    """A maintainer's latest approve or request-changes review of this commit approves it."""
    latest: dict[str, dict] = {}
    for r in sorted(reviews, key=lambda r: r.get("submitted_at") or ""):
        if r.get("commit_id") != sha or r.get("author_association") not in MAINTAINERS:
            continue
        if r.get("state") in ("APPROVED", "CHANGES_REQUESTED", "DISMISSED"):
            latest[r["user"]] = r
    return any(r["state"] == "APPROVED" for r in latest.values())


def is_fresh(label: str, current: set[str], events: list[tuple[str, str]], since: str | None) -> bool:
    if since is None or label not in current:
        return False
    times = [created for name, created in events if name == label]
    return bool(times) and max(times) > since


def gh(*args: str) -> list[str]:
    out = subprocess.run(["gh", "api", *args], check=True, capture_output=True, text=True).stdout
    return [line for line in out.splitlines() if line]


def labels_now(c: Context) -> set[str]:
    return set(gh(f"repos/{c.repo}/issues/{c.number}/labels", "--paginate", "--jq", ".[].name"))


def freshness(c: Context, labels: tuple[str, ...]) -> tuple[dict[str, bool], bool]:
    runs = [tuple(json.loads(line)) for line in gh(f"repos/{c.repo}/actions/runs?head_sha={c.head_sha}&per_page=100", "--paginate", "--jq", ".workflow_runs[] | [.event, .created_at] | @json")]
    since = head_time(runs)
    current = labels_now(c)
    events = [tuple(json.loads(line)) for line in gh(f"repos/{c.repo}/issues/{c.number}/events?per_page=100", "--paginate", "--jq", '.[] | select(.event == "labeled") | [.label.name, .created_at] | @json')]
    print(f"head {c.head_sha} appeared at {since}; labels now: {sorted(current) or '-'}")
    return {label: is_fresh(label, current, events, since) for label in labels}, since is not None


def approval(c: Context) -> bool:
    reviews = [json.loads(line) for line in gh(f"repos/{c.repo}/pulls/{c.number}/reviews?per_page=100", "--paginate", "--jq", ".[] | {user: .user.login, state, commit_id, submitted_at, author_association} | @json")]
    ok = approved_at(reviews, c.head_sha)
    print(f"maintainer approval on {c.head_sha}: {ok}")
    return ok


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
    approved, head_known = True, True
    if not preliminary.ignored and c.relevant and c.event in PR_EVENTS:
        if preliminary.trusted:
            current = labels_now(c)
            fresh = {label: label in current for label in preliminary.required}
        else:
            fresh, head_known = freshness(c, preliminary.required)
            approved = approval(c)
    d = decide(c, fresh, approved, head_known)
    print(f"::notice title=gate {d.sha[:12]}::{d.reason}")
    text = "\n".join([f"### Authorize ({c.event} {c.action})", ""] + [f"- {k}: `{v}`" for k, v in d.outputs().items()]) + "\n"
    print(text)
    for env, content in (("GITHUB_OUTPUT", "".join(f"{k}={v}\n" for k, v in d.outputs().items())), ("GITHUB_STEP_SUMMARY", text)):
        if os.environ.get(env):
            with open(os.environ[env], "a", encoding="utf-8") as fh:
                fh.write(content)
    return 0


if __name__ == "__main__":
    sys.exit(main())
