import json
import os
import time
from collections.abc import Generator
from typing import Any
from uuid import uuid4

import docker
import docker.errors
import pytest
from testcontainers.core.container import DockerContainer, Network

from fixtures import reuse, types
from fixtures.logger import setup_logger

logger = setup_logger(__name__)

SEAWEEDFS_ACCESS_KEY = "archive"
SEAWEEDFS_SECRET_KEY = "archive-secret"
SEAWEEDFS_BUCKET = "archive"


def create_seaweedfs(
    tmpfs: Generator[types.LegacyPath, Any],
    network: Network,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
    cache_key: str = "seaweedfs",
) -> types.TestContainerDocker:
    """An S3 endpoint (SeaweedFS, Apache-2.0) with one bucket, SEAWEEDFS_BUCKET."""

    def create() -> types.TestContainerDocker:
        config_path = os.path.join(tmpfs(cache_key), "s3.json")
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "identities": [
                        {
                            "name": SEAWEEDFS_ACCESS_KEY,
                            "credentials": [{"accessKey": SEAWEEDFS_ACCESS_KEY, "secretKey": SEAWEEDFS_SECRET_KEY}],
                            "actions": ["Admin", "Read", "Write", "List", "Tagging"],
                        }
                    ]
                },
                f,
            )

        container = DockerContainer(image="chrislusf/seaweedfs:4.50")
        container.with_command("server -dir=/data -s3 -s3.port=8333 -s3.config=/etc/seaweedfs/s3.json")
        container.with_volume_mapping(config_path, "/etc/seaweedfs/s3.json")
        container.with_exposed_ports(8333)
        container.with_network(network=network)
        # Container names have underscores, which S3 clients reject in a URL host.
        alias = f"seaweedfs-{uuid4().hex[:6]}"
        container.with_network_aliases(alias)
        container.start()

        wrapped = container.get_wrapped_container()
        deadline = time.time() + 60
        while True:
            exit_code, output = wrapped.exec_run(["sh", "-c", f"echo 's3.bucket.create -name {SEAWEEDFS_BUCKET}' | weed shell -master=localhost:9333"])
            if exit_code == 0 and b"created bucket" in output:
                break
            if time.time() > deadline:
                raise RuntimeError(f"SeaweedFS never created the bucket: {output.decode()}")
            time.sleep(1)

        return types.TestContainerDocker(
            id=wrapped.id,
            host_configs={
                "8333": types.TestContainerUrlConfig("http", container.get_container_host_ip(), container.get_exposed_port(8333)),
            },
            container_configs={
                "8333": types.TestContainerUrlConfig("http", alias, 8333),
            },
        )

    def delete(container: types.TestContainerDocker) -> None:
        client = docker.from_env()
        try:
            client.containers.get(container_id=container.id).stop()
            client.containers.get(container_id=container.id).remove(v=True)
        except docker.errors.NotFound:
            logger.info(
                "Skipping removal of SeaweedFS, SeaweedFS(%s) not found. Maybe it was manually removed?",
                {"id": container.id},
            )

    return reuse.wrap(
        request,
        pytestconfig,
        cache_key,
        lambda: types.TestContainerDocker(id="", host_configs={}, container_configs={}),
        create,
        delete,
        types.TestContainerDocker.from_cache,
    )


@pytest.fixture(name="seaweedfs", scope="package")
def seaweedfs(
    tmpfs: Generator[types.LegacyPath, Any],
    network: Network,
    request: pytest.FixtureRequest,
    pytestconfig: pytest.Config,
) -> types.TestContainerDocker:
    return create_seaweedfs(tmpfs, network, request, pytestconfig)


@pytest.fixture(name="archive_named_collection", scope="package")
def archive_named_collection(
    seaweedfs: types.TestContainerDocker,
    clickhouse: types.TestContainerClickhouse,
) -> Generator[str, Any]:
    """The ClickHouse named collection `archive`, pointing at the SeaweedFS bucket."""
    cluster = clickhouse.env["SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_CLUSTER"]
    url = seaweedfs.container_configs["8333"].get(f"/{SEAWEEDFS_BUCKET}/")
    clickhouse.conn.query(f"DROP NAMED COLLECTION IF EXISTS archive ON CLUSTER '{cluster}'")
    clickhouse.conn.query(f"CREATE NAMED COLLECTION archive ON CLUSTER '{cluster}' AS url = '{url}', access_key_id = '{SEAWEEDFS_ACCESS_KEY}', secret_access_key = '{SEAWEEDFS_SECRET_KEY}'")

    yield "archive"

    clickhouse.conn.query(f"DROP NAMED COLLECTION IF EXISTS archive ON CLUSTER '{cluster}'")


def latest_archive_index(conn, named_collection: str, prefix: str, table: str) -> dict | None:
    rows = conn.query(f"SELECT _file, raw FROM s3({named_collection}, filename = '{prefix}/{table}/index/*.json', format = 'RawBLOB', structure = 'raw String') ORDER BY _file DESC LIMIT 1").result_rows
    return json.loads(rows[0][1]) if rows else None


def archived_object_keys(conn, named_collection: str, prefix: str, table: str) -> list[str]:
    rows = conn.query(f"SELECT DISTINCT _path FROM s3({named_collection}, filename = '{prefix}/{table}/day=*/**.parquet', format = 'One')").result_rows
    return sorted(path.split("/", 1)[1] for (path,) in rows)
