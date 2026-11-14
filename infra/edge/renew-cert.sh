#!/bin/bash
# Obtain or renew the *.runs-at.dev wildcard certificate for infra/edge/Caddyfile
# with an ACME DNS-01 challenge, written to ns1 as an RFC 2136 dynamic update
# (lego's "rfc2136" provider) signed with the acme-runs-at-dev TSIG key. ns1's
# acme-update-policy.lua lets that key change only TXT at
# _acme-challenge.runs-at.dev, so the edge never holds the PowerDNS API key.
# Runs on the edge host from cron.
#
# Needs on the edge: lego (https://go-acme.github.io/lego/), caddy, and
# /etc/runs-at-edge/acme-tsig.env with RFC2136_NAMESERVER (ns1's private
# address:53), RFC2136_TSIG_KEY=acme-runs-at-dev., RFC2136_TSIG_SECRET and
# RFC2136_TSIG_ALGORITHM=hmac-sha256. (mode 0600, copied from ns1.)
# ACME_EMAIL is the Let's Encrypt account contact: a REAL value the operator
# must provide; there is no default.
set -euo pipefail
umask 077
: "${ACME_EMAIL:?set ACME_EMAIL to the operator contact address}"
DIR=/etc/runs-at-edge
LEGO_DIR=/var/lib/lego
mkdir -p "$DIR" "$LEGO_DIR"

set -a
. "$DIR/acme-tsig.env"
set +a
export RFC2136_PROPAGATION_TIMEOUT=300 RFC2136_POLLING_INTERVAL=10

args=(--accept-tos --path "$LEGO_DIR" --email "$ACME_EMAIL" --dns rfc2136 --domains '*.runs-at.dev')
if [ -f "$LEGO_DIR/certificates/_.runs-at.dev.crt" ]; then
  lego "${args[@]}" renew --days 30
else
  lego "${args[@]}" run
fi

install -m 0644 "$LEGO_DIR/certificates/_.runs-at.dev.crt" "$DIR/wildcard.crt"
install -m 0640 -g caddy "$LEGO_DIR/certificates/_.runs-at.dev.key" "$DIR/wildcard.key"
systemctl reload caddy

# Optional: copy to the second edge (ns2) over the private network.
if [ -n "${EDGE_PEER:-}" ]; then
  scp -q "$DIR/wildcard.crt" "$DIR/wildcard.key" "$EDGE_PEER:$DIR/"
  ssh "$EDGE_PEER" 'chgrp caddy /etc/runs-at-edge/wildcard.key && systemctl reload caddy'
fi
