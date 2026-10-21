-- What the FuseScope fields API did when session.id was promoted
-- (POST /api/v2/traces/fields {"name":"session.id","dataType":"string","type":"tag","selected":true}
--  and POST /api/v1/logs/fields with "type":"attributes"), copied from system.columns / system.data_skipping_indices:
--
-- ALTER TABLE signoz_traces.{signoz_index_v3,distributed_signoz_index_v3} ON CLUSTER cluster
--   ADD COLUMN IF NOT EXISTS `attribute_string_session$$id` String DEFAULT attributes_string['session.id'] CODEC(ZSTD(1));
-- ALTER TABLE … ADD COLUMN IF NOT EXISTS `attribute_string_session$$id_exists` bool
--   DEFAULT if(mapContains(attributes_string, 'session.id') != 0, true, false) CODEC(ZSTD(1));
-- ALTER TABLE signoz_traces.signoz_index_v3 ON CLUSTER cluster
--   ADD INDEX IF NOT EXISTS `attribute_string_session$$id_idx` (`attribute_string_session$$id`) TYPE bloom_filter(0.01) GRANULARITY 64;
-- (same three statements on signoz_logs.logs_v2 / distributed_logs_v2)
--
-- A DEFAULT column is stored only by inserts after the ALTER. Rows already on disk
-- compute it from the map on every read until their part is rewritten, and the
-- new index covers them only after MATERIALIZE INDEX. This file does both, which
-- is what data ingested after promotion looks like.
ALTER TABLE signoz_traces.signoz_index_v3 MATERIALIZE COLUMN `attribute_string_session$$id` SETTINGS mutations_sync = 2;
ALTER TABLE signoz_traces.signoz_index_v3 MATERIALIZE INDEX `attribute_string_session$$id_idx` SETTINGS mutations_sync = 2;
ALTER TABLE signoz_logs.logs_v2 MATERIALIZE COLUMN `attribute_string_session$$id` SETTINGS mutations_sync = 2;
ALTER TABLE signoz_logs.logs_v2 MATERIALIZE INDEX `attribute_string_session$$id_idx` SETTINGS mutations_sync = 2;
