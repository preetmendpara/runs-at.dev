#!/bin/bash
# Local health of the edge on ns2, logged one line a minute. Restarts Caddy
# after 3 consecutive HTTPS failures. DNS health is reported alongside so a
# problem caused by the edge is visible next to the authoritative service.
set -uo pipefail
STATE=/run/runs-at-edge-health.fails
probe() { curl -sk -o /dev/null -m 5 -w '%{http_code}' --resolve "health-probe.runs-at.dev:$1:127.0.0.1" "$2://health-probe.runs-at.dev:$1/healthz"; }
https=$(probe 443 https); http=$(probe 80 http)
dns=$(dig @127.0.0.1 +short +time=2 +tries=1 runs-at.dev SOA | awk '{print $3}')
mem=$(systemctl show caddy -p MemoryCurrent --value)
if [ "$https" = 307 ] && [ "$http" = 307 ]; then echo 0 > "$STATE"; status=ok
else
  n=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$STATE"; status="FAIL($n)"
  if [ "$n" -ge 3 ]; then systemctl restart caddy; echo 0 > "$STATE"; status="$status restarted"; fi
fi
echo "$(date -u +%FT%TZ) edge $status https=$https http=$http dns_serial=${dns:-NONE} caddy_mem=$mem"
