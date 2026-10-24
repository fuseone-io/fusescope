import copy
import json
import os
import time
from collections.abc import Generator
from http import HTTPStatus
from typing import Any

import docker
import docker.errors
import pytest
import requests
from testcontainers.core.container import DockerContainer

from fixtures import types
from fixtures.fs import get_testdata_file_path
from fixtures.logger import setup_logger

logger = setup_logger(__name__)

CASE_ATTRIBUTE = "fusescope.contract.case"
INPUT_INDEX_ATTRIBUTE = "__signoz_input_idx__"
CONFIG_CONTAINER_PATH = "/etc/otel/contract.yaml"
OUTPUT_CONTAINER_DIR = "/contract"

# OTLP/JSON names per signal: request path, resource list, scope list, item list and filter context.
SIGNALS = {
    "logs": ("/v1/logs", "resourceLogs", "scopeLogs", "logRecords", "log_record"),
    "traces": ("/v1/traces", "resourceSpans", "scopeSpans", "spans", "span"),
}


def load_simulator_golden(name: str) -> dict:
    with open(get_testdata_file_path(os.path.join("simulatorcontract", name)), encoding="utf-8") as golden_file:
        return json.load(golden_file)


def contract_collector_config(signal: str, cases: list[dict]) -> dict:
    """One pipeline per case: drop other cases' data, strip the case marker, then run the case's processors."""
    filter_context = SIGNALS[signal][4]
    processors: dict[str, Any] = {"resource/contract": {"attributes": [{"key": CASE_ATTRIBUTE, "action": "delete"}]}}
    exporters: dict[str, Any] = {}
    pipelines: dict[str, Any] = {}
    for index, case in enumerate(cases):
        case_id = f"c{index}"
        processors[f"filter/{case_id}"] = {"error_mode": "ignore", signal: {filter_context: [f'resource.attributes["{CASE_ATTRIBUTE}"] != "{case_id}"']}}
        names = []
        for name in case["collector"]["processorNames"]:
            kind, _, suffix = name.partition("/")
            renamed = f"{kind}/{case_id}_{suffix}" if suffix else f"{kind}/{case_id}"
            processors[renamed] = case["collector"]["processors"][name]
            names.append(renamed)
        exporters[f"file/{case_id}"] = {"path": f"{OUTPUT_CONTAINER_DIR}/{case_id}.json", "flush_interval": "100ms"}
        pipelines[f"{signal}/{case_id}"] = {
            "receivers": ["otlp"],
            "processors": [f"filter/{case_id}", "resource/contract", *names],
            "exporters": [f"file/{case_id}"],
        }
    return {
        "receivers": {"otlp": {"protocols": {"http": {"endpoint": "0.0.0.0:4318"}}}},
        "extensions": {"health_check": {"endpoint": "0.0.0.0:13133"}},
        "processors": processors,
        "exporters": exporters,
        "service": {"extensions": ["health_check"], "pipelines": pipelines},
    }


def send_contract_inputs(collector: types.TestContainerDocker, signal: str, case_inputs: list[list[dict]]) -> None:
    path, resource_key = SIGNALS[signal][0], SIGNALS[signal][1]
    with requests.Session() as session:
        for index, inputs in enumerate(case_inputs):
            for document in inputs:
                marked = copy.deepcopy(document)
                for resource_item in marked.get(resource_key, []):
                    resource = resource_item.setdefault("resource", {})
                    resource.setdefault("attributes", []).append({"key": CASE_ATTRIBUTE, "value": {"stringValue": f"c{index}"}})
                response = session.post(collector.host_configs["4318"].get(path), json=marked, timeout=10)
                assert response.status_code == HTTPStatus.OK, response.text


def read_contract_outputs(output_dir: str, signal: str, expected_counts: list[int], timeout: float = 60) -> list[list[dict]]:
    """Waits until every case file holds its expected number of items, then once more to catch extras."""
    deadline = time.monotonic() + timeout
    outputs = [canonical_otlp_items(os.path.join(output_dir, f"c{index}.json"), signal) for index in range(len(expected_counts))]
    while time.monotonic() < deadline and any(len(items) < count for items, count in zip(outputs, expected_counts)):
        time.sleep(0.5)
        outputs = [canonical_otlp_items(os.path.join(output_dir, f"c{index}.json"), signal) for index in range(len(expected_counts))]
    time.sleep(1)
    return [canonical_otlp_items(os.path.join(output_dir, f"c{index}.json"), signal) for index in range(len(expected_counts))]


def canonical_otlp_items(path: str, signal: str) -> list[dict]:
    """Mirrors canonicalOTLPLogRecords in the Go corpus tests."""
    _, resource_key, scope_key, items_key, _ = SIGNALS[signal]
    items = []
    if not os.path.exists(path):
        return items
    with open(path, encoding="utf-8") as output_file:
        for line in output_file:
            try:
                document = json.loads(line)
            except json.JSONDecodeError:
                continue  # blank, or still being written
            for resource_item in document.get(resource_key, []):
                resource = canonical_key_values(resource_item.get("resource", {}).get("attributes", []))
                for scope_item in resource_item.get(scope_key, []):
                    for item in scope_item.get(items_key, []):
                        record = {key: value for key, value in item.items() if key != "observedTimeUnixNano"}
                        if "attributes" in record:
                            record["attributes"] = canonical_key_values(record["attributes"])
                        if "body" in record:
                            record["body"] = canonical_any_value(record["body"])
                        record["resource"] = resource
                        items.append(record)
    return sorted_contract_items(items)


