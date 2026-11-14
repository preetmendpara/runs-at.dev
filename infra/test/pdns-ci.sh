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
#   E  RFC 2136 (ACME DNS-01) is limited to TXT at _acme-challenge with the
#      acme TSIG key: allowed there, refused everywhere else and unsigned
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
  -e "s#^lua-dnsupdate-policy-script=.*#lua-dnsupdate-policy-script=$W/ns1/acme-update-policy.lua#" \
  -e "s#^resolver=.*#resolver=127.0.0.53#" \
  -e "s#^include-dir=.*#include-dir=$W/ns1/pdns.d#"
cp infra/powerdns/acme-update-policy.lua "$W/ns1/acme-update-policy.lua"
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
  -e "s#^resolver=.*#resolver=127.0.0.53#" \
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

say "── E: ACME DNS-01 updates are scoped to _acme-challenge TXT"
$U1 generate-tsig-key acme-runs-at-dev hmac-sha256 > /dev/null
ACME=$($U1 list-tsig-keys | awk '$1 ~ /^acme-runs-at-dev/ {print $3}')
$U1 generate-tsig-key other-key hmac-sha256 > /dev/null
OTHER=$($U1 list-tsig-keys | awk '$1 ~ /^other-key/ {print $3}')
upd() { # key-spec|none  name  type  value  -> prints NOERROR/REFUSED/...
  local keyopt=()
  [ "$1" != none ] && keyopt=(-y "$1")
  printf 'server %s %s
zone %s
update add %s 60 %s %s
send
' "$NS1" "$NS1P" "$ZONE" "$2" "$3" "$4" > "$W/upd.txt"
  # nsupdate is silent and exits 0 only when the server answered NOERROR.
  local out
  if out=$(nsupdate "${keyopt[@]}" "$W/upd.txt" 2>&1); then echo NOERROR
  else grep -oE 'REFUSED|NOTAUTH|SERVFAIL|NOTZONE|FORMERR' <<< "$out" | head -1 || echo "error"; fi
}
expect() { # description wanted got
  if [ "$3" = "$2" ] || { [ "$2" = refused ] && [ "$3" = REFUSED ]; }; then
    say "ok   $1 ($3)"
  else
    fail "$1: wanted $2, got ${3:-no answer}"
  fi
}
expect "acme key, TXT _acme-challenge" NOERROR "$(upd "hmac-sha256:acme-runs-at-dev:$ACME" _acme-challenge.$ZONE. TXT '"token-1"')"
# PowerDNS 4.8 skips a record its policy rejects ("Not permitted by policy")
# and may still answer NOERROR for the packet, so a refusal is proven by the
# record being absent afterwards, not by the rcode alone.
deny() { # description key-spec name type value
  local rc; rc=$(upd "$2" "$3" "$4" "$5")
  if [ -n "$(dig @$NS1 -p $NS1P +short +tcp "$3" "$4" | grep -xF -- "$5")" ]; then
    fail "$1: update was applied (rcode $rc)"
  fi
  say "ok   $1 (rcode $rc, not applied)"
}
deny "acme key, TXT on a claim name" "hmac-sha256:acme-runs-at-dev:$ACME" abdulloh.$ZONE. TXT '"deny-1"'
deny "acme key, A at _acme-challenge" "hmac-sha256:acme-runs-at-dev:$ACME" _acme-challenge.$ZONE. A 192.0.2.9
deny "acme key, apex TXT" "hmac-sha256:acme-runs-at-dev:$ACME" $ZONE. TXT '"deny-3"'
deny "other key, TXT _acme-challenge" "hmac-sha256:other-key:$OTHER" _acme-challenge.$ZONE. TXT '"deny-4"'
deny "unsigned, TXT _acme-challenge" none _acme-challenge.$ZONE. TXT '"deny-5"'
unset ACME OTHER
pdns_control --config-dir="$W/ns1" notify $ZONE > /dev/null 2>&1 || true
wait_sync
dig @$NS2 -p $NS2P +short +tcp _acme-challenge.$ZONE TXT | grep -q token-1 || fail "ACME TXT not on secondary"
say "ACME TXT on secondary: yes"
out=$(node scripts/sync-dns.mjs) || fail "sync-dns after ACME update failed"
printf '%s
' "$out" | grep -q '^powerdns plan: 0 create, 0 update, 0 delete' || fail "sync-dns wanted to touch the ACME record"
say "sync-dns leaves _acme-challenge alone: yes"

