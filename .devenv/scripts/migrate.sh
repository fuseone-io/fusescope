#!/bin/sh
# Waits for fusescope-schema migrate (the telemetrystore-migrator service of
# the given compose file, already started) and reruns it on exit 2
# (retryable) only, up to 10 times as the chart's Job does. It stops on 1
# (refused) and 4 (interrupted), which a rerun cannot fix. Compose cannot
# tell exit codes apart, so the service itself has no restart policy.
#   .devenv/scripts/migrate.sh COMPOSE_FILE
set -u
compose=$1
service=telemetrystore-migrator
reruns=10
rerun=0
while :; do
  code=$(docker wait "$service") || exit 1
  [ "$code" = 2 ] && [ "$rerun" -lt "$reruns" ] || break
  rerun=$((rerun + 1))
  echo "fusescope-schema migrate exited 2 (retryable), rerunning it ($rerun of $reruns)" >&2
  sleep "${MIGRATE_RETRY_DELAY:-5}"
  docker compose -f "$compose" start "$service" >/dev/null || exit 1
done
[ "$code" = 0 ] && exit 0
docker logs --tail 20 "$service" >&2
case "$code" in
  1) why="refused (drift or an unknown history), not retried" ;;
  2) why="still retryable after $reruns reruns" ;;
  4) why="a migration was interrupted after it started, not retried: it needs status and repair" ;;
  *) why="an unexpected exit" ;;
esac
echo "fusescope-schema migrate exited $code: $why; see https://github.com/fuseone-io/fusescope-collector-server/blob/main/docs/spec/fusescope-schema.md#10-runbook" >&2
exit 1
