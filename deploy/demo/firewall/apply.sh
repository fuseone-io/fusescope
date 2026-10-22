#!/usr/bin/env bash
# Lets only Cloudflare reach the Caddy port. Uses its own nftables table, hooked
# before Docker's DNAT, so it leaves Docker's and every other rule untouched.
set -euo pipefail

cd "$(dirname "$0")/.."
port="${CADDY_PORT:-8443}"
iface="${WAN_IFACE:-$(ip -o route get 1.1.1.1 | awk '{for (i = 1; i < NF; i++) if ($i == "dev") print $(i + 1)}')}"
out=generated
mkdir -p "$out"

fetch() {
	local list
	list=$(curl -fsS --max-time 20 "https://www.cloudflare.com/$1") || return 1
	grep -Eq '^[0-9a-f:.]+/[0-9]+$' <<<"$list" || return 1
	tr '\n' ' ' <<<"$list"
}

v4=$(fetch ips-v4) || { echo "could not fetch Cloudflare IPv4 ranges" >&2; exit 1; }
v6=$(fetch ips-v6) || { echo "could not fetch Cloudflare IPv6 ranges" >&2; exit 1; }

cat >"$out/cloudflare.nft" <<EOF
table inet fusescope_demo
delete table inet fusescope_demo
table inet fusescope_demo {
	set cloudflare_v4 {
		type ipv4_addr
		flags interval
		elements = { $(sed 's/ $//; s/ /, /g' <<<"$v4") }
	}
	set cloudflare_v6 {
		type ipv6_addr
		flags interval
		elements = { $(sed 's/ $//; s/ /, /g' <<<"$v6") }
	}
	chain prerouting {
		type filter hook prerouting priority -150; policy accept;
		iifname "$iface" tcp dport $port ip saddr @cloudflare_v4 accept
		iifname "$iface" tcp dport $port ip6 saddr @cloudflare_v6 accept
		iifname "$iface" tcp dport $port drop
	}
}
EOF
echo "trusted_proxies static $v4$v6" >"$out/cloudflare-ips.caddy"

nft -c -f "$out/cloudflare.nft"
nft -f "$out/cloudflare.nft"

unit=/etc/systemd/system/fusescope-demo-firewall.service
sed "s#@NFT_FILE@#$PWD/$out/cloudflare.nft#" firewall/fusescope-demo-firewall.service >"$unit"
systemctl daemon-reload
systemctl enable fusescope-demo-firewall.service >/dev/null
echo "port $port on $iface: Cloudflare only"
