import datetime
import hashlib
import json
import time
import uuid
from collections.abc import Generator
from typing import Any

import pytest
from sqlalchemy import sql

from fixtures import types

RESTORE_PREFIX = "fusescope-restore"


@pytest.fixture(name="archive_restore_state", scope="function")
def archive_restore_state(signoz: types.SigNoz) -> Generator[None, Any]:
    """Clears the archive state publish_day and request_restoration write, before and after."""

    def clear() -> None:
        attempts = "SELECT id FROM archive_attempt WHERE prefix = :prefix"
        with signoz.sqlstore.conn.begin() as tx:
            tx.execute(sql.text(f"DELETE FROM archive_part WHERE attempt_id IN ({attempts})"), {"prefix": RESTORE_PREFIX})
            tx.execute(sql.text(f"DELETE FROM archive_object WHERE attempt_id IN ({attempts})"), {"prefix": RESTORE_PREFIX})
            tx.execute(sql.text("DELETE FROM archive_attempt WHERE prefix = :prefix"), {"prefix": RESTORE_PREFIX})
            tx.execute(sql.text("DELETE FROM archive_rehydration WHERE created_by = 'integration'"))

    clear()
    yield
    clear()


def publish_day(signoz: types.SigNoz, named_collection: str, table: str, day: datetime.date) -> list[str]:
    """Exports table's parts of day to the bucket the way the archive does, and commits
    them in SQL. Returns their object keys."""
    conn = signoz.telemetrystore.conn
    conn.query(f"OPTIMIZE TABLE signoz_logs.{table} FINAL")
    parts = conn.query(
        "SELECT name, partition_id, min_block_number, max_block_number, data_version, rows FROM system.parts WHERE database = 'signoz_logs' AND table = {table:String} AND active AND startsWith(partition_id, {day:String})",
        parameters={"table": table, "day": day.strftime("%Y%m%d")},
    ).result_rows
    assert parts, f"{table} has no part on {day}"
    columns = conn.query(
        "SELECT name, type FROM system.columns WHERE database = 'signoz_logs' AND table = {table:String} AND default_kind NOT IN ('MATERIALIZED', 'ALIAS') ORDER BY position",
        parameters={"table": table},
    ).result_rows
    mapping = [column_mapping(name, source) for name, source in columns]
    expressions = ", ".join(f"CAST(`{m['name']}`, '{m['export_type']}') AS `{m['name']}`" for m in mapping)

    attempt_id = str(uuid.uuid4())
    partition_id = parts[0][1]
    directory = f"{RESTORE_PREFIX}/{table}/day={day}/shard=1/partition={partition_id}/attempt={attempt_id}"
    manifest_key = f"{RESTORE_PREFIX}/{table}/manifests/attempt={attempt_id}.json"
    manifest = json.dumps({"format_version": 1, "table": table, "attempt_id": attempt_id, "columns": mapping}).encode()
    conn.query(f"INSERT INTO FUNCTION s3({named_collection}, filename = '{manifest_key}', format = 'RawBLOB', structure = 'raw String') SELECT {{raw:String}}", parameters={"raw": manifest.decode()})

    objects = []
    for name, part_partition, min_block, max_block, data_version, rows in parts:
        assert part_partition == partition_id, "one partition a day in this test"
        key = f"{directory}/{name}.parquet"
        conn.query(f"INSERT INTO FUNCTION s3({named_collection}, filename = '{key}', format = 'Parquet') SELECT {expressions}, toInt32(1) AS _shard, _part FROM signoz_logs.{table} WHERE _part = '{name}'")
        size, etag = conn.query(f"SELECT _size, _etag FROM s3({named_collection}, filename = '{key}', format = 'One')").result_rows[0]
        objects.append({"id": str(uuid.uuid4()), "key": key, "bytes": size, "etag": etag.strip('"'), "rows": rows, "part": name, "min": min_block, "max": max_block, "version": data_version})

    commit(signoz, named_collection, table, partition_id, attempt_id, mapping, manifest_key, hashlib.sha256(manifest).hexdigest(), objects)
    return [o["key"] for o in objects]


