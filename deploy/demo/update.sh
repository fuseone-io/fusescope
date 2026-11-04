#!/usr/bin/env bash
# Usage: ./update.sh <fusescope-version>
set -euo pipefail
cd "$(dirname "$0")"
. ./lib.sh

version=${1:?usage: ./update.sh <fusescope-version>}
docker manifest inspect "ghcr.io/fuseone-io/fusescope:$version" >/dev/null
env_set FUSESCOPE_VERSION "$version"
ensure_ingest
# The backend's RUM gateway went away in 0.159.0; RUM goes through Caddy to the collector.
[ "$(env_get RUM_ENDPOINT)" != http://fusescope:8080 ] || env_set RUM_ENDPOINT ""
load_env

compose pull --ignore-buildable --quiet
compose up -d --build --remove-orphans
wait_healthy fusescope
compose ps
