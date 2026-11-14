#!/bin/bash
# Compare the deployed edge with production (Cloudflare Worker) for real
# names, from any machine outside Oracle. Read-only GET/HEAD/POST requests.
#
#   bash infra/test/edge-live.sh <edge-ip> [--insecure]
#
# --insecure while the edge still has its self-signed TEST certificate.
set -uo pipefail
E=${1:?edge ip}; K=(); [ "${2:-}" = --insecure ] && K=(-k)
read -r CARD URLN < <(node -e '
  const fs=require("fs");const cs=fs.readdirSync("domains").filter(f=>f.endsWith(".json")).map(f=>JSON.parse(fs.readFileSync("domains/"+f,"utf8")));
  console.log(cs.find(c=>!c.subdomains&&Object.keys(c.records||{}).length===0).name, cs.find(c=>c.records&&Object.keys(c.records).length===1&&c.records.URL).name)')
pass=0; fail=0
cmp_() { # label edge-output prod-output
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "ok   $1 ($2)"; else fail=$((fail+1)); echo "FAIL $1: edge [$2] production [$3]"; fi; }
w='%{http_code} %{redirect_url} %{content_type}'
edge() { local s=$1 n=$2 p=$3; shift 3; local port=443; [ "$s" = http ] && port=80
  curl -s "${K[@]}" -o /dev/null -m 20 -w "$w" --resolve "$n.runs-at.dev:$port:$E" "$@" "$s://$n.runs-at.dev$p" | sed 's/;.*//'; }
prod() { local s=$1 n=$2 p=$3; shift 3; curl -s -o /dev/null -m 20 -w "$w" "$@" "$s://$n.runs-at.dev$p" | sed 's/;.*//'; }

for s in https http; do
  cmp_ "$s card-only claim"            "$(edge $s "$CARD" /)"            "$(prod $s "$CARD" /)"
  cmp_ "$s URL claim redirect"         "$(edge $s "$URLN" /)"            "$(prod $s "$URLN" /)"
  cmp_ "$s path -> apex redirect"      "$(edge $s "$CARD" '/docs?x=1')"  "$(prod $s "$CARD" '/docs?x=1')"
  cmp_ "$s query kept on card"         "$(edge $s "$CARD" '/?ref=t')"    "$(prod $s "$CARD" '/?ref=t')"
  cmp_ "$s HEAD card"                  "$(edge $s "$CARD" / -I)"         "$(prod $s "$CARD" / -I)"
  cmp_ "$s POST -> 405"                "$(edge $s "$CARD" / -X POST | cut -d' ' -f1)" "$(prod $s "$CARD" / -X POST | cut -d' ' -f1)"
done
# Body of a card is the same page (compare the <title>).
t() { grep -o '<title>[^<]*</title>' | head -1; }
cmp_ "card body title" "$(curl -s "${K[@]}" -m 20 --resolve "$CARD.runs-at.dev:443:$E" "https://$CARD.runs-at.dev/" | t)" "$(curl -s -m 20 "https://$CARD.runs-at.dev/" | t)"
# Edge-specific guarantees.
sc=$(curl -s "${K[@]}" -D - -o /dev/null -m 20 --resolve "$CARD.runs-at.dev:443:$E" -H 'Cookie: session=secret' -H 'Authorization: Bearer x' "https://$CARD.runs-at.dev/" | grep -ci '^set-cookie:' || true)
cmp_ "no Set-Cookie from edge" "$sc" "0"
allow=$(curl -s "${K[@]}" -D - -o /dev/null -m 20 --resolve "$CARD.runs-at.dev:443:$E" -X POST "https://$CARD.runs-at.dev/" | grep -i '^allow:' | tr -d '\r' | cut -d' ' -f2-)
cmp_ "405 carries Allow" "$allow" "GET, HEAD"
cmp_ "www not a card"        "$(edge https www /)"          "404  text/plain"
cmp_ "multi-label not a card (http; a *.runs-at.dev certificate cannot cover a.b)" "$(edge http a.b /)" "404  text/plain"
echo "edge live: $pass passed, $fail failed"
[ "$fail" = 0 ]
