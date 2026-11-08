#!/usr/bin/env bash
# The kit's update into fusescope-schema, on a throwaway compose project. The kit as it was at
# PREVIOUS (the earlier collector's migrator, no keeper_map_path_prefix) creates the schema; then
# this kit's files replace it in the same directory and volumes, and update.sh's steps run up to
# the migrator. Its own project, network and directory: it never touches the demo.
#   deploy/demo/test/schema-update.sh [previous-commit]
set -euo pipefail
KIT=$(cd "$(dirname "$0")/.." && pwd)
REPO=$(git -C "$KIT" rev-parse --show-toplevel)
PREVIOUS=${1:-95bca772f190f52784babb803b1d47d18433c988}
SCHEMA_IMAGE=ghcr.io/fuseone-io/fusescope-collector:0.4.1@sha256:9951f2479ac6e5150b116cd856569aaae6ed921e9b951f0fd9c93160e7311077
W=$(mktemp -d "${TMPDIR:-/tmp}/fsdemo-update-test.XXXXXX")
export COMPOSE_PROJECT_NAME=fsdemo-update-test COMPOSE_FILE=compose.yaml:test-network.yaml
cleanup() { (cd "$W" && docker compose --profile generators down -v --remove-orphans >/dev/null 2>&1) || true; rm -rf "$W"; }
trap cleanup EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }

# The demo's network is named fusescope-demo; this project gets one of its own.
network() { printf 'networks:\n  default:\n    name: fsdemo-update-test\n' > "$W/test-network.yaml"; }
# The migrator's exit code once its container has exited, or a failure when it has not within 240 s.
migrator_exit() {
  local id status=unknown
  id=$(docker compose ps -aq telemetrystore-migrator)
  [ -n "$id" ] || fail "no telemetrystore-migrator container"
  for _ in $(seq 120); do
    status=$(docker inspect -f '{{.State.Status}}' "$id")
    if [ "$status" = exited ]; then docker inspect -f '{{.State.ExitCode}}' "$id"; return 0; fi
    sleep 2
  done
  fail "telemetrystore-migrator is still $status after 240 s"
}

echo "=== previous kit at $PREVIOUS"
git -C "$REPO" archive "$PREVIOUS" deploy/demo | tar -x -C "$W" --strip-components=2
cd "$W"; network
cp .env.example .env; sed -i 's/^JWT_SECRET=$/JWT_SECRET=test/' .env
# shellcheck disable=SC1091
. ./lib.sh; load_env
compose up -d clickhouse >/dev/null 2>&1; wait_healthy clickhouse
compose up -d telemetrystore-migrator >/dev/null 2>&1
rc=$(migrator_exit); echo "previous migrator ($(docker inspect -f '{{.Config.Image}}' "$(compose ps -aq telemetrystore-migrator)")) exit $rc"
[ "$rc" = 0 ] || fail "the previous kit's migrator did not create the schema"
before=$(compose exec -T clickhouse sh -c "sed -n 's:.*<keeper_map_path_prefix>\\(.*\\)</keeper_map_path_prefix>.*:\\1:p' /var/lib/clickhouse/preprocessed_configs/config.xml")
echo "keeper_map_path_prefix before: '${before}'"
ch_before=$(compose ps -q clickhouse)

echo "=== only this kit's lib.sh, the previous compose (no keeper_map_path_prefix): ensure_keeper_map must refuse"
cp "$KIT/lib.sh" lib.sh
# shellcheck disable=SC1091
. ./lib.sh
if ensure_keeper_map; then fail "ensure_keeper_map went on without keeper_map_path_prefix"; fi
echo "refused, as expected"
ch_before=$(compose ps -q clickhouse)

echo "=== this kit's files over it, then update.sh's steps up to the migrator"
(cd "$KIT" && tar -c --exclude=./test --exclude=./.env .) | tar -x -C "$W"
network
# shellcheck disable=SC1091
. ./lib.sh; load_env
ensure_keeper_map
after=$(keeper_map_prefix)
ch_after=$(compose ps -q clickhouse)
echo "keeper_map_path_prefix after: '${after}'; clickhouse container ${ch_before:0:12} -> ${ch_after:0:12}"
[ "$ch_after" != "$ch_before" ] || fail "ClickHouse was not recreated: the new configuration is not in effect"
[ "$after" = /fusescope/keeper_map ] || fail "keeper_map_path_prefix is '$after'"
compose up -d telemetrystore-migrator >/dev/null 2>&1
rc=$(migrator_exit); echo "migrator ($(docker inspect -f '{{.Config.Image}}' "$(compose ps -aq telemetrystore-migrator)")) exit $rc"
docker compose logs --no-log-prefix telemetrystore-migrator 2>&1 | tail -3
[ "$rc" = 0 ] || fail "fusescope-schema migrate exited $rc"
chk=$(docker run --rm --network fsdemo-update-test --entrypoint /fusescope-schema "$SCHEMA_IMAGE" check \
  --endpoint=clickhouse:9000 --username=default --tls-insecure --cluster=cluster 2>&1; echo "exit $?")
echo "check: $chk" | tr '\n' ' '; echo
echo "$chk" | grep -q "exit 0" || fail "fusescope-schema check is not up to date"
compose exec -T clickhouse clickhouse-client -q "SELECT id, name, toString(state), adopted FROM fusescope_schema.migrations ORDER BY id FORMAT TSV"
echo "PASS"
