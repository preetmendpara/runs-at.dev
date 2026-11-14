#!/bin/bash
# Isolated PowerDNS primary/secondary test, run on an ephemeral GitHub Actions
# runner by .github/workflows/powerdns-integration.yml. Nothing here touches
# Cloudflare, production DNS or real nameservers.
#
#   ns1  127.0.0.11:5300  PowerDNS, gpgsql backend (as in production), API on 127.0.0.1:8081
#   ns2  127.0.0.12:5301  PowerDNS, gsqlite3 backend, secondary of ns1 over TSIG AXFR
#
# Configs are rendered from infra/powerdns/pdns-{primary,secondary}.conf with
# only addresses, ports and paths swapped for loopback TEST values. Glue for
# ns1/ns2 inside the zone uses RFC 5737 TEST-NET addresses: test only.
#
# Steps:
#   A  empty zone (SOA, NS, glue) -> DNS_PROVIDER=powerdns scripts/sync-dns.mjs
#      creates every declared record and verifies primary AND secondary
#   B  second sync run is a no-op (idempotent)
#   C  every declared record answers on both servers over UDP and TCP
#   D  an update and its revert reach the secondary (serial and data)
# Prints only counts; exits non-zero on any failure.
set -euo pipefail
ZONE=runs-at.dev
NS1=127.0.0.11; NS1P=5300
NS2=127.0.0.12; NS2P=5301
W="$RUNNER_TEMP/pdns"
REPO="$PWD"
mkdir -p "$W/ns1/pdns.d" "$W/ns2/pdns.d"

say() { printf '%s\n' "$*"; }
fail() {
  say "FAIL: $*"
  # Server logs carry no secrets (keys are never logged); shown for diagnosis.
  for n in ns1 ns2; do say "--- $n log (tail)"; tail -n 15 "$W/$n.log" 2>/dev/null | sed "s/^/  /"; done
  say "--- dig SOA ns1"; dig @$NS1 -p $NS1P $ZONE SOA +time=2 +tries=1 2>&1 | sed "s/^/  /" || true
  say "--- dig SOA ns2"; dig @$NS2 -p $NS2P $ZONE SOA +time=2 +tries=1 2>&1 | sed "s/^/  /" || true
  exit 1
}

# ── packages ──────────────────────────────────────────────────────────────
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  pdns-server pdns-backend-pgsql pdns-backend-sqlite3 postgresql dnsutils sqlite3 > /dev/null
sudo systemctl stop pdns || true
sudo systemctl disable pdns > /dev/null 2>&1 || true
say "pdns $(pdns_server --version 2>&1 | grep -o 'PowerDNS Authoritative Server [0-9.]*' | head -1)"

# ── primary database (loopback PostgreSQL, as in setup-primary.sh) ───────
sudo systemctl start postgresql
DBPASS=$(openssl rand -hex 16)
APIKEY=$(openssl rand -hex 24)
sudo -u postgres psql -q -v ON_ERROR_STOP=1 -c "CREATE ROLE pdns LOGIN PASSWORD '$DBPASS';"
sudo -u postgres createdb -O pdns pdns
PGPASSWORD=$DBPASS psql -q -h 127.0.0.1 -U pdns -d pdns -v ON_ERROR_STOP=1 \
  -f /usr/share/pdns-backend-pgsql/schema/schema.pgsql.sql > /dev/null

# ── render configs from the production templates ─────────────────────────
render() { # template out-file sed-expr...
  local tpl=$1 out=$2; shift 2
  sed "$@" "$tpl" > "$out"
}
render infra/powerdns/pdns-primary.conf "$W/ns1/pdns.conf" \
  -e "s#^local-address=.*#local-address=$NS1#" \
  -e "s#^local-port=.*#local-port=$NS1P#" \
  -e "s#^also-notify=.*#also-notify=$NS2:$NS2P#" \
  -e "s#^only-notify=.*#only-notify=$NS2/32#" \
  -e "s#^include-dir=.*#include-dir=$W/ns1/pdns.d#"
