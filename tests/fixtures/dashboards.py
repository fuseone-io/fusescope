from http import HTTPStatus

import requests

from fixtures import types

DASHBOARDS_BASE_URL = "/api/v2/dashboards"
# MaxListLimit caps a single list page, so wiping a shared DB has to drain pages
# until the list comes back empty.
MAX_LIST_LIMIT = 200


def delete_all_dashboards(signoz: types.SigNoz, token: str) -> None:
    while True:
        response = requests.get(
            signoz.self.host_configs["8080"].get(f"{DASHBOARDS_BASE_URL}?limit={MAX_LIST_LIMIT}"),
            headers={"Authorization": f"Bearer {token}"},
            timeout=5,
        )
        assert response.status_code == HTTPStatus.OK, response.text
        dashboards = response.json()["data"]["dashboards"]
        if not dashboards:
            return
        for dashboard in dashboards:
            del_res = requests.delete(
                signoz.self.host_configs["8080"].get(f"{DASHBOARDS_BASE_URL}/{dashboard['id']}"),
                headers={"Authorization": f"Bearer {token}"},
                timeout=5,
            )
            assert del_res.status_code == HTTPStatus.NO_CONTENT, del_res.text


def create_public_dashboard(signoz: types.SigNoz, token: str, name: str) -> str:
    """Returns the public link id of a new, empty, published v2 dashboard."""
    created = requests.post(
        signoz.self.host_configs["8080"].get(DASHBOARDS_BASE_URL),
        json={
            "schemaVersion": "v6",
            "name": name,
            "spec": {"display": {"name": name}, "duration": "1h", "links": [], "variables": [], "panels": {}, "layouts": []},
        },
        headers={"Authorization": f"Bearer {token}"},
        timeout=5,
    )
    assert created.status_code == HTTPStatus.CREATED, created.text
    dashboard_id = created.json()["data"]["id"]

    published = requests.post(
        signoz.self.host_configs["8080"].get(f"/api/v1/dashboards/{dashboard_id}/public"),
        json={"timeRangeEnabled": True, "defaultTimeRange": "10m"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=5,
    )
    assert published.status_code == HTTPStatus.CREATED, published.text

    config = requests.get(
        signoz.self.host_configs["8080"].get(f"/api/v1/dashboards/{dashboard_id}/public"),
        headers={"Authorization": f"Bearer {token}"},
        timeout=5,
    )
    assert config.status_code == HTTPStatus.OK, config.text
    return config.json()["data"]["publicPath"].split("/public/dashboard/")[-1]
