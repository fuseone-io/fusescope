from collections.abc import Callable
from datetime import UTC, datetime

from fixtures import types


def test_seed_attribute_evolution_changes_rows(
    clickhouse: types.TestContainerClickhouse,
    migrator: types.Operation,  # pylint: disable=unused-argument
    seed_attribute_evolution: Callable[[str, datetime], None],
    use_attribute_backend: Callable[[str], None],
) -> None:
    """Seeds a row and then clears every attributes row, as the "map" backend does, so the next
    test sees what the fixture's teardown leaves behind."""
    seed_attribute_evolution("traces", datetime(2021, 6, 1, tzinfo=UTC))
    use_attribute_backend("map")

    rows = clickhouse.conn.query("SELECT count() FROM signoz_metadata.distributed_column_evolution_metadata WHERE column_name = 'attributes' AND field_context = 'attribute' AND field_name = '__all__'").result_rows
    assert rows == [(0,)]


def test_attribute_evolution_baseline_survives_the_fixture(
    clickhouse: types.TestContainerClickhouse,
    migrator: types.Operation,  # pylint: disable=unused-argument
) -> None:
    """The install leaves one traces `attributes` JSON row at install time. Runs after a test that
    seeded and cleared attributes rows: their teardown must have put the install's row back, and
    only it."""
    rows = clickhouse.conn.query("SELECT signal, column_type, version, release_time FROM signoz_metadata.distributed_column_evolution_metadata WHERE column_name = 'attributes' AND field_context = 'attribute' AND field_name = '__all__'").result_rows

    assert [row[:3] for row in rows] == [("traces", "JSON()", 1)]
    assert rows[0][3] > int(datetime(2021, 6, 1, tzinfo=UTC).timestamp() * 1e9)
