import pytest

from fixtures.simulatorcontract import contract_collector_config, load_simulator_golden, sorted_contract_items

GOLDEN = load_simulator_golden("logspipelines.golden.json")
CASES = [case for case in GOLDEN["cases"] if case.get("collector") and not case["collector"].get("rejected")]
REJECTED = [case for case in GOLDEN["cases"] if case.get("collector", {}).get("rejected")]


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_collector_matches_preview(logs_pipelines_contract_outputs: dict[str, list[dict]], case: dict) -> None:
    assert logs_pipelines_contract_outputs[case["name"]] == sorted_contract_items(case["collector"]["output"])


@pytest.mark.parametrize("case", REJECTED, ids=[case["name"] for case in REJECTED])
def test_collector_rejects_what_preview_rejects(simulator_contract_collector_accepts, case: dict) -> None:
    assert not simulator_contract_collector_accepts(case["name"].lower(), contract_collector_config("logs", [case]))
