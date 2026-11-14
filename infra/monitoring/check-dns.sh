#!/bin/bash
# Compare SOA serials on ns1 and ns2 and check both answer over UDP and TCP.
# Exit 0 healthy, 1 unhealthy, 2 missing tool. Needs dig (bind9-dnsutils).
#   NS1=<ip> NS2=<ip> check-dns.sh [zone]
set -uo pipefail
ZONE=${1:-runs-at.dev}
NS1=${NS1:-ns1.runs-at.dev}
NS2=${NS2:-ns2.runs-at.dev}
MAX_LAG=${MAX_LAG:-0}
command -v dig >/dev/null || { echo "check-dns: dig not installed" >&2; exit 2; }

serial() { dig +short +norecurse +time=3 +tries=2 "$@" SOA "$ZONE" | awk '{print $3}'; }

fail=0
s1=""
s2=""
for ns in "$NS1" "$NS2"; do
  for proto in notcp tcp; do
    s=$(serial "@$ns" "+$proto")
    if ! [[ $s =~ ^[0-9]+$ ]]; then
      echo "$(date -u +%FT%TZ) FAIL $ns $proto: no SOA answer"
      fail=1
      continue
    fi
    echo "$(date -u +%FT%TZ) ok   $ns $proto serial $s"
    if [ "$ns" = "$NS1" ]; then s1=$s; else s2=$s; fi
  done
done

if [ -n "$s1" ] && [ -n "$s2" ]; then
  diff=$((s1 - s2))
  [ "$diff" -lt 0 ] && diff=$((-diff))
  if [ "$diff" -gt "$MAX_LAG" ]; then
    echo "$(date -u +%FT%TZ) FAIL serial mismatch $NS1=$s1 $NS2=$s2"
    fail=1
  else
    echo "$(date -u +%FT%TZ) ok   serials match ($s1)"
  fi
fi
exit $fail
