from http import HTTPStatus

import requests

from fixtures import types

RUM_APPLICATIONS = "/api/v1/rum/applications"
RUM_KEY_HEADER = "FuseScope-RUM-Key"


def create_rum_application(signoz: types.SigNoz, token: str, payload: dict) -> dict:
    response = requests.post(
        signoz.self.host_configs["8080"].get(RUM_APPLICATIONS),
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    assert response.status_code == HTTPStatus.CREATED, response.text
    return response.json()["data"]
