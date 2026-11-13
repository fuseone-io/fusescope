import subprocess

import pytest

pytest_plugins = [
    "fixtures.reuse",
    "fixtures.auth",
    "fixtures.clickhouse",
    "fixtures.fs",
    "fixtures.http",
    "fixtures.migrator",
    "fixtures.network",
    "fixtures.postgres",
    "fixtures.sql",
    "fixtures.sqlite",
    "fixtures.keeper",
    "fixtures.signoz",
    "fixtures.audit",
    "fixtures.logs",
    "fixtures.traces",
    "fixtures.metrics",
    "fixtures.queriercommon",
    "fixtures.semconvfamilies",
    "fixtures.metadata",
    "fixtures.meter",
    "fixtures.browser",
    "fixtures.keycloak",
    "fixtures.idp",
    "fixtures.googleidp",
    "fixtures.tls",
    "fixtures.notification_channel",
    "fixtures.maildev",
    "fixtures.alerts",
    "fixtures.cloudintegrations",
    "fixtures.jsontypes",
    "fixtures.materialized",
    "fixtures.seeder",
    "fixtures.serviceaccount",
    "fixtures.role",
    "fixtures.savedview",
    "fixtures.seed_golden_dataset",
    "fixtures.otelcollector",
    "fixtures.fusescopecollector",
    "fixtures.simulatorcontract",
    "fixtures.engine",
    "fixtures.enginecollector",
]


def pytest_configure(config: pytest.Config):
    if config.getoption("--rebuild"):
        if not config.getoption("--reuse"):
            raise pytest.UsageError("--rebuild requires --reuse: it replaces the signoz container within an environment that is being reused.")
        if config.getoption("--teardown"):
            raise pytest.UsageError("--rebuild cannot be combined with --teardown.")
        if config.getoption("--clean"):
            raise pytest.UsageError("--rebuild cannot be combined with --clean: --clean forces a cold build, which defeats the purpose of --rebuild.")


def pytest_sessionstart(session: pytest.Session):
    if session.config.getoption("--clean"):
        # The type filter removes only cache mounts, leaving images and layer cache intact.
        subprocess.run(["docker", "builder", "prune", "--force", "--filter", "type=exec.cachemount"], check=True)


def pytest_addoption(parser: pytest.Parser):
    parser.addoption(
        "--reuse",
        action="store_true",
        default=False,
        help="Reuse environment. Use pytest --basetemp=./tmp/ -vv --reuse src/bootstrap/setup::test_setup to setup your local dev environment for writing tests.",
    )
    parser.addoption(
        "--teardown",
        action="store_true",
        default=False,
        help="Teardown environment. Run pytest --basetemp=./tmp/ -vv --teardown src/bootstrap/setup::test_teardown to teardown your local dev environment.",
    )
    parser.addoption(
        "--rebuild",
        action="store_true",
        default=False,
        help="Rebuild the signoz container from the current sources while reusing the rest of the stack (databases, mocks, migrations). Only meaningful together with --reuse: pytest --basetemp=./tmp/ -vv --reuse --rebuild integration/bootstrap/setup.py::test_setup.",
    )
    parser.addoption(
        "--clean",
        action="store_true",
        default=False,
        help="Prune the BuildKit cache mounts (go build and module caches) used by the signoz image build, forcing the next build to start cold. Combine with --teardown to reset everything: pytest --basetemp=./tmp/ -vv --teardown --clean integration/bootstrap/setup.py::test_teardown.",
    )
    parser.addoption(
        "--with-web",
        action="store_true",
        default=False,
        help="Build and run with web. Run pytest --basetemp=./tmp/ -vv --with-web src/bootstrap/setup::test_setup to setup your local dev environment with web.",
    )
    parser.addoption(
        "--sqlstore-provider",
        action="store",
        default="postgres",
        help="sqlstore provider",
    )
    parser.addoption(
        "--sqlite-mode",
        action="store",
        default="delete",
        help="sqlite mode",
    )
    # Keep the version defaults below of the images e2e starts (postgres, clickhouse and
    # fusescope-schema) in sync with pull-images in .github/workflows/e2eci.yaml.
    parser.addoption(
        "--postgres-version",
        action="store",
        default="15",
        help="postgres version",
    )
    parser.addoption(
        "--clickhouse-version",
        action="store",
        default="25.12.5",
        help="clickhouse version",
    )
    parser.addoption(
        "--fusescope-schema-version",
        action="store",
        default="0.4.1@sha256:9951f2479ac6e5150b116cd856569aaae6ed921e9b951f0fd9c93160e7311077",
        help="ghcr.io/fuseone-io/fusescope-collector tag (pinned by digest) whose /fusescope-schema creates the ClickHouse schema",
    )
    parser.addoption(
        "--contract-collector-version",
        action="store",
        default="0.6.2@sha256:35b0ae88a6d7bb7735e82e63ee6f91d1e8fed158f24e23c13639577426c98909",
        help="ghcr.io/fuseone-io/fusescope-collector tag (pinned by digest), the reference the simulatorcontract suite replays its corpus through: its signozlogspipeline and signozspanmapper processors, with the file exporter",
    )
    parser.addoption(
        "--fusescope-collector-version",
        action="store",
        default="0.3.1",
        help="ghcr.io/fuseone-io/fusescope-collector tag, the collector that receives OTLP and RUM",
    )
    parser.addoption(
        "--fusescope-engine-version",
        action="store",
        default="0.0.7",
        help="ghcr.io/fuseone-io/fusescope-engine tag the queriertraces_engine suite reads traces from",
    )
    parser.addoption(
        "--signoz-image",
        action="store",
        default=None,
        help="Run this prebuilt FuseScope image instead of building one from the current sources. CI builds it once per run and passes it to every job: pytest --basetemp=./tmp/ -vv --signoz-image fusescope-ci:integration integration/tests/<suite>/",
    )
