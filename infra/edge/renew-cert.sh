#!/bin/bash
# Obtain or renew the *.runs-at.dev wildcard certificate for infra/edge/Caddyfile
# with an ACME DNS-01 challenge written straight into our own PowerDNS (lego's
# "pdns" provider, through the primary's loopback-only API). Runs on ns1 from
# cron; ns2's edge receives the files over the VCN (EDGE_PEER, optional).
#
# Needs on ns1: lego (https://go-acme.github.io/lego/), caddy, and
# /etc/powerdns/pdns.d/secrets.conf (written by setup-primary.sh).
# ACME_EMAIL is the Let's Encrypt account contact: a REAL value the operator
# must provide; there is no default.
set -euo pipefail
umask 077
: "${ACME_EMAIL:?set ACME_EMAIL to the operator contact address}"
DIR=/etc/runs-at-edge
LEGO_DIR=/var/lib/lego
mkdir -p "$DIR" "$LEGO_DIR"

PDNS_API_KEY=$(sed -n 's/^api-key=//p' /etc/powerdns/pdns.d/secrets.conf)
export PDNS_API_URL=http://127.0.0.1:8081 PDNS_API_KEY
export PDNS_PROPAGATION_TIMEOUT=300 PDNS_POLLING_INTERVAL=10

args=(--accept-tos --path "$LEGO_DIR" --email "$ACME_EMAIL" --dns pdns --domains '*.runs-at.dev')
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
