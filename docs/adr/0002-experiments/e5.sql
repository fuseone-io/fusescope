-- E5: DROP PART of an exported part list on a lagging replica; block ranges in part names.
CREATE TABLE p_a (ts DateTime, n UInt32) ENGINE = ReplicatedMergeTree('/t/p', 'a') PARTITION BY toDate(ts) ORDER BY (ts, n);
CREATE TABLE p_b (ts DateTime, n UInt32) ENGINE = ReplicatedMergeTree('/t/p', 'b') PARTITION BY toDate(ts) ORDER BY (ts, n);
SYSTEM STOP MERGES p_a;
SYSTEM STOP MERGES p_b;
INSERT INTO p_a SELECT toDateTime('2026-10-01 00:00:00') + number, number FROM numbers(100);
INSERT INTO p_a SELECT toDateTime('2026-10-01 02:00:00') + number, number FROM numbers(20);
SYSTEM SYNC REPLICA p_b;
SELECT 'E5 parts after sync (name, rows)', groupArray((name, rows)) FROM system.parts WHERE table = 'p_b' AND active;

-- b lags; a third part is committed through a
SYSTEM STOP FETCHES p_b;
INSERT INTO p_a SELECT toDateTime('2026-10-01 03:00:00') + number, number FROM numbers(7);
SELECT 'E5 lag: parts on a', groupArray((name, rows)) FROM system.parts WHERE table = 'p_a' AND active;
SELECT 'E5 lag: parts on b', groupArray((name, rows)) FROM system.parts WHERE table = 'p_b' AND active;

-- "exported" set = the parts b has; drop exactly those names, issued on lagging b
ALTER TABLE p_b DROP PART '20261001_0_0_0' SETTINGS alter_sync = 0;
ALTER TABLE p_b DROP PART '20261001_1_1_0' SETTINGS alter_sync = 0;
SYSTEM START FETCHES p_b;
SYSTEM SYNC REPLICA p_b;
SYSTEM SYNC REPLICA p_a;
SELECT 'E5 settled: rows on a', count() FROM p_a;
SELECT 'E5 settled: rows on b', count() FROM p_b;
SELECT 'E5 settled: parts on a', groupArray((name, rows)) FROM system.parts WHERE table = 'p_a' AND active;

-- E5b: a merge that folds an exported part together with a later one yields a wider block range
INSERT INTO p_a SELECT toDateTime('2026-10-01 04:00:00') + number, number FROM numbers(3);
SYSTEM START MERGES p_a;
OPTIMIZE TABLE p_a PARTITION '20261001' FINAL;
SELECT 'E5b merged part on a', groupArray((name, rows)) FROM system.parts WHERE table = 'p_a' AND active;
