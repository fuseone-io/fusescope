"""
The querier describes the ClickHouse tables it reads with Go descriptors
(pkg/telemetryschema/chschema). Go tests pin those descriptors to
testdata/schemacontract.json; these tests pin the same file to the tables the
schema migrator creates, so a drift on either side fails one of them.
"""

import json

import pytest

from fixtures import types
from fixtures.fs import get_testdata_file_path

with open(get_testdata_file_path("schemacontract.json"), encoding="utf-8") as contract_file:
    CONTRACT = json.load(contract_file)

TABLES = CONTRACT["tables"]
INDEXED_TABLES = [table for table in TABLES if table.get("indexes")]
TABLE_PARAMS = [
    pytest.param(
        table,
        id=f"{table['database']}_{table['name']}",
        marks=[pytest.mark.skip(reason="the schema migrator does not create signoz_audit; audit log storage lands with fuseone-io/fusescope#17")] if table["database"] == "signoz_audit" else [],
    )
    for table in TABLES
]
JSON_SUB_COLUMN_INDEXES = CONTRACT["json_sub_column_indexes"]


@pytest.mark.parametrize("table", TABLE_PARAMS)
def test_columns(
    clickhouse: types.TestContainerClickhouse,
    migrator: types.Operation,  # pylint: disable=unused-argument
    table: dict,
) -> None:
    rows = clickhouse.conn.query(f"DESCRIBE TABLE {table['database']}.{table['name']} SETTINGS describe_include_subcolumns = 1").result_rows
    live = {row[0]: row[1] for row in rows}

    expected = {column["name"]: column.get("live_type", column["type"]) for column in table["columns"]}
    assert {name: live.get(name) for name in expected} == expected


@pytest.mark.parametrize("table", INDEXED_TABLES, ids=[f"{table['database']}_{table['name']}" for table in INDEXED_TABLES])
def test_indexes(
    clickhouse: types.TestContainerClickhouse,
    migrator: types.Operation,  # pylint: disable=unused-argument
    table: dict,
) -> None:
    rows = clickhouse.conn.query(
        "SELECT expr FROM system.data_skipping_indices WHERE database = {database:String} AND table = {table:String}",
        parameters={"database": table["database"], "table": table["name"]},
    ).result_rows

    missing = set(table["indexes"]) - {row[0] for row in rows}
    assert not missing, f"{table['database']}.{table['name']} has no skip index on {missing}"


@pytest.mark.parametrize("index", JSON_SUB_COLUMN_INDEXES, ids=[f"{index['column']}_{index['path']}_{index['json_data_type']}".replace(".", "_").replace("-", "_").lower() for index in JSON_SUB_COLUMN_INDEXES])
def test_json_sub_column_index_stored_form(clickhouse: types.TestContainerClickhouse, index: dict) -> None:
    formatted = clickhouse.conn.query("SELECT formatQuerySingleLine({ddl:String})", parameters={"ddl": index["ddl"]}).result_rows[0][0]

    assert f" {index['stored']} TYPE " in formatted, formatted
