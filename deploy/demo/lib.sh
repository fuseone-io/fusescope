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

# fusescope-schema keeps its history in KeeperMap tables, which ClickHouse enables only with
# keeper_map_path_prefix, read at its startup. Before the migrator runs: start ClickHouse,
# recreate it when the running server lacks the value (an install from before the setting), and
# stop when it still does.
KEEPER_MAP_PREFIX=/fusescope/keeper_map
# The value the running server loaded: system.server_settings does not list this setting, but
# the server writes the configuration it merged at startup to preprocessed_configs, and a mounted
# file reaches only a container created with it.
keeper_map_prefix() {
	compose exec -T clickhouse sh -c \
		"sed -n 's:.*<keeper_map_path_prefix>\\(.*\\)</keeper_map_path_prefix>.*:\\1:p' /var/lib/clickhouse/preprocessed_configs/config.xml"
}
ensure_keeper_map() {
	compose up -d --no-recreate clickhouse
	wait_healthy clickhouse
	if [ "$(keeper_map_prefix)" != "$KEEPER_MAP_PREFIX" ]; then
		compose up -d --no-deps --force-recreate clickhouse
		wait_healthy clickhouse
	fi
	local prefix
	prefix=$(keeper_map_prefix)
	if [ "$prefix" != "$KEEPER_MAP_PREFIX" ]; then
		echo "ClickHouse runs with keeper_map_path_prefix '$prefix', not $KEEPER_MAP_PREFIX: fusescope-schema cannot migrate" >&2
		return 1
	fi
}

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

# The collector's ingest token and TLS from a CA of the demo's own: the
# backend's OpAMP listener (fusescope:4321) and the collector's RUM listener,
# which Caddy proxies to. The collector runs as 65532.
ensure_ingest() {
	[ -s ingest/token ] && return 0
	mkdir -p ingest
	(
		umask 077
		openssl rand -hex 32 >ingest/token
		openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 3650 \
			-subj /CN=fusescope-demo-ingest-ca -keyout ingest/ca.key -out ingest/ca.crt 2>/dev/null
		for name in fusescope fusescope-collector; do
			openssl req -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -subj "/CN=$name" \
				-keyout "ingest/$name.key" -out "ingest/$name.csr" 2>/dev/null
			openssl x509 -req -in "ingest/$name.csr" -CA ingest/ca.crt -CAkey ingest/ca.key -CAcreateserial -days 3650 \
				-extfile <(printf 'subjectAltName=DNS:%s\nextendedKeyUsage=serverAuth\n' "$name") -out "ingest/$name.crt" 2>/dev/null
			rm "ingest/$name.csr"
		done
	)
	chmod 755 ingest
	chmod 644 ingest/*.crt
	chown 65532 ingest/token ingest/fusescope-collector.key
}
