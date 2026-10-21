#!/usr/bin/env bash
# Times q1-q4 per session-id variant and range, cold and warm, from system.query_log.
# Usage: bench.sh <variant: map|col> <label without dashes>   (writes ../results/bench-<label>.tsv)
set -euo pipefail
cd "$(dirname "$0")"
CH=${CH:-"docker exec -i rum-spike-clickhouse clickhouse-client"}
APP=${APP:-shop-web}
COLD_RUNS=${COLD_RUNS:-5}
WARM_RUNS=${WARM_RUNS:-10}
variant=$1
label=$2_$(date +%s)
out=../results/bench-$2.tsv
mkdir -p ../results

if [ "$variant" = map ]; then
  sid="attributes_string['session.id']"
else
  sid='`attribute_string_session$$id`'
fi

end_s=$($CH -q "SELECT toUnixTimestamp(now())")
sample_sid=$($CH -q "SELECT attributes_string['session.id'] FROM signoz_traces.signoz_index_v3 WHERE serviceName = '$APP' AND resources_string['fusescope.spike'] = 'rum0' AND timestamp BETWEEN now() - INTERVAL 4 DAY AND now() - INTERVAL 3 DAY LIMIT 1")

drop_caches() {
  for c in 'MARK CACHE' 'UNCOMPRESSED CACHE' 'QUERY CACHE' 'QUERY CONDITION CACHE' 'INDEX MARK CACHE' 'INDEX UNCOMPRESSED CACHE' 'MMAP CACHE' 'PRIMARY INDEX CACHE'; do
    $CH -q "SYSTEM DROP $c" 2>/dev/null || true
  done
}

run() { # query file, range seconds, mode, run number
  local q=$1 range=$2 mode=$3 n=$4 settings="use_query_cache = 0"
  [ "$mode" = cold ] && { drop_caches; settings="$settings, min_bytes_to_use_direct_io = 1"; }
  local id="rum0-$label-$(basename "$q" .sql)-$range-$mode-$n-$RANDOM"
  SIDX="$sid" perl -pe 's/SID_LOG/$ENV{SIDX}/g; s/\bSID\b/$ENV{SIDX}/g' "$q" \
    | sed -e "\$s/\$/ SETTINGS $settings/" \
    | $CH --query_id "$id" --param_app="$APP" --param_start_s=$((end_s - range)) --param_end_s="$end_s" --param_sid="$sample_sid" > /dev/null
}

for q in ${QUERIES:-q1_sessions_list.sql q2_session_timeline.sql q3_vitals_p75.sql q4_error_groups.sql}; do
  for range in 86400 604800; do
    for n in $(seq "$COLD_RUNS"); do run "$q" "$range" cold "$n"; done
    run "$q" "$range" warmup 0
    for n in $(seq "$WARM_RUNS"); do run "$q" "$range" warm "$n"; done
  done
done

$CH -q "SYSTEM FLUSH LOGS"
$CH -q "
SELECT
    splitByChar('-', query_id)[3] AS query,
    toUInt32(splitByChar('-', query_id)[4]) / 86400 AS days,
    splitByChar('-', query_id)[5] AS mode,
    count() AS runs,
    round(quantileExact(0.5)(query_duration_ms)) AS p50_ms,
    round(quantileExact(0.95)(query_duration_ms)) AS p95_ms,
    round(avg(read_rows) / 1e6, 2) AS read_mrows,
    round(avg(read_bytes) / 1e6) AS read_mb,
    round(max(memory_usage) / 1e6) AS peak_mem_mb
FROM system.query_log
WHERE query_id LIKE 'rum0-$label-%' AND type = 'QueryFinish' AND mode != 'warmup'
GROUP BY query, days, mode
ORDER BY query, days, mode
FORMAT TSVWithNames" | tee "$out"
