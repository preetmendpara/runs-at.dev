#!/bin/bash
# Bring up the WireGuard deploy tunnel to ns1 (infra/wireguard) on a GitHub
# runner. Needs WG_CI_PRIVATE_KEY (secret), PDNS_WG_PUBLIC_KEY and
# PDNS_WG_ENDPOINT (variables). The private key is written to a root-only
# file and never echoed.
set -euo pipefail
: "${WG_CI_PRIVATE_KEY:?}" "${PDNS_WG_PUBLIC_KEY:?}" "${PDNS_WG_ENDPOINT:?}"
sudo apt-get install -y -qq wireguard-tools > /dev/null
sudo install -d -m 0700 /etc/wireguard
printf '%s' "$WG_CI_PRIVATE_KEY" | sudo install -m 0600 /dev/stdin /etc/wireguard/ci.key
sudo tee /etc/wireguard/wg0.conf > /dev/null <<CONF
[Interface]
Address = 10.99.0.2/32
PostUp = wg set %i private-key /etc/wireguard/ci.key
[Peer]
PublicKey = $PDNS_WG_PUBLIC_KEY
Endpoint = $PDNS_WG_ENDPOINT
AllowedIPs = 10.99.0.1/32
PersistentKeepalive = 15
CONF
sudo chmod 600 /etc/wireguard/wg0.conf
sudo wg-quick up wg0 > /dev/null 2>&1
for _ in $(seq 1 20); do
  curl -s -o /dev/null -m 3 http://10.99.0.1:8081/ && { echo "tunnel to ns1 up"; exit 0; }
  sleep 1
done
echo "tunnel to ns1 did not come up"; exit 1