printf 'gpgsql-password=%s\napi-key=%s\nsocket-dir=%s\n' "$DBPASS" "$APIKEY" "$W/ns1" > "$W/ns1/pdns.d/secrets.conf"
# Outgoing NOTIFY and queries from ns1's own address, as on the VCN (otherwise
# loopback traffic leaves from 127.0.0.1 and ns2's allow-notify-from drops it).
printf 'query-local-address=%s\n' "$NS1" > "$W/ns1/pdns.d/local.conf"

render infra/powerdns/pdns-secondary.conf "$W/ns2/pdns.conf" \
  -e "s#^gsqlite3-database=.*#gsqlite3-database=$W/ns2/pdns.sqlite3#" \
  -e "s#^local-address=.*#local-address=$NS2#" \
  -e "s#^local-port=.*#local-port=$NS2P#" \
  -e "s#^allow-notify-from=.*#allow-notify-from=$NS1/32#" \
  -e "s#^xfr-cycle-interval=.*#xfr-cycle-interval=5#" \
  -e "s#^include-dir=.*#include-dir=$W/ns2/pdns.d#"
printf 'socket-dir=%s\n' "$W/ns2" > "$W/ns2/pdns.d/local.conf"
sqlite3 "$W/ns2/pdns.sqlite3" < /usr/share/pdns-backend-sqlite3/schema/schema.sqlite3.sql

U1="pdnsutil --config-dir=$W/ns1"
U2="pdnsutil --config-dir=$W/ns2"

# ── start both servers ───────────────────────────────────────────────────
pdns_server --config-dir="$W/ns1" --daemon=no --guardian=no --disable-syslog > "$W/ns1.log" 2>&1 &
pdns_server --config-dir="$W/ns2" --daemon=no --guardian=no --disable-syslog > "$W/ns2.log" 2>&1 &
for _ in $(seq 1 30); do
  dig @$NS1 -p $NS1P +short +time=1 +tries=1 version.bind CH TXT > /dev/null 2>&1 && \
  dig @$NS2 -p $NS2P +short +time=1 +tries=1 version.bind CH TXT > /dev/null 2>&1 && break
  sleep 1
done

# ── step A: empty zone with system records, then the real sync path ──────
$U1 create-zone $ZONE ns1.$ZONE > /dev/null
$U1 add-record $ZONE @ NS 300 ns2.$ZONE. > /dev/null
$U1 add-record $ZONE ns1 A 300 192.0.2.1 > /dev/null   # TEST-NET glue: test only
$U1 add-record $ZONE ns2 A 300 192.0.2.2 > /dev/null   # TEST-NET glue: test only
$U1 set-meta $ZONE SOA-EDIT-API DEFAULT > /dev/null
$U1 generate-tsig-key xfr-runs-at-dev hmac-sha256 > /dev/null
$U1 set-meta $ZONE TSIG-ALLOW-AXFR xfr-runs-at-dev > /dev/null
SECRET=$($U1 list-tsig-keys | awk '$1 ~ /^xfr-runs-at-dev/ {print $3}')
$U2 import-tsig-key xfr-runs-at-dev hmac-sha256 "$SECRET" > /dev/null
unset SECRET
$U2 create-secondary-zone $ZONE "$NS1:$NS1P" > /dev/null
$U2 set-meta $ZONE AXFR-MASTER-TSIG xfr-runs-at-dev > /dev/null
# PowerDNS 4.5+ keeps a zone cache: a zone created with pdnsutil while the
# server runs is answered REFUSED until the cache is rebuilt. (Zones created
# through the HTTP API update the cache themselves.)
pdns_control --config-dir="$W/ns1" rediscover > /dev/null
pdns_control --config-dir="$W/ns2" rediscover > /dev/null
pdns_control --config-dir="$W/ns2" retrieve $ZONE > /dev/null || true
# Both must now be authoritative (NOERROR, not REFUSED) before anything else.
for s in "$NS1 $NS1P" "$NS2 $NS2P"; do
  set -- $s
  for _ in $(seq 1 20); do
    dig @"$1" -p "$2" +time=1 +tries=1 $ZONE SOA | grep -q 'status: NOERROR' && break
    sleep 1
  done
  dig @"$1" -p "$2" +time=1 +tries=1 $ZONE SOA | grep -q 'status: NOERROR' || fail "$1:$2 is not authoritative for $ZONE"
