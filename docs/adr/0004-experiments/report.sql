SELECT label, query,
  quantileExact(0.5)(ms) AS p50_ms, quantileExact(0.95)(ms) AS p95_ms,
  round(avg(s3_get)) AS s3_get, round(avg(minio_get)) AS minio_get,
  formatReadableSize(avg(s3_read_bytes)) AS from_s3, formatReadableSize(avg(cache_hit_bytes)) AS from_cache,
  formatReadableSize(avg(read_bytes)) AS read_uncompressed, any(result_rows) AS rows
FROM bench.runs GROUP BY label, query ORDER BY query, label
FORMAT PrettyCompactMonoBlock
