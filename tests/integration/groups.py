"""
Prints the integrationci test matrix: one job per group and SQL store.

A group's `shared` suites run in one pytest session on one stack; each
`isolated` suite gets a session of its own. Root stack fixtures are declared
package-scoped but live for the whole session, so a suite that overrides one,
or changes state other suites read (TTL), must be isolated.

Fails when a suite directory is in no group.

The optional argument selects groups: `all` (the default), suite names, and
`ui` for the suites that drive the web UI. A group runs whole when any of its
suites is selected; an empty selection prints an empty matrix, and an unknown
name (a removed suite) selects all.
"""

import argparse
import json
import re
import sys
from pathlib import Path

SUITES_DIR = Path(__file__).parent / "tests"

STACK_FIXTURE = re.compile(r'name="(signoz|clickhouse|keeper|migrator|sqlstore|postgres|sqlite|create_user_admin)"')

WEBDRIVER_SUITES = {"basepath", "callbackauthn", "samlsigning"}

GROUPS: dict[str, dict[str, list[str]]] = {
    "inframonitoring": {
        "shared": ["inframonitoring"],
        "isolated": [],
    },
    "alertmanager": {
        "shared": [],
        "isolated": ["alertmanager"],
    },
    "queriertraces": {
        "shared": [],
        "isolated": ["queriertraces", "rootuser"],
    },
    "ruler": {
        "shared": ["ruler", "querierauthz", "role", "preference", "promote", "llmpricingrules", "spanmapper", "schemacontract", "quickfilter", "auditquerier", "ingestionkeys", "cloudintegrations"],
        "isolated": [],
    },
    "querier": {
        "shared": ["queriermetrics", "queriercommon", "querierlogs"],
        "isolated": [],
    },
    "api": {
        "shared": ["querierscalar", "querierai", "promqlconformance", "promapiconformance", "dashboard", "serviceaccount", "thirdpartyapi", "integrations", "savedview", "logspipelines", "rawexportdata", "simulatorcontract"],
        "isolated": ["authdomainconfig"],
    },
    "ttl": {
        "shared": [],
        "isolated": ["ttl", "semconvfamilies"],
    },
    "authn": {
        "shared": ["callbackauthn"],
        "isolated": ["basepath", "passwordauthn", "samlsigning"],
    },
    "flags": {
        "shared": [],
        "isolated": ["querier_json_body", "metricreduction", "querier_skip_resource_fingerprint", "clickhousecluster"],
    },
    "rum": {
        "shared": [],
        "isolated": ["rum", "onboarding", "alertmanagerrotation", "tracedetail"],
    },
}


def errors() -> list[str]:
    suites = {p.name for p in SUITES_DIR.iterdir() if p.is_dir() and p.name != "__pycache__"}
    grouped = [s for g in GROUPS.values() for s in g["shared"] + g["isolated"]]
    found = [f"suite {s} is in no group of {Path(__file__).name}" for s in sorted(suites - set(grouped))]
    found += [f"suite {s} is grouped but does not exist" for s in sorted(set(grouped) - suites)]
    found += [f"suite {s} is in more than one group" for s in sorted({s for s in grouped if grouped.count(s) > 1})]
    for name, group in GROUPS.items():
        for suite in group["shared"]:
            conftest = SUITES_DIR / suite / "conftest.py"
            if conftest.exists() and STACK_FIXTURE.search(conftest.read_text()):
                found.append(f"suite {suite} overrides a stack fixture and must be isolated in group {name}")
    return found


def selected(group: dict[str, list[str]], selection: set[str]) -> bool:
    suites = set(group["shared"] + group["isolated"])
    return "all" in selection or bool(suites & selection) or ("ui" in selection and bool(suites & WEBDRIVER_SUITES))


def matrix(selection: set[str]) -> list[dict]:
    return [
        {
            "name": name,
            "runs": "\n".join(([" ".join(group["shared"])] if group["shared"] else []) + group["isolated"]),
            "webdriver": bool(WEBDRIVER_SUITES & set(group["shared"] + group["isolated"])),
        }
        for name, group in GROUPS.items()
        if selected(group, selection)
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("selection", nargs="?", default="all")
    selection = set(parser.parse_args().selection.split())
    if selection - {"all", "ui"} - {s for g in GROUPS.values() for s in g["shared"] + g["isolated"]}:
        selection = {"all"}
    found = errors()
    for error in found:
        print(f"::error::{error}", file=sys.stderr)
    if found:
        return 1
    print(json.dumps(matrix(selection)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