say "── F: apex ALIAS is expanded by both servers"
$U1 add-record $ZONE @ ALIAS 300 example.com. > /dev/null
$U1 increase-serial $ZONE > /dev/null   # pdnsutil edits do not bump the serial
pdns_control --config-dir="$W/ns1" notify $ZONE > /dev/null 2>&1 || true
wait_sync
# Earlier steps cached "no apex A"; drop the packet/query caches first.
for n in ns1 ns2; do pdns_control --config-dir="$W/$n" purge > /dev/null; done
for s in "$NS1 $NS1P" "$NS2 $NS2P"; do
  set -- $s
  a=""
  for _ in 1 2 3 4 5; do
    a=$(dig @$1 -p $2 +short +tcp $ZONE A | head -1)
    [ -n "$a" ] && break; sleep 1
  done
  [[ "$a" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "ALIAS not expanded on $1 (got '$a')"
  say "ALIAS on $1: A answer ok"
done

say "── G: DNSSEC signed on ns1, served presigned by ns2, validates"
$U1 secure-zone $ZONE > /dev/null
$U1 rectify-zone $ZONE > /dev/null
$U1 increase-serial $ZONE > /dev/null
pdns_control --config-dir="$W/ns1" rediscover > /dev/null
$U2 set-presigned $ZONE > /dev/null
pdns_control --config-dir="$W/ns2" rediscover > /dev/null
pdns_control --config-dir="$W/ns1" notify $ZONE > /dev/null 2>&1 || true
wait_sync
$U1 export-zone-ds $ZONE | grep -q " DS 13 2 " || fail "no SHA-256 DS for ECDSAP256SHA256"
say "DS (alg 13, digest 2) generated: yes"
dig @$NS1 -p $NS1P +dnssec +norec $ZONE DNSKEY | grep -E "IN\s+DNSKEY" | grep -E "^\S+\s+\S+\s+IN\s+DNSKEY\s+257 " | sed -E 's/^\S+\s+\S+\s+IN\s+DNSKEY\s+/. IN DNSKEY /' > /dev/null
for s in "$NS1 $NS1P" "$NS2 $NS2P"; do
  set -- $s
  n=$(dig @$1 -p $2 +dnssec +norec +tcp abdulloh.$ZONE CNAME | grep -c "RRSIG")
  [ "$n" -ge 1 ] || fail "no RRSIG for a claim record on $1"
  say "RRSIG served by $1: yes"
done
# Full validation with the new KSK as the trust anchor (as a DS at the parent would make it).
ksk=$(dig @$NS1 -p $NS1P +short $ZONE DNSKEY | awk '$1 == 257')
printf 'trust-anchors {
  %s. static-key %s %s %s "%s";
};
' $ZONE $(echo "$ksk" | awk '{print $1, $2, $3}') "$(echo "$ksk" | cut -d' ' -f4- | tr -d ' ')" > "$W/anchor.conf"
for s in "$NS1 $NS1P" "$NS2 $NS2P"; do
  set -- $s
  delv @$1 -p $2 -a "$W/anchor.conf" +root=$ZONE abdulloh.$ZONE CNAME 2>&1 | grep -q "; fully validated" || { delv @$1 -p $2 -a "$W/anchor.conf" +root=$ZONE abdulloh.$ZONE CNAME 2>&1 | head -5; fail "DNSSEC validation failed on $1"; }
  say "DNSSEC fully validated against $1: yes"
done

say "PASS"
