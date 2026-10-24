#!/bin/sh
# E9: runs e9.sql in a fresh container and prints the link count of each column file of the
# active parts: 2 means the mutation kept the source file, 1 that it rewrote it.
set -eu
dir=$(cd "$(dirname "$0")" && pwd)
docker rm -f ch-e9 >/dev/null 2>&1 || true
docker run -d --name ch-e9 -v "$dir/keeper.xml":/etc/clickhouse-server/config.d/keeper.xml -v "$dir":/w clickhouse/clickhouse-server:25.12.5 >/dev/null
until docker exec ch-e9 clickhouse-client -q "SELECT 1" >/dev/null 2>&1; do sleep 1; done
docker exec ch-e9 clickhouse-client --multiquery --ignore-error --queries-file /w/e9.sql 2>&1 | grep -E '^E9|UNKNOWN_SETTING' | cut -c1-160
for table in r9_off r9_on r9_ra r9_rb; do
  path=$(docker exec ch-e9 clickhouse-client -q "SELECT path FROM system.parts WHERE table = '$table' AND active")
  links=""
  for column in k ts c v; do links="$links $column=$(docker exec ch-e9 stat -c %h "$path/$column.bin")"; done
  echo "E9 links $table$links"
done
docker rm -f ch-e9 >/dev/null
