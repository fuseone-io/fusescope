-- E4: MOVE PARTITION on a lagging replica (two replicas of one shard on one server).
CREATE TABLE live_a (ts DateTime, n UInt32) ENGINE = ReplicatedMergeTree('/t/live', 'a') PARTITION BY toDate(ts) ORDER BY (ts, n);
CREATE TABLE live_b (ts DateTime, n UInt32) ENGINE = ReplicatedMergeTree('/t/live', 'b') PARTITION BY toDate(ts) ORDER BY (ts, n);
CREATE TABLE stage_a (ts DateTime, n UInt32) ENGINE = ReplicatedMergeTree('/t/stage', 'a') PARTITION BY toDate(ts) ORDER BY (ts, n);
CREATE TABLE stage_b (ts DateTime, n UInt32) ENGINE = ReplicatedMergeTree('/t/stage', 'b') PARTITION BY toDate(ts) ORDER BY (ts, n);

INSERT INTO live_a SELECT toDateTime('2026-10-01 00:00:00') + number, number FROM numbers(100);
SYSTEM SYNC REPLICA live_b;
SELECT 'E4 before lag: a', count() FROM live_a;
SELECT 'E4 before lag: b', count() FROM live_b;

-- replica b stops fetching; a new part is committed through a
SYSTEM STOP FETCHES live_b;
INSERT INTO live_a SELECT toDateTime('2026-10-01 01:00:00') + number, 1000 + number FROM numbers(50);
SELECT 'E4 lag: a rows', count() FROM live_a;
SELECT 'E4 lag: b rows (missing the new part)', count() FROM live_b;
SELECT 'E4 lag: b replication queue entries', count() FROM system.replication_queue WHERE table = 'live_b';

-- the move is issued on the lagging replica
ALTER TABLE live_b MOVE PARTITION '2026-10-01' TO TABLE stage_b SETTINGS alter_sync = 0;
SELECT sleepEachRow(1) FROM numbers(3) FORMAT Null;
SELECT 'E4 after move on b: stage_b rows', count() FROM stage_b;
SELECT 'E4 after move on b: live_b rows', count() FROM live_b;
SYSTEM START FETCHES live_b;
SYSTEM SYNC REPLICA live_b;
SYSTEM SYNC REPLICA live_a;
SYSTEM SYNC REPLICA stage_a;
SYSTEM SYNC REPLICA stage_b;
SELECT 'E4 settled: live_a rows', count() FROM live_a;
SELECT 'E4 settled: live_b rows', count() FROM live_b;
SELECT 'E4 settled: stage_a rows', count() FROM stage_a;
SELECT 'E4 settled: stage_b rows', count() FROM stage_b;
