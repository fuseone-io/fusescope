#!/usr/bin/env bash
# The spans half of the sessions list through the FuseScope v5 query API (query builder).
# Usage: TOKEN=<bearer> api_sessions_list.sh <app> <days> <runs>
set -euo pipefail
API=${API:-http://localhost:18080}
app=$1 days=$2 runs=${3:-10}
for i in $(seq "$runs"); do
  now=$(date +%s000)
  body=$(cat <<JSON
{"schemaVersion":"v1","start":$((now - days * 86400000)),"end":$now,"requestType":"scalar",
 "compositeQuery":{"queries":[{"type":"builder_query","spec":{"name":"A","signal":"traces",
  "filter":{"expression":"service.name = '$app' AND session.id EXISTS"},
  "aggregations":[{"expression":"countIf(name = 'view')"},{"expression":"countIf(kind_string = 'Client')"},
                  {"expression":"min(timestamp)"},{"expression":"max(timestamp)"}],
  "groupBy":[{"name":"session.id","fieldContext":"attribute","fieldDataType":"string"}],
  "order":[{"key":{"name":"3"},"direction":"desc"}],"limit":50}}]}}
JSON
)
  curl -s -o /dev/null -w '%{time_total}\n' -X POST "$API/api/v5/query_range" \
    -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "$body"
done
