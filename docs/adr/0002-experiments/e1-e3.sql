-- E1: MOVE PARTITION TO TABLE as an atomic snapshot; a later insert stays in the live table.
CREATE TABLE live (ts DateTime, day Date MATERIALIZED toDate(ts), n UInt32)
ENGINE = MergeTree PARTITION BY toDate(ts) ORDER BY (ts, n)
SETTINGS ttl_only_drop_parts = 1;
INSERT INTO live (ts, n) SELECT toDateTime('2026-10-01 00:00:00') + number, number FROM numbers(1000);
INSERT INTO live (ts, n) SELECT toDateTime('2026-10-02 00:00:00') + number, number FROM numbers(10);

-- E2: does CREATE TABLE ... AS copy partition and sorting keys?
CREATE TABLE stage_seg1 AS live;
SELECT 'E2 stage keys', partition_key, sorting_key, engine FROM system.tables WHERE name = 'stage_seg1';

ALTER TABLE live MOVE PARTITION '2026-10-01' TO TABLE stage_seg1;
SELECT 'E1 after move: live rows for 2026-10-01', count() FROM live WHERE toDate(ts) = '2026-10-01';
SELECT 'E1 after move: stage rows', count() FROM stage_seg1;
-- a late row for the moved day arrives after the move
INSERT INTO live (ts, n) VALUES ('2026-10-01 12:00:00', 99999);
SELECT 'E1 late row: live rows for 2026-10-01', count() FROM live WHERE toDate(ts) = '2026-10-01';
SELECT 'E1 late row: stage rows (unchanged)', count() FROM stage_seg1;
SELECT 'E1 other day untouched', count() FROM live WHERE toDate(ts) = '2026-10-02';
-- the late row can be moved into a second stage table later
CREATE TABLE stage_seg2 AS live;
ALTER TABLE live MOVE PARTITION '2026-10-01' TO TABLE stage_seg2;
SELECT 'E1 second move: stage2 rows', count() FROM stage_seg2;
DROP TABLE stage_seg1;
SELECT 'E1 drop stage1 leaves live day', count() FROM live WHERE toDate(ts) = '2026-10-01';

-- E3: ReplacingMergeTree with a DateTime version (like computed_at), repeated versions and ties, before merges.
CREATE TABLE red (k UInt32, unix_milli Int64, v Float64, computed_at DateTime)
ENGINE = ReplacingMergeTree(computed_at) PARTITION BY toDate(unix_milli / 1000) ORDER BY (k, unix_milli);
SYSTEM STOP MERGES red;
INSERT INTO red VALUES (1, 1790000000000, 10, '2026-10-01 00:01:00');
INSERT INTO red VALUES (1, 1790000000000, 20, '2026-10-01 00:02:00');
INSERT INTO red VALUES (1, 1790000000000, 30, '2026-10-01 00:02:00');
SELECT 'E3 physical rows', count() FROM red;
SELECT 'E3 FINAL value', v FROM red FINAL;
SELECT 'E3 argMax(v, computed_at)', argMax(v, computed_at) FROM red;
SELECT 'E3 argMax(v, (computed_at, _part))', argMax(v, (computed_at, _part)) FROM red;
