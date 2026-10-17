from pathlib import Path

import pytest
from testcontainers.core.container import Network

from fixtures import types
from fixtures.auth import register_admin
from fixtures.signoz import create_signoz

MANAGED_DOMAIN = "managed.integration.test"
MANAGED_ISSUER = "https://idp.managed.integration.test/realms/fusescope"
MANAGED_CLIENT_SECRET = "secret-from-environment"

# The secret is referenced as ${...} so the suite also covers environment expansion.
CONFIG_YAML = f"""
authdomain:
  reconcile_interval: 1s
  domains:
    - name: {MANAGED_DOMAIN}
      config:
        kind: oidc
        spec:
          issuer: {MANAGED_ISSUER}
          clientId: fusescope
          clientSecret: ${{FUSESCOPE_TEST_MANAGED_SECRET}}
          scopes: [groups]
      role_mapping:
        defaultRole: VIEWER
        groupMappings:
          fusescope-admins: ADMIN
"""


@pytest.fixture(name="signoz", scope="package")
def signoz_with_managed_auth_domain(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    network: Network,
    zeus: types.TestContainerDocker,
    gateway: types.TestContainerDocker,
    sqlstore: types.TestContainerSQL,
    clickhouse: types.TestContainerClickhouse,
    tmp_path_factory: pytest.TempPathFactory,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
) -> types.SigNoz:
    config_file = Path(tmp_path_factory.mktemp("authdomainconfig")) / "config.yaml"
    config_file.write_text(CONFIG_YAML)
    config_file.chmod(0o644)

    return create_signoz(
        network=network,
        zeus=zeus,
        gateway=gateway,
        sqlstore=sqlstore,
        clickhouse=clickhouse,
        request=request,
        pytestconfig=pytestconfig,
        cache_key="signoz_managed_auth_domain",
        env_overrides={"FUSESCOPE_TEST_MANAGED_SECRET": MANAGED_CLIENT_SECRET},
        config_file=str(config_file),
    )


@pytest.fixture(name="create_user_admin", scope="package")
def create_user_admin_managed_auth_domain(signoz: types.SigNoz, request: pytest.FixtureRequest, pytestconfig: pytest.Config) -> types.Operation:
    return register_admin(signoz, request, pytestconfig, cache_key="create_user_admin_managed_auth_domain")