def column_mapping(name: str, source: str) -> dict:
    export_type = {"UInt8": "Int32", "UInt16": "Int32", "UInt32": "Int64", "UInt64": "Int64", "LowCardinality(String)": "String"}.get(source, source)
    mapping = {"name": name, "source_type": source, "export_type": export_type}
    if "UInt64" in source:
        mapping["uint64_rule"] = "bits"
    return mapping


def commit(signoz: types.SigNoz, named_collection: str, table: str, partition_id: str, attempt_id: str, mapping: list, manifest_key: str, manifest_sha256: str, objects: list) -> None:  # pylint: disable=too-many-arguments,too-many-positional-arguments
    now = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
    with signoz.sqlstore.conn.begin() as tx:
        tx.execute(
            sql.text(
                "INSERT INTO archive_attempt (id, signal, kind, table_name, shard, partition_id, epoch, status, named_collection, prefix, format_version, column_mapping, manifest_key, manifest_sha256, created_at, updated_at) "
                "VALUES (:id, 'logs', 'export', :table, 1, :partition, 1, 'published', :collection, :prefix, 1, :mapping, :manifest_key, :sha, :now, :now)"
            ),
            {"id": attempt_id, "table": table, "partition": partition_id, "collection": named_collection, "prefix": RESTORE_PREFIX, "mapping": json.dumps(mapping), "manifest_key": manifest_key, "sha": manifest_sha256, "now": now},
        )
        for o in objects:
            tx.execute(
                sql.text("INSERT INTO archive_object (id, attempt_id, named_collection, object_key, bytes, etag, rows, status, created_at, updated_at) VALUES (:id, :attempt, :collection, :key, :bytes, :etag, :rows, 'active', :now, :now)"),
                {"id": o["id"], "attempt": attempt_id, "collection": named_collection, "key": o["key"], "bytes": o["bytes"], "etag": o["etag"], "rows": o["rows"], "now": now},
            )
            tx.execute(
                sql.text("INSERT INTO archive_part (id, table_name, shard, partition_id, part_name, min_block, max_block, data_version, rows, object_id, attempt_id, status, created_at, updated_at) VALUES (:id, :table, 1, :partition, :part, :min, :max, :version, :rows, :object, :attempt, 'published', :now, :now)"),
                {"id": str(uuid.uuid4()), "table": table, "partition": partition_id, "part": o["part"], "min": o["min"], "max": o["max"], "version": o["version"], "rows": o["rows"], "object": o["id"], "attempt": attempt_id, "now": now},
            )


def request_restoration(signoz: types.SigNoz, day: datetime.datetime) -> str:
    """Records a pending restoration of day, as the API will."""
    rehydration_id = str(uuid.uuid4())
    start = day.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)
    now = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
    with signoz.sqlstore.conn.begin() as tx:
        tx.execute(
            sql.text("INSERT INTO archive_rehydration (id, signal, range_start, range_end, status, expires_at, created_by, bytes, rows, ddl, failure_reason, failure_message, created_at, updated_at) VALUES (:id, 'logs', :start, :end, 'pending', :expires, 'integration', 0, 0, '', '', '', :now, :now)"),
            {"id": rehydration_id, "start": start, "end": start + datetime.timedelta(days=1), "expires": now + datetime.timedelta(days=1), "now": now},
        )
    return rehydration_id


def wait_for_restoration(signoz: types.SigNoz, rehydration_id: str) -> dict:
    deadline = time.time() + 120
    while True:
        with signoz.sqlstore.conn.connect() as conn:
            row = conn.execute(sql.text("SELECT status, failure_reason, failure_message, rows, bytes, ddl FROM archive_rehydration WHERE id = :id"), {"id": rehydration_id}).mappings().one()
        if row["status"] in ("ready", "failed"):
            return dict(row)
        assert time.time() < deadline, f"restoration {rehydration_id} never finished: {dict(row)}"
        time.sleep(2)
