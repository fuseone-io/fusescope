CREATE TABLE IF NOT EXISTS `signoz_logs`.`rehydrated_logs_v2` ON CLUSTER `cluster` (
    `ts_bucket_start` UInt64 CODEC(DoubleDelta, LZ4),
    `resource_fingerprint` String CODEC(ZSTD(1)),
    `timestamp` UInt64 CODEC(DoubleDelta, LZ4),
    `observed_timestamp` UInt64 CODEC(DoubleDelta, LZ4),
    `id` String CODEC(ZSTD(1)),
    `trace_id` String CODEC(ZSTD(1)),
    `span_id` String CODEC(ZSTD(1)),
    `trace_flags` UInt32,
    `severity_text` LowCardinality(String) CODEC(ZSTD(1)),
    `severity_number` UInt8,
    `body` String CODEC(ZSTD(2)),
    `body_v2` JSON(max_dynamic_paths=0, message String) CODEC(ZSTD(1)),
    `body_promoted` JSON CODEC(ZSTD(1)),
    `attributes_string` Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    `attributes_number` Map(LowCardinality(String), Float64) CODEC(ZSTD(1)),
    `attributes_bool` Map(LowCardinality(String), Bool) CODEC(ZSTD(1)),
    `resources_string` Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    `scope_name` String CODEC(ZSTD(1)),
    `scope_version` String CODEC(ZSTD(1)),
    `scope_string` Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    `_retention_days` UInt16 DEFAULT 25,
    `_retention_days_cold` UInt16 DEFAULT 5,
    `resource` JSON(max_dynamic_paths=100) CODEC(ZSTD(1)),
    `inserted_at` DateTime64(3) CODEC(Delta(8), ZSTD(1)),
    `created_at` DateTime64(3) DEFAULT now64(3) CODEC(Delta(8), ZSTD(1)),
    `rehydration_id` UUID,
    `expires_at` DateTime
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/signoz_logs.rehydrated_logs_v2', '{replica}')
PARTITION BY `rehydration_id`
ORDER BY (ts_bucket_start, resource_fingerprint, severity_text, timestamp, id)
TTL `expires_at`
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1, object_serialization_version = 'v3', object_shared_data_serialization_version = 'advanced', storage_policy = 'tiered'
