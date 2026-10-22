#!/usr/bin/env bash
# First install, or re-run to converge. Usage: ./install.sh [fusescope-version]
set -euo pipefail
cd "$(dirname "$0")"
. ./lib.sh

umask 077
[ -f .env ] || cp .env.example .env
chmod 600 .env
[ -n "$(env_get JWT_SECRET)" ] || env_set JWT_SECRET "$(openssl rand -hex 32)"
[ -z "${1:-}" ] || env_set FUSESCOPE_VERSION "$1"
mkdir -p certs generated
chmod 700 certs
load_env

./firewall/apply.sh

compose pull --ignore-buildable --quiet
# Caddy and the generators wait until the admin exists and self sign-up is closed.
compose up -d fusescope otel-collector
wait_healthy fusescope
./bootstrap.sh

load_env
compose up -d --build --remove-orphans
compose ps
