-- E6: a column added later to a resource-shaped ReplacingMergeTree, and what the live TTL does with existing parts.
-- Run with --ignore-error: E6e deliberately ends with a failing INSERT.

-- E6a: ALTER ADD COLUMN DEFAULT is metadata-only; old rows evaluate the DEFAULT at read time.
CREATE TABLE r6 (labels String, fingerprint String, seen_at_ts_bucket_start Int64)
ENGINE = ReplacingMergeTree PARTITION BY toDate(seen_at_ts_bucket_start) ORDER BY (labels, fingerprint, seen_at_ts_bucket_start)
TTL toDateTime(seen_at_ts_bucket_start) + toIntervalSecond(1800) + toIntervalDay(15) DELETE
SETTINGS ttl_only_drop_parts = 1, merge_with_ttl_timeout = 0;
SYSTEM STOP MERGES r6;
INSERT INTO r6 VALUES ('svc=a', 'fp1', toUnixTimestamp(now() - toIntervalDay(20)));
INSERT INTO r6 VALUES ('svc=a', 'fp1', toUnixTimestamp(now() - toIntervalDay(1)));
SELECT 'E6a parts before', arraySort(groupArray((name, rows, delete_ttl_info_max))) FROM system.parts WHERE table = 'r6' AND active;
ALTER TABLE r6 ADD COLUMN created_at DateTime64(3) DEFAULT now64(3);
SELECT 'E6a mutations after ADD COLUMN (expect 0)', count() FROM system.mutations WHERE table = 'r6';
SELECT 'E6a created_at of old rows, read 1', groupArray(created_at) FROM r6;
SELECT sleepEachRow(1) FROM numbers(2) FORMAT Null;
SELECT 'E6a created_at of old rows, read 2 (differs: evaluated at read)', groupArray(created_at) FROM r6;

-- E6b: MODIFY TTL to the backstop shape without materialization, as the backend does (materialize_ttl_after_modify=0).
ALTER TABLE r6 MODIFY TTL greatest(toDateTime(seen_at_ts_bucket_start) + toIntervalSecond(1800), toDateTime(created_at)) + toIntervalDay(22) DELETE
SETTINGS materialize_ttl_after_modify = 0;
-- a new part in another partition, also 19 days old, written under the new TTL
INSERT INTO r6 (labels, fingerprint, seen_at_ts_bucket_start) VALUES ('svc=b', 'fp2', toUnixTimestamp(now() - toIntervalDay(19)));
SELECT 'E6b ttl info per part after MODIFY TTL (old parts unchanged, new part now+22d)', arraySort(groupArray((name, rows, delete_ttl_info_max))) FROM system.parts WHERE table = 'r6' AND active;

-- E6c: merges resume. The 20-day part still carries the event-time TTL info it was written with.
SYSTEM START MERGES r6;
SELECT sleep(3) FORMAT Null;
SELECT sleep(3) FORMAT Null;
SELECT sleep(3) FORMAT Null;
SELECT 'E6c parts after merges (expect: 20-day part dropped, 19-day and 1-day parts kept)', arraySort(groupArray((name, rows))) FROM system.parts WHERE table = 'r6' AND active;

-- E6d: MATERIALIZE TTL with materialize_ttl_recalculate_only=1 recomputes ttl info without rewriting data; old rows get created_at = now.
CREATE TABLE r6d (labels String, fingerprint String, seen_at_ts_bucket_start Int64)
ENGINE = ReplacingMergeTree PARTITION BY toDate(seen_at_ts_bucket_start) ORDER BY (labels, fingerprint, seen_at_ts_bucket_start)
TTL toDateTime(seen_at_ts_bucket_start) + toIntervalSecond(1800) + toIntervalDay(15) DELETE
SETTINGS ttl_only_drop_parts = 1, merge_with_ttl_timeout = 0, materialize_ttl_recalculate_only = 1;
INSERT INTO r6d VALUES ('svc=a', 'fp1', toUnixTimestamp(now() - toIntervalDay(14)));
SELECT 'E6d ttl info before', arraySort(groupArray((name, delete_ttl_info_max))) FROM system.parts WHERE table = 'r6d' AND active;
ALTER TABLE r6d ADD COLUMN created_at DateTime64(3) DEFAULT now64(3);
ALTER TABLE r6d MODIFY TTL greatest(toDateTime(seen_at_ts_bucket_start) + toIntervalSecond(1800), toDateTime(created_at)) + toIntervalDay(22) DELETE
SETTINGS materialize_ttl_after_modify = 1, mutations_sync = 2;
SELECT 'E6d mutation', command, is_done FROM system.mutations WHERE table = 'r6d';
SELECT 'E6d ttl info after MATERIALIZE TTL (expect now+22d, same part name + mutation suffix, data not rewritten)', arraySort(groupArray((name, delete_ttl_info_max, bytes_on_disk))) FROM system.parts WHERE table = 'r6d' AND active;

-- E6f: ReplacingMergeTree dedup is unchanged by a MATERIALIZED created_at outside the key; the last inserted row is kept.
CREATE TABLE r6f (labels String, fingerprint String, seen_at_ts_bucket_start Int64, created_at DateTime64(3) MATERIALIZED now64(3))
ENGINE = ReplacingMergeTree ORDER BY (labels, fingerprint, seen_at_ts_bucket_start);
INSERT INTO r6f VALUES ('svc=a', 'fp1', 1);
SELECT sleepEachRow(1) FROM numbers(2) FORMAT Null;
INSERT INTO r6f VALUES ('svc=a', 'fp1', 1);
SELECT 'E6f before merge: physical rows, min and max created_at', count(), min(created_at), max(created_at) FROM r6f;
OPTIMIZE TABLE r6f FINAL;
SELECT 'E6f after merge: rows, created_at (expect the later one)', count(), any(created_at) FROM r6f;

-- E6e: an INSERT without a column list sees DEFAULT columns but not MATERIALIZED ones (the traces exporter inserts this way).
CREATE TABLE r6e_materialized (labels String, fingerprint String, seen_at_ts_bucket_start Int64, created_at DateTime64(3) MATERIALIZED now64(3)) ENGINE = MergeTree ORDER BY labels;
INSERT INTO r6e_materialized SELECT 'svc=a', 'fp1', 1;
SELECT 'E6e materialized: 3-value insert ok', count(), created_at > now64(3) - 60 FROM r6e_materialized GROUP BY created_at;
CREATE TABLE r6e_default (labels String, fingerprint String, seen_at_ts_bucket_start Int64, created_at DateTime64(3) DEFAULT now64(3)) ENGINE = MergeTree ORDER BY labels;
SELECT 'E6e default: the next 3-value insert fails (NUMBER_OF_COLUMNS_DOESNT_MATCH)';
INSERT INTO r6e_default SELECT 'svc=a', 'fp1', 1;
