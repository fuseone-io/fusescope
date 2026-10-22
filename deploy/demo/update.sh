#!/usr/bin/env bash
# Usage: ./update.sh <fusescope-version>
set -euo pipefail
cd "$(dirname "$0")"
. ./lib.sh

version=${1:?usage: ./update.sh <fusescope-version>}
docker manifest inspect "ghcr.io/fuseone-io/fusescope:$version" >/dev/null
env_set FUSESCOPE_VERSION "$version"
load_env

compose pull --ignore-buildable --quiet
compose up -d --build --remove-orphans
wait_healthy fusescope
compose ps
