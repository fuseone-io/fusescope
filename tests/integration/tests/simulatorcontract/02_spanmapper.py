import pytest

from fixtures.simulatorcontract import load_simulator_golden, sorted_contract_items

GOLDEN = load_simulator_golden("spanmapper.golden.json")
CASES = [case for case in GOLDEN["cases"] if case.get("collector")]


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_collector_matches_preview(span_mapper_contract_outputs: dict[str, list[dict]], case: dict) -> None:
    assert span_mapper_contract_outputs[case["name"]] == sorted_contract_items(case["collector"]["output"])
