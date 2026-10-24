#!/usr/bin/env bash
# X1-X3: export one logs_v2 day to Parquet (ADR 0002 step) from a cold part, a cold part bypassing the cache, and a local part.
set -euo pipefail
C=${C:-csbench-clickhouse-1}
q() { docker exec "$C" clickhouse-client "$@"; }
cache() { q -q "SELECT formatReadableSize(sum(downloaded_size)) FROM system.filesystem_cache"; }
part_of_day() { q -q "SELECT arraySort(groupUniqArray(partition_id))[$1] FROM system.parts WHERE active AND database = 'signoz_logs' AND table = 'logs_v2'"; }
run() { # label, partition id, extra settings
  local id="x-$1-$RANDOM"
  q -q "SYSTEM DROP FILESYSTEM CACHE"
  q --query_id="$id" -q "INSERT INTO FUNCTION s3('http://minio:9000/archive/$1.parquet', 'bench', 'bench-secret', 'Parquet')
    SELECT * EXCEPT (body_v2, body_promoted, resource) FROM signoz_logs.logs_v2 WHERE _partition_id = '$2'
    SETTINGS s3_truncate_on_insert = 1, output_format_parquet_compression_method = 'zstd' $3"
  q -q "SYSTEM FLUSH LOGS query_log"
  echo "$1: $(q -q "SELECT concat(toString(query_duration_ms), ' ms, rows ', toString(read_rows), ', S3 GET ', toString(ProfileEvents['S3GetObject']),
    ', from S3 ', formatReadableSize(ProfileEvents['ReadBufferFromS3Bytes']), ', written ', formatReadableSize(ProfileEvents['WriteBufferFromS3Bytes']))
    FROM system.query_log WHERE query_id = '$id' AND type = 'QueryFinish'"); cache after: $(cache)"
}
P7=$(part_of_day 4); P6=$(part_of_day 5)
run cold-default "$P7" ""
run cold-bypass "$P7" ", read_from_filesystem_cache_if_exists_otherwise_bypass_cache = 1"
run cold-nocache "$P7" ", enable_filesystem_cache = 0"
q -q "ALTER TABLE signoz_logs.logs_v2 MOVE PARTITION ID '$P6' TO VOLUME 'default'"
run local "$P6" ""
q -q "ALTER TABLE signoz_logs.logs_v2 MOVE PARTITION ID '$P6' TO VOLUME 's3'"
