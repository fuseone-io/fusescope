-- E9: MATERIALIZE TTL on ttl_only_drop_parts tables, with and without materialize_ttl_recalculate_only.
-- Wide parts and a long old_parts_lifetime keep the source part, so e9.sh can tell a column file the
-- mutation kept (hardlink, link count 2) from one it rewrote (1).
CREATE TABLE r9_off (k UInt64, ts DateTime, c DateTime, v String) ENGINE = MergeTree ORDER BY k TTL ts + INTERVAL 30 DAY
SETTINGS ttl_only_drop_parts = 1, min_bytes_for_wide_part = 0, old_parts_lifetime = 3600;
CREATE TABLE r9_on (k UInt64, ts DateTime, c DateTime, v String) ENGINE = MergeTree ORDER BY k TTL ts + INTERVAL 30 DAY
SETTINGS ttl_only_drop_parts = 1, min_bytes_for_wide_part = 0, old_parts_lifetime = 3600, materialize_ttl_recalculate_only = 1;
CREATE TABLE r9_ra (k UInt64, ts DateTime, c DateTime, v String) ENGINE = ReplicatedMergeTree('/t/r9', 'a') ORDER BY k TTL ts + INTERVAL 30 DAY
SETTINGS ttl_only_drop_parts = 1, min_bytes_for_wide_part = 0, old_parts_lifetime = 3600;
CREATE TABLE r9_rb (k UInt64, ts DateTime, c DateTime, v String) ENGINE = ReplicatedMergeTree('/t/r9', 'b') ORDER BY k TTL ts + INTERVAL 30 DAY
SETTINGS ttl_only_drop_parts = 1, min_bytes_for_wide_part = 0, old_parts_lifetime = 3600;

-- Half the rows are 50 days old: expired under both TTLs below, but the part is not.
INSERT INTO r9_off SELECT number, now() - INTERVAL (number % 2) * 50 DAY, now(), toString(number) FROM numbers(1000);
INSERT INTO r9_on SELECT number, now() - INTERVAL (number % 2) * 50 DAY, now(), toString(number) FROM numbers(1000);
INSERT INTO r9_ra SELECT number, now() - INTERVAL (number % 2) * 50 DAY, now(), toString(number) FROM numbers(1000);
SYSTEM SYNC REPLICA r9_rb;

-- E9a: as a query setting it is unknown (expect UNKNOWN_SETTING).
ALTER TABLE r9_off MATERIALIZE TTL SETTINGS materialize_ttl_recalculate_only = 1;

-- E9b: the backstop shape, then MATERIALIZE TTL.
ALTER TABLE r9_off MODIFY TTL greatest(ts + INTERVAL 40 DAY, c + INTERVAL 47 DAY) SETTINGS materialize_ttl_after_modify = 0;
ALTER TABLE r9_on MODIFY TTL greatest(ts + INTERVAL 40 DAY, c + INTERVAL 47 DAY) SETTINGS materialize_ttl_after_modify = 0;
ALTER TABLE r9_ra MODIFY TTL greatest(ts + INTERVAL 40 DAY, c + INTERVAL 47 DAY) SETTINGS materialize_ttl_after_modify = 0;
SYSTEM SYNC REPLICA r9_rb;
ALTER TABLE r9_off MATERIALIZE TTL SETTINGS mutations_sync = 2;
ALTER TABLE r9_on MATERIALIZE TTL SETTINGS mutations_sync = 2;
ALTER TABLE r9_ra MATERIALIZE TTL SETTINGS mutations_sync = 2;
SELECT 'E9b', table, name, rows, delete_ttl_info_max FROM system.parts WHERE table LIKE 'r9%' AND active ORDER BY table;

-- E9c: the replicated mutation runs on each replica.
SYSTEM FLUSH LOGS;
SELECT 'E9c', table, event_type, part_name FROM system.part_log WHERE table IN ('r9_ra', 'r9_rb') AND event_type = 'MutatePart' ORDER BY table;
