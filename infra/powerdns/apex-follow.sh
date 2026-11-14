#!/bin/bash
# Keep the apex A records equal to what the Vercel target resolves to.
# Cloudflare served the apex as a flattened CNAME. PowerDNS ALIAS records are
# not signed under live DNSSEC signing, so the signed zone holds real A
# records and this job (ns1, every 5 minutes) follows the target:
#   /etc/powerdns/apex-target  the Vercel hostname (same target as www)
# It changes the zone only when the address set differs, and never empties
# the apex: if the target does not resolve, it leaves the records alone.
set -euo pipefail
ZONE=runs-at.dev
TARGET=$(tr -d ' \n' < /etc/powerdns/apex-target)
want=$(dig @169.254.169.254 +short +time=3 +tries=2 "$TARGET" A | grep -E '^[0-9]+(\.[0-9]+){3}$' | sort -u || true)
[ -n "$want" ] || { echo "$(date -u +%FT%TZ) apex-follow: $TARGET did not resolve; apex unchanged"; exit 0; }
have=$(pdnsutil list-zone "$ZONE" 2> /dev/null | awk -v z="$ZONE." '$1 == z && $4 == "A" {print $5}' | sort -u)
[ "$want" = "$have" ] && exit 0
# shellcheck disable=SC2086 # one address per argument
pdnsutil replace-rrset "$ZONE" @ A 300 $want > /dev/null
pdnsutil increase-serial "$ZONE" > /dev/null
pdns_control purge "$ZONE\$" > /dev/null
pdns_control notify "$ZONE" > /dev/null
echo "$(date -u +%FT%TZ) apex-follow: apex A $(echo $have) -> $(echo $want)"
