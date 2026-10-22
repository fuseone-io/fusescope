# shellcheck shell=bash
# Helpers shared by install.sh, bootstrap.sh and update.sh. Run from the kit directory.

compose() { docker compose --profile generators "$@"; }

env_get() { sed -n "s/^$1=//p" .env | tail -n1; }

env_set() {
	if grep -q "^$1=" .env; then
		sed -i "s|^$1=.*|$1=$2|" .env
	else
		echo "$1=$2" >>.env
	fi
}

load_env() {
	set -a
	# shellcheck disable=SC1091
	. ./.env
	set +a
}

# curl inside the project network: the backend port is not published on the host.
api() { docker run --rm --network fusescope-demo curlimages/curl:8.17.0 -sS --max-time 30 "$@"; }
# Same, with the request body read from stdin.
api_in() { docker run --rm -i --network fusescope-demo curlimages/curl:8.17.0 -sS --max-time 30 --data-binary @- "$@"; }

wait_healthy() {
	local service=$1 id
	for _ in $(seq 1 90); do
		id=$(compose ps -q "$service")
		[ -n "$id" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' "$id")" = healthy ] && return 0
		sleep 5
	done
	echo "$service is not healthy" >&2
	return 1
}
