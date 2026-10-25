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
