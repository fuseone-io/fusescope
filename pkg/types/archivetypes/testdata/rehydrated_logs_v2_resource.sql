CREATE TABLE IF NOT EXISTS `signoz_logs`.`rehydrated_logs_v2_resource` ON CLUSTER `cluster` (
    `labels` String CODEC(ZSTD(5)),
    `fingerprint` String CODEC(ZSTD(1)),
    `seen_at_ts_bucket_start` Int64 CODEC(Delta(8), ZSTD(1)),
    `_retention_days` UInt16 DEFAULT 25,
    `_retention_days_cold` UInt16 DEFAULT 5,
    `rehydration_id` UUID,
    `expires_at` DateTime
)
ENGINE = ReplicatedReplacingMergeTree('/clickhouse/tables/{shard}/signoz_logs.rehydrated_logs_v2_resource', '{replica}')
PARTITION BY `rehydration_id`
ORDER BY (labels, fingerprint, seen_at_ts_bucket_start)
TTL `expires_at`
SETTINGS ttl_only_drop_parts = 1, index_granularity = 8192, storage_policy = 'tiered'