done
say "both servers authoritative: yes"

# Unsigned AXFR from ns2's address must be refused; ns1 serves AXFR only with TSIG.
if dig @$NS1 -p $NS1P -b $NS2 $ZONE AXFR +time=2 +tries=1 2>/dev/null | grep -q 'IN[[:space:]]SOA'; then
  fail "unsigned AXFR was allowed"
fi
say "unsigned AXFR refused: yes"

soa() { dig @"$1" -p "$2" +short +time=2 +tries=2 $ZONE SOA | awk '{print $3}'; }
wait_sync() { # wait until ns2 serial == ns1 serial
  local s1 s2
  for _ in $(seq 1 40); do
    s1=$(soa $NS1 $NS1P); s2=$(soa $NS2 $NS2P)
    [ -n "$s1" ] && [ "$s1" = "$s2" ] && { say "serial ns1=$s1 ns2=$s2"; return 0; }
    pdns_control --config-dir="$W/ns2" retrieve $ZONE > /dev/null 2>&1 || true
    sleep 2
  done
  fail "secondary did not catch up (ns1=$s1 ns2=$s2)"
}
wait_sync

export DNS_PROVIDER=powerdns PDNS_ZONE=$ZONE PDNS_API_URL=http://127.0.0.1:8081 PDNS_API_KEY="$APIKEY" \
  PDNS_PRIMARY_IP="$NS1:$NS1P" PDNS_SECONDARY_IPS="$NS2:$NS2P"
say "── A: initial sync through scripts/sync-dns.mjs"
node scripts/sync-dns.mjs | grep -E '^(powerdns plan|verify )' || fail "sync-dns (initial) failed"
wait_sync

say "── B: idempotent re-run"
out=$(node scripts/sync-dns.mjs) || fail "sync-dns (re-run) failed"
printf '%s\n' "$out" | grep -E '^(powerdns plan|verify )'
printf '%s\n' "$out" | grep -q '^powerdns plan: 0 create, 0 update, 0 delete' || fail "re-run was not a no-op"

say "── C: every declared record on both servers, UDP and TCP"
node infra/test/check-servers.mjs "$NS1:$NS1P" "$NS2:$NS2P" || fail "record check failed"

say "── D: update reaches the secondary, then revert"
before=$(soa $NS1 $NS1P)
probe=$(ls domains/*.json | head -1)
cp "$probe" "$W/probe.bak"
node -e '
  const fs=require("fs");const f=process.argv[1];const c=JSON.parse(fs.readFileSync(f,"utf8"));
  c.subdomains={...(c.subdomains||{}),"zz-ci-replication":{TXT:["replication-probe"]}};
  fs.writeFileSync(f,JSON.stringify(c,null,2));' "$probe"
node scripts/sync-dns.mjs | grep -E '^(powerdns plan|verify )' || fail "sync-dns (update) failed"
wait_sync
[ "$(soa $NS1 $NS1P)" != "$before" ] || fail "serial did not change on update"
name="zz-ci-replication.$(basename "$probe" .json).$ZONE"
dig @$NS2 -p $NS2P +short +tcp "$name" TXT | grep -q replication-probe || fail "update not on secondary"
say "update visible on secondary: yes"
cp "$W/probe.bak" "$probe"
node scripts/sync-dns.mjs | grep -E '^(powerdns plan|verify )' || fail "sync-dns (revert) failed"
wait_sync
[ -z "$(dig @$NS2 -p $NS2P +short "$name" TXT)" ] || fail "revert not on secondary"
say "revert visible on secondary: yes"
git checkout -- domains/ 2>/dev/null || true

say "PASS"
