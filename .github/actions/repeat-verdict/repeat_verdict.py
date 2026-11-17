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
    repeats: bool | None


def repeat(own_suite: int, runs: list[Run], unseen: list[str] | None = None) -> tuple[str, str]:
    """pass, fail or wait: the verdict of the latest deciding check suite on this commit.

    Branch protection reads the latest pull_request suite of a workflow, so a run that does not
    decide must carry the verdict on. Suites created in the same second, such as opening a pull
    request with a label, get ids in either order, so a deciding suite is repeated whatever its id.
    Runs that repeat are neither repeated nor waited for, so two of them never wait on each other;
    a run not yet known to repeat is waited for. unseen lists running suites on this commit whose
    check does not exist yet, because its job still waits on other jobs; they are waited for too.
    """
    if unseen:
        return "wait", f"a run has not reported yet: {unseen[0]}"
    deciding = [r for r in runs if r.suite != own_suite and r.repeats is not True]
    pending = [r for r in deciding if r.status != "completed"]
    if pending:
        return "wait", f"a verdict is still running: {pending[0].url}"
    decided = [r for r in deciding if r.conclusion not in NO_VERDICT]
    if not decided:
        return "fail", "no verdict on this commit to repeat; push again or close and reopen the pull request"
    latest = max(decided, key=lambda r: (r.suite, r.completed_at))
    if latest.conclusion == "success":
        return "pass", f"repeats {latest.url}"
    return "fail", f"repeats {latest.conclusion} from {latest.url}"


def repeats_from_steps(steps: list[dict]) -> bool | None:
    """Whether a job repeats a verdict, from its "repeat" step; None until that step is reached."""
    step = next((s for s in steps if s.get("name") == "repeat"), None)
    if step is None or step.get("status") == "queued":
        return None
    return step.get("conclusion") != "skipped"


def gh(path: str, jq: str) -> list[str]:
    out = subprocess.run(["gh", "api", path, "--paginate", "--jq", jq], check=True, capture_output=True, text=True).stdout
    return [line for line in out.splitlines() if line]


def check_runs(repo: str, sha: str, name: str) -> list[Run]:
    jq = '.check_runs[] | select(.app.slug == "github-actions") | {id, suite: .check_suite.id, status, conclusion, completed_at: (.completed_at // ""), url: .html_url} | @json'
    runs = []
    for line in gh(f"repos/{repo}/commits/{sha}/check-runs?check_name={name}&filter=all&per_page=100", jq):
        fields = json.loads(line)
        steps = [json.loads(s) for s in gh(f"repos/{repo}/actions/jobs/{fields.pop('id')}", ".steps[]? | @json")]
        runs.append(Run(**fields, repeats=repeats_from_steps(steps)))
    return runs


def unseen_runs(repo: str, sha: str, own_run: str, workflow: str, runs: list[Run]) -> list[str]:
    jq = '.workflow_runs[] | select(.status != "completed") | {id, suite: .check_suite_id, url: .html_url} | @json'
    seen = {r.suite for r in runs}
    running = [json.loads(line) for line in gh(f"repos/{repo}/actions/workflows/{workflow}/runs?head_sha={sha}&per_page=100", jq)]
    return [r["url"] for r in running if str(r["id"]) != own_run and r["suite"] not in seen]


def main() -> int:
    env = os.environ
    repo, sha, name = env["GITHUB_REPOSITORY"], env["SHA"], env["CHECK"]
    own_run = env["GITHUB_RUN_ID"]
    own_suite, workflow = gh(f"repos/{repo}/actions/runs/{own_run}", ".check_suite_id, .workflow_id")
    own_suite = int(own_suite)
    deadline = time.monotonic() + int(env["WAIT_MINUTES"]) * 60
    while True:
        runs = check_runs(repo, sha, name)
        state, reason = repeat(own_suite, runs, unseen_runs(repo, sha, own_run, workflow, runs))
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
