#!/bin/bash
# Behaviour test for infra/edge/Caddyfile, the off-Cloudflare replacement for
# cloudflare/worker.js. Runs on an ephemeral runner with a self-signed TEST
# certificate and a local stub standing in for the app; no external service
# is contacted except the Caddy release download.
set -euo pipefail
W="$RUNNER_TEMP/edge"; mkdir -p "$W"
CADDY_VERSION=2.8.4
curl -fsSL -o "$W/caddy.tgz" "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_linux_amd64.tar.gz"
tar -xzf "$W/caddy.tgz" -C "$W" caddy

# Self-signed *.runs-at.dev certificate: TEST ONLY.
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=*.runs-at.dev' \
  -addext 'subjectAltName=DNS:*.runs-at.dev' -keyout "$W/k.pem" -out "$W/c.pem" 2> /dev/null

# Stub app: echoes what it received; /_card/redirectme answers 302 like a URL
# record; always tries to set a cookie (which the edge must strip).
cat > "$W/stub.mjs" <<'EOF'
import { createServer } from 'node:http';
createServer((req, res) => {
  const headers = { 'content-type': 'text/plain', 'set-cookie': 'leak=1' };
  if (req.url.startsWith('/_card/redirectme')) {
    res.writeHead(302, { ...headers, location: 'https://example.org/target' });
    return res.end();
  }
  res.writeHead(200, headers);
  res.end(`path=${req.url}\nhost=${req.headers.host}\ncookie=${req.headers.cookie ?? ''}\nauth=${req.headers.authorization ?? ''}\n`);
}).listen(9000, '127.0.0.1');
EOF
node "$W/stub.mjs" &
STUB=$!

export EDGE_PORT=8443 TLS_CERT="$W/c.pem" TLS_KEY="$W/k.pem" APP_ORIGIN=http://127.0.0.1:9000 APP_HOST=runs-at.dev
"$W/caddy" validate --config infra/edge/Caddyfile --adapter caddyfile > /dev/null 2>&1 || { echo "FAIL: Caddyfile invalid"; "$W/caddy" validate --config infra/edge/Caddyfile --adapter caddyfile; exit 1; }
"$W/caddy" run --config infra/edge/Caddyfile --adapter caddyfile > "$W/caddy.log" 2>&1 &
CADDY=$!
trap 'kill $STUB $CADDY 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do curl -sk --resolve alice.runs-at.dev:8443:127.0.0.1 https://alice.runs-at.dev:8443/ > /dev/null 2>&1 && break; sleep 0.5; done

req() { curl -sk -o "$W/body" -D "$W/head" -w '%{http_code}' --resolve "$1.runs-at.dev:8443:127.0.0.1" "${@:3}" "https://$1.runs-at.dev:8443$2"; }
hdr() { grep -i "^$1:" "$W/head" | head -1 | cut -d' ' -f2- | tr -d '\r'; }
pass=0; fail=0
check() { if eval "$2"; then pass=$((pass + 1)); echo "ok   $1"; else fail=$((fail + 1)); echo "FAIL $1"; fi; }

code=$(req alice / -H 'Cookie: session=secret' -H 'Authorization: Bearer x')
check "GET / -> card for alice" '[ "$code" = 200 ] && grep -q "^path=/_card/alice$" "$W/body"'
check "card request sent with Host runs-at.dev" 'grep -q "^host=runs-at.dev$" "$W/body"'
check "visitor cookie not forwarded" 'grep -q "^cookie=$" "$W/body"'
check "authorization not forwarded" 'grep -q "^auth=$" "$W/body"'
check "Set-Cookie stripped from response" '[ -z "$(hdr set-cookie)" ]'

code=$(req alice '/?ref=x')
check "query kept on the card request" '[ "$code" = 200 ] && grep -q "^path=/_card/alice?ref=x$" "$W/body"'

code=$(req alice '/docs/x?y=2')
check "other path -> 307 to apex" '[ "$code" = 307 ] && [ "$(hdr location)" = "https://runs-at.dev/docs/x?y=2" ]'

code=$(req alice / -X POST)
check "POST -> 405 with Allow" '[ "$code" = 405 ] && [ "$(hdr allow)" = "GET, HEAD" ]'

code=$(req alice / -I)
check "HEAD / allowed" '[ "$code" = 200 ]'

code=$(req redirectme /)
check "URL-record redirect passed through, not followed" '[ "$code" = 302 ] && [ "$(hdr location)" = "https://example.org/target" ]'

code=$(req www /)
check "www is not a card" '[ "$code" = 404 ]'

echo "edge behaviour (stub app): $pass passed, $fail failed"

# ── against the REAL application ─────────────────────────────────────────
# Same edge, upstream = https://runs-at.dev (read-only GETs). For a real
# card-only claim and a real URL-redirect claim, the edge's status, Location
# and content type must equal what production (Cloudflare Worker) returns for
# the same name today.
kill $CADDY 2>/dev/null || true; sleep 1
export APP_ORIGIN=https://runs-at.dev APP_HOST=runs-at.dev
"$W/caddy" run --config infra/edge/Caddyfile --adapter caddyfile > "$W/caddy-live.log" 2>&1 &
CADDY=$!
trap 'kill $STUB $CADDY 2>/dev/null || true' EXIT
sleep 2
read -r CARD URLNAME < <(node -e '
  const fs=require("fs");const cs=fs.readdirSync("domains").filter(f=>f.endsWith(".json")).map(f=>JSON.parse(fs.readFileSync("domains/"+f,"utf8")));
  const card=cs.find(c=>!c.subdomains&&Object.keys(c.records||{}).length===0);
  const url=cs.find(c=>c.records&&Object.keys(c.records).length===1&&c.records.URL);
  console.log(card.name, url.name);')
for n in "$CARD" "$URLNAME"; do
  edge=$(curl -sk -o /dev/null -w '%{http_code} %{redirect_url} %{content_type}' --max-time 20 --resolve "$n.runs-at.dev:8443:127.0.0.1" "https://$n.runs-at.dev:8443/" | sed 's/;.*//')
  prod=$(curl -sk -o /dev/null -w '%{http_code} %{redirect_url} %{content_type}' --max-time 20 "https://$n.runs-at.dev/" | sed 's/;.*//')
  kind=$([ "$n" = "$CARD" ] && echo card || echo url-redirect)
  check "real app, $kind claim: edge == production ($edge)" '[ "$edge" = "$prod" ]'
  [ "$edge" = "$prod" ] || echo "     production: $prod"
done
edge=$(curl -sk -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 --resolve "$CARD.runs-at.dev:8443:127.0.0.1" "https://$CARD.runs-at.dev:8443/docs")
prod=$(curl -sk -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 20 "https://$CARD.runs-at.dev/docs")
check "real app, path redirect: edge == production ($edge)" '[ "$edge" = "$prod" ]'

echo "edge behaviour: $pass passed, $fail failed"
[ "$fail" = 0 ]
