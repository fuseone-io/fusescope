import uuid
from collections.abc import Callable
from http import HTTPStatus

import requests
from sqlalchemy import sql

from fixtures import types
from fixtures.auth import USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD

BUILTIN_VERSIONS = {
    "builtin-aws_elasticache_redis": "1.0.0",
    "builtin-aws_rds_mysql": "1.0.0",
    "builtin-aws_rds_postgresql": "1.0.0",
    "builtin-clickhouse": "1.0.0",
    "builtin-gcp_cloudsql": "1.0.1",
    "builtin-mongo": "1.0.0",
    "builtin-mysql": "1.0.1",
    "builtin-nginx": "1.0.0",
    "builtin-postgres": "1.0.0",
    "builtin-redis": "1.0.0",
}


def test_list_serves_the_embedded_catalog(
    signoz: types.SigNoz,
    create_user_admin: types.Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
) -> None:
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)

    response = requests.get(
        signoz.self.host_configs["8080"].get("/api/v1/integrations"),
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )

    assert response.status_code == HTTPStatus.OK, response.text
    integrations = response.json()["data"]["integrations"]
    assert {i["id"]: i["version"] for i in integrations} == BUILTIN_VERSIONS
    for integration in integrations:
        assert integration["is_installed"] is False
        assert integration["latest_version"] == integration["version"]
        assert integration["icon"].startswith("data:image/")


def test_install_pins_the_version_and_provisions_dashboards(
    signoz: types.SigNoz,
    create_user_admin: types.Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
) -> None:
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    headers = {"Authorization": f"Bearer {token}"}

    install = requests.post(
        signoz.self.host_configs["8080"].get("/api/v1/integrations/install"),
        json={"integration_id": "builtin-redis", "config": {}},
        headers=headers,
        timeout=10,
    )
    assert install.status_code == HTTPStatus.OK, install.text
    assert install.json()["data"]["is_installed"] is True
    assert install.json()["data"]["version"] == "1.0.0"

    detail = requests.get(
        signoz.self.host_configs["8080"].get("/api/v1/integrations/builtin-redis"),
        headers=headers,
        timeout=10,
    )
    assert detail.status_code == HTTPStatus.OK, detail.text
    data = detail.json()["data"]
    assert data["version"] == "1.0.0"
    assert data["latest_version"] == "1.0.0"
    assert data["installation"]["version"] == "1.0.0"
    assert [d["id"] for d in data["assets"]["dashboards"]] == ["overview"]

    with signoz.sqlstore.conn.connect() as conn:
        slugs = [row["slug"] for row in conn.execute(sql.text("SELECT slug FROM integration_dashboard WHERE provider = 'installed_integration'")).mappings().fetchall()]
    assert "redis-overview" in slugs

    status = requests.get(
        signoz.self.host_configs["8080"].get("/api/v1/integrations/builtin-redis/connection_status"),
        headers=headers,
        timeout=10,
    )
    assert status.status_code == HTTPStatus.OK, status.text

    uninstall = requests.post(
        signoz.self.host_configs["8080"].get("/api/v1/integrations/uninstall"),
        json={"integration_id": "builtin-redis"},
        headers=headers,
        timeout=10,
    )
    assert uninstall.status_code == HTTPStatus.OK, uninstall.text

    with signoz.sqlstore.conn.connect() as conn:
        remaining = conn.execute(sql.text("SELECT COUNT(*) FROM integration_dashboard WHERE slug = 'redis-overview'")).scalar()
    assert remaining == 0


def test_rows_without_a_version_read_as_1_0_0(
    signoz: types.SigNoz,
    create_user_admin: types.Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
) -> None:
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    headers = {"Authorization": f"Bearer {token}"}

    with signoz.sqlstore.conn.begin() as conn:
        org_id = conn.execute(sql.text("SELECT id FROM organizations LIMIT 1")).scalar()
        conn.execute(
            sql.text("INSERT INTO installed_integration (id, type, config, org_id) VALUES (:id, 'builtin-nginx', '{}', :org_id)"),
            {"id": str(uuid.uuid4()), "org_id": org_id},
        )

    detail = requests.get(
        signoz.self.host_configs["8080"].get("/api/v1/integrations/builtin-nginx"),
        headers=headers,
        timeout=10,
    )
    assert detail.status_code == HTTPStatus.OK, detail.text
    assert detail.json()["data"]["installation"]["version"] == "1.0.0"
    assert detail.json()["data"]["version"] == "1.0.0"

    uninstall = requests.post(
        signoz.self.host_configs["8080"].get("/api/v1/integrations/uninstall"),
        json={"integration_id": "builtin-nginx"},
        headers=headers,
        timeout=10,
    )
    assert uninstall.status_code == HTTPStatus.OK, uninstall.text