def sorted_contract_items(items: list[dict]) -> list[dict]:
    def order(item: dict) -> tuple[int, str]:
        index = item.get("attributes", {}).get(INPUT_INDEX_ATTRIBUTE, {}).get("intValue")
        return (int(index) if index is not None else 2**63 - 1, json.dumps(item, sort_keys=True))

    return sorted(items, key=order)


def canonical_key_values(key_values: list[dict]) -> dict:
    return {kv["key"]: canonical_any_value(kv.get("value", {})) for kv in key_values}


def canonical_any_value(value: Any) -> Any:
    if not isinstance(value, dict):
        return value
    if "kvlistValue" in value:
        return {"kvlistValue": canonical_key_values(value["kvlistValue"].get("values", []))}
    if "arrayValue" in value:
        return {"arrayValue": [canonical_any_value(item) for item in value["arrayValue"].get("values", [])]}
    return value


def contract_collector_container(workdir: types.LegacyPath, version: str, config: dict) -> tuple[DockerContainer, str]:
    output_dir = workdir / "out"
    output_dir.mkdir()
    os.chmod(output_dir, 0o777)
    config_path = workdir / "config.yaml"
    config_path.write_text(json.dumps(config), encoding="utf-8")

    container = DockerContainer(image=f"ghcr.io/fuseone-io/fusescope-otel-collector:{version}")
    container.with_volume_mapping(str(config_path), CONFIG_CONTAINER_PATH, "ro")
    container.with_volume_mapping(str(output_dir), OUTPUT_CONTAINER_DIR, "rw")
    container.with_command(f"--config={CONFIG_CONTAINER_PATH}")
    container.with_exposed_ports(4318, 13133)
    return container, str(output_dir)


def wait_for_contract_collector(container: DockerContainer, timeout: int = 60) -> bool:
    """True once the collector is healthy, False if it exits first."""
    for _ in range(timeout):
        wrapped = container.get_wrapped_container()
        wrapped.reload()
        if wrapped.status in ("exited", "dead"):
            return False
        try:
            response = requests.get(f"http://{container.get_container_host_ip()}:{container.get_exposed_port(13133)}/", timeout=2)
            if response.status_code == HTTPStatus.OK:
                return True
        except requests.RequestException:
            pass
        time.sleep(1)
    raise TimeoutError("contract collector neither became healthy nor exited")


@pytest.fixture(name="simulator_contract_collector", scope="package")
def simulator_contract_collector(
    tmpfs: Generator[types.LegacyPath, Any],
    request: pytest.FixtureRequest,
) -> Generator:
    """Yields start(name, config) -> (collector, output dir); containers are removed at teardown."""
    started: list[DockerContainer] = []

    def start(name: str, config: dict) -> tuple[types.TestContainerDocker, str]:
        container, output_dir = contract_collector_container(tmpfs(f"simulatorcontract_{name}"), request.config.getoption("--collector-version"), config)
        container.start()
        started.append(container)
        if not wait_for_contract_collector(container):
            stdout, stderr = container.get_logs()
            logger.error("collector logs:\n%s\n%s", stdout.decode(errors="replace")[-10000:], stderr.decode(errors="replace")[-10000:])
            raise RuntimeError("contract collector exited")

        collector = types.TestContainerDocker(
            id=container.get_wrapped_container().id,
            host_configs={"4318": types.TestContainerUrlConfig("http", container.get_container_host_ip(), container.get_exposed_port(4318))},
            container_configs={},
        )
        return collector, output_dir

    yield start

    remove_contract_collectors(started)


@pytest.fixture(name="simulator_contract_collector_accepts", scope="package")
def simulator_contract_collector_accepts(
    tmpfs: Generator[types.LegacyPath, Any],
    request: pytest.FixtureRequest,
) -> Generator:
    """Yields accepts(name, config) -> bool: whether the collector starts with config."""
    started: list[DockerContainer] = []

    def accepts(name: str, config: dict) -> bool:
        container, _ = contract_collector_container(tmpfs(f"simulatorcontract_{name}"), request.config.getoption("--collector-version"), config)
        container.start()
        started.append(container)
        return wait_for_contract_collector(container)

    yield accepts

    remove_contract_collectors(started)


def remove_contract_collectors(containers: list[DockerContainer]) -> None:
    client = docker.from_env()
    for container in containers:
        container_id = container.get_wrapped_container().id
        try:
            client.containers.get(container_id).remove(force=True, v=True)
        except docker.errors.NotFound:
            logger.info("Skipping removal of contract collector %s, not found", container_id)


def replay_simulator_golden(start, name: str, signal: str, golden: dict) -> dict[str, list[dict]]:
    cases = [case for case in golden["cases"] if case.get("collector") and not case["collector"].get("rejected")]
    collector, output_dir = start(name, contract_collector_config(signal, cases))
    send_contract_inputs(collector, signal, [golden["inputs"][case["logSet"] if signal == "logs" else case["spanSet"]] for case in cases])
    outputs = read_contract_outputs(output_dir, signal, [len(case["collector"]["output"]) for case in cases])
    return {case["name"]: output for case, output in zip(cases, outputs)}


@pytest.fixture(name="logs_pipelines_contract_outputs", scope="package")
def logs_pipelines_contract_outputs(simulator_contract_collector) -> dict[str, list[dict]]:
    return replay_simulator_golden(simulator_contract_collector, "logspipelines", "logs", load_simulator_golden("logspipelines.golden.json"))


@pytest.fixture(name="span_mapper_contract_outputs", scope="package")
def span_mapper_contract_outputs(simulator_contract_collector) -> dict[str, list[dict]]:
    return replay_simulator_golden(simulator_contract_collector, "spanmapper", "traces", load_simulator_golden("spanmapper.golden.json"))
