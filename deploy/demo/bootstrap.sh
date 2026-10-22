#!/usr/bin/env bash
# Idempotent: admin, demo viewer, 3-day retention and the RUM sample application.
# Passwords live only in credentials.txt (mode 600) next to this script.
set -euo pipefail
cd "$(dirname "$0")"
. ./lib.sh
load_env

base=http://fusescope:8080
creds=credentials.txt
umask 077

password() { echo "$(openssl rand -base64 24 | tr -d '/+=')Aa1-"; }
cred_get() { [ -f "$creds" ] && sed -n "s/^$1=//p" "$creds" | tail -n1; }

admin_password=$(cred_get ADMIN_PASSWORD || true)
demo_password=$(cred_get DEMO_PASSWORD || true)
if [ -z "$admin_password" ] || [ -z "$demo_password" ]; then
	admin_password=${admin_password:-$(password)}
	demo_password=${demo_password:-$(password)}
	cat >"$creds" <<EOF
URL=$FUSESCOPE_URL
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$admin_password
DEMO_EMAIL=$DEMO_EMAIL
DEMO_PASSWORD=$demo_password
EOF
fi
chmod 600 "$creds"

jq -n --arg e "$ADMIN_EMAIL" --arg p "$admin_password" \
	'{name: "Admin", email: $e, password: $p, orgDisplayName: "FuseScope Demo", orgName: "fusescope-demo"}' |
	api_in -o /dev/null -w 'register: %{http_code}\n' -H 'content-type: application/json' "$base/api/v1/register"

org_id=$(api "$base/api/v2/sessions/context?email=$ADMIN_EMAIL&ref=$FUSESCOPE_URL" | jq -r '.data.orgs[0].id')
token=$(jq -n --arg e "$ADMIN_EMAIL" --arg p "$admin_password" --arg o "$org_id" '{email: $e, password: $p, orgId: $o}' |
	api_in -H 'content-type: application/json' "$base/api/v2/sessions/email_password" | jq -r '.data.accessToken')
[ -n "$token" ] && [ "$token" != null ] || { echo "admin login failed" >&2; exit 1; }
auth=(-H "Authorization: Bearer $token" -H 'content-type: application/json')

for signal in traces metrics; do
	api -o /dev/null -w "ttl $signal: %{http_code}\n" -X POST "${auth[@]}" "$base/api/v1/settings/ttl?type=$signal&duration=72h"
done
api -o /dev/null -w 'ttl logs: %{http_code}\n' "${auth[@]}" --data '{"type":"logs","defaultTTLDays":3,"ttlConditions":[]}' "$base/api/v2/settings/ttl"

if ! api "${auth[@]}" "$base/api/v2/users" | jq -e --arg e "$DEMO_EMAIL" '.data[] | select(.email == $e)' >/dev/null; then
	viewer_role=$(api "${auth[@]}" "$base/api/v1/roles" | jq -r '.data[] | select(.name | test("viewer"; "i")) | .id' | head -n1)
	user_id=$(jq -n --arg e "$DEMO_EMAIL" --arg r "$viewer_role" '{email: $e, displayName: "Demo", userRoles: [{id: $r}]}' |
		api_in "${auth[@]}" "$base/api/v2/users" | jq -r '.data.id')
	reset=$(api -X PUT "${auth[@]}" "$base/api/v2/users/$user_id/reset_password_tokens" | jq -r '.data.token')
	jq -n --arg p "$demo_password" --arg t "$reset" '{password: $p, token: $t}' |
		api_in -o /dev/null -w 'demo user: %{http_code}\n' -H 'content-type: application/json' "$base/api/v2/factor_password/reset"
fi

if [ -z "${RUM_APPLICATION_ID:-}" ]; then
	created=$(api "${auth[@]}" --data '{"name":"demo-shop-web","platform":"web","environment":"demo","allowedOrigins":["http://rum-sample:3000"],"tracePropagationUrls":[],"sampleRate":1,"piiPolicy":{"dropQuery":true}}' \
		"$base/api/v1/rum/applications")
	env_set RUM_APPLICATION_ID "$(jq -r '.data.id' <<<"$created")"
	env_set RUM_PUBLIC_KEY "$(jq -r '.data.key.key' <<<"$created")"
	echo "rum application: created"
fi
