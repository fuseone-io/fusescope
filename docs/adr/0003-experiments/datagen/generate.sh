#!/usr/bin/env bash
# Generates DAYS x 3 apps of synthetic RUM data, one INSERT per app and day,
# and stops if ClickHouse resident memory passes MEM_LIMIT_GB.
set -euo pipefail
cd "$(dirname "$0")"
CH=${CH:-"docker exec -i rum-spike-clickhouse clickhouse-client"}
SESSIONS=${SESSIONS:-20000}
DAYS=${DAYS:-7}
MEM_LIMIT_GB=${MEM_LIMIT_GB:-9}

mem_gb() { $CH -q "SELECT round(value / 1e9, 2) FROM system.asynchronous_metrics WHERE metric = 'MemoryResident'"; }

for day in $(seq 0 $((DAYS - 1))); do
  for app in 0 1 2; do
    m=$(mem_gb)
    if awk "BEGIN { exit !($m > $MEM_LIMIT_GB) }"; then
      echo "stop: ClickHouse resident memory ${m} GB > ${MEM_LIMIT_GB} GB" >&2
      exit 1
    fi
    t1=$($CH --time --param_app=$app --param_day=$day --param_sessions=$SESSIONS < spans.sql 2>&1)
    t2=$($CH --time --param_app=$app --param_day=$day --param_sessions=$SESSIONS < logs.sql 2>&1)
    echo "day=$day app=$app spans=${t1}s logs=${t2}s mem=${m}GB"
  done
done

for date in $($CH -q "SELECT DISTINCT toDate(timestamp) FROM signoz_traces.signoz_index_v3 WHERE resources_string['fusescope.spike'] = 'rum0' ORDER BY 1"); do
  $CH --param_date=$date --multiquery < resources.sql
done
echo "resources done"