def test_upgrade_on_the_latest_version_is_a_noop(
    signoz: types.SigNoz,
    create_user_admin: types.Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
) -> None:
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    headers = {"Authorization": f"Bearer {token}"}

    install = requests.post(
        signoz.self.host_configs["8080"].get("/api/v1/integrations/install"),
        json={"integration_id": "builtin-redis", "config": {}},
        headers=headers,
        timeout=10,
    )
    assert install.status_code == HTTPStatus.OK, install.text

    with signoz.sqlstore.conn.connect() as conn:
        dashboard_id = conn.execute(sql.text("SELECT dashboard_id FROM integration_dashboard WHERE slug = 'redis-overview'")).scalar()

    upgrade = requests.post(
        signoz.self.host_configs["8080"].get("/api/v1/integrations/upgrade"),
        json={"integration_id": "builtin-redis"},
        headers=headers,
        timeout=10,
    )
    assert upgrade.status_code == HTTPStatus.OK, upgrade.text
    assert upgrade.json()["data"]["is_installed"] is True
    assert upgrade.json()["data"]["version"] == "1.0.0"
    assert upgrade.json()["data"]["latest_version"] == "1.0.0"

    with signoz.sqlstore.conn.connect() as conn:
        assert conn.execute(sql.text("SELECT dashboard_id FROM integration_dashboard WHERE slug = 'redis-overview'")).scalar() == dashboard_id

    uninstall = requests.post(
        signoz.self.host_configs["8080"].get("/api/v1/integrations/uninstall"),
        json={"integration_id": "builtin-redis"},
        headers=headers,
        timeout=10,
    )
    assert uninstall.status_code == HTTPStatus.OK, uninstall.text


def test_upgrade_moves_a_dropped_pin_and_updates_dashboards_in_place(
    signoz: types.SigNoz,
    create_user_admin: types.Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
) -> None:
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)
    headers = {"Authorization": f"Bearer {token}"}

    install = requests.post(
        signoz.self.host_configs["8080"].get("/api/v1/integrations/install"),
        json={"integration_id": "builtin-mysql", "config": {}},
        headers=headers,
        timeout=10,
    )
    assert install.status_code == HTTPStatus.OK, install.text
    assert install.json()["data"]["version"] == BUILTIN_VERSIONS["builtin-mysql"]

    with signoz.sqlstore.conn.begin() as conn:
        conn.execute(sql.text("UPDATE installed_integration SET version = '1.0.0' WHERE type = 'builtin-mysql'"))
        dashboard_id = conn.execute(sql.text("SELECT dashboard_id FROM integration_dashboard WHERE slug = 'mysql-overview'")).scalar()

    upgrade = requests.post(
        signoz.self.host_configs["8080"].get("/api/v1/integrations/upgrade"),
        json={"integration_id": "builtin-mysql"},
        headers=headers,
        timeout=10,
    )
    assert upgrade.status_code == HTTPStatus.OK, upgrade.text
    assert upgrade.json()["data"]["version"] == BUILTIN_VERSIONS["builtin-mysql"]

    detail = requests.get(
        signoz.self.host_configs["8080"].get("/api/v1/integrations/builtin-mysql"),
        headers=headers,
        timeout=10,
    )
    assert detail.status_code == HTTPStatus.OK, detail.text
    assert detail.json()["data"]["installation"]["version"] == BUILTIN_VERSIONS["builtin-mysql"]

    with signoz.sqlstore.conn.connect() as conn:
        assert conn.execute(sql.text("SELECT dashboard_id FROM integration_dashboard WHERE slug = 'mysql-overview'")).scalar() == dashboard_id
        dashboard = conn.execute(sql.text("SELECT locked, updated_by FROM dashboard WHERE id = :id"), {"id": dashboard_id}).mappings().one()
    assert bool(dashboard["locked"]) is True
    assert dashboard["updated_by"] == USER_ADMIN_EMAIL

    uninstall = requests.post(
        signoz.self.host_configs["8080"].get("/api/v1/integrations/uninstall"),
        json={"integration_id": "builtin-mysql"},
        headers=headers,
        timeout=10,
    )
    assert uninstall.status_code == HTTPStatus.OK, uninstall.text


def test_upgrade_of_an_integration_not_installed_is_not_found(
    signoz: types.SigNoz,
    create_user_admin: types.Operation,  # pylint: disable=unused-argument
    get_token: Callable[[str, str], str],
) -> None:
    token = get_token(USER_ADMIN_EMAIL, USER_ADMIN_PASSWORD)

    upgrade = requests.post(
        signoz.self.host_configs["8080"].get("/api/v1/integrations/upgrade"),
        json={"integration_id": "builtin-postgres"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    assert upgrade.status_code == HTTPStatus.NOT_FOUND, upgrade.text
    assert upgrade.json()["error"]["code"] == "integration_not_installed"
