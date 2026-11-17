import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass

NO_VERDICT = {"cancelled", "skipped"}
POLL_SECONDS = 30


@dataclass(frozen=True)
class Run:
    suite: int
    status: str
    conclusion: str | None
    completed_at: str
    url: str


def repeat(own_suite: int, runs: list[Run]) -> tuple[str, str]:
    """pass, fail or wait: the verdict of the latest check suite before this run's own.

    Branch protection reads the latest pull_request suite of a workflow, so a run that does not
    decide must carry the verdict on. Suite ids grow with creation; a later suite is not this
    run's to repeat, since it supersedes this one.
    """
    earlier = [r for r in runs if r.suite < own_suite]
    pending = [r for r in earlier if r.status != "completed"]
    if pending:
        return "wait", f"an earlier verdict is still running: {pending[0].url}"
    decided = [r for r in earlier if r.conclusion not in NO_VERDICT]
    if not decided:
        return "fail", "no verdict on this commit to repeat; push again or close and reopen the pull request"
    latest = max(decided, key=lambda r: (r.suite, r.completed_at))
    if latest.conclusion == "success":
        return "pass", f"repeats {latest.url}"
    return "fail", f"repeats {latest.conclusion} from {latest.url}"


def gh(path: str, jq: str) -> list[str]:
    out = subprocess.run(["gh", "api", path, "--paginate", "--jq", jq], check=True, capture_output=True, text=True).stdout
    return [line for line in out.splitlines() if line]


def check_runs(repo: str, sha: str, name: str) -> list[Run]:
    jq = '.check_runs[] | select(.app.slug == "github-actions") | {suite: .check_suite.id, status, conclusion, completed_at: (.completed_at // ""), url: .html_url} | @json'
    return [Run(**json.loads(line)) for line in gh(f"repos/{repo}/commits/{sha}/check-runs?check_name={name}&filter=all&per_page=100", jq)]


def main() -> int:
    env = os.environ
    repo, sha, name = env["GITHUB_REPOSITORY"], env["SHA"], env["CHECK"]
    own_suite = int(gh(f"repos/{repo}/actions/runs/{env['GITHUB_RUN_ID']}", ".check_suite_id")[0])
    deadline = time.monotonic() + int(env["WAIT_MINUTES"]) * 60
    while True:
        state, reason = repeat(own_suite, check_runs(repo, sha, name))
        if state != "wait":
            break
        if time.monotonic() > deadline:
            state, reason = "fail", f"gave up waiting: {reason}"
            break
        print(reason, flush=True)
        time.sleep(POLL_SECONDS)
    if state == "pass":
        print(f"{name} on {sha[:12]}: {reason}")
        return 0
    print(f"::error::{name} on {sha[:12]}: {reason}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
