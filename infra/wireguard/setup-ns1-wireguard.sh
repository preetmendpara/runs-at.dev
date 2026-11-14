#!/bin/bash
# Private deploy tunnel to ns1's PowerDNS API (no-cost alternative to
# Tailscale). Run from the operator's machine:
#
#   SSH_KEY=~/.ssh/runs_at_oci setup-ns1-wireguard.sh <ns1-ip> [--rotate-ci-key]
#
# - ns1 gets wg0 = 10.99.0.1/24 on UDP 51820. The server key is generated on
#   ns1 and never leaves it. WireGuard sends nothing back to a peer without a
#   valid key, so the open UDP port looks closed to everyone else.
# - The only peer is GitHub Actions (10.99.0.2). Its private key is generated
#   on ns1, piped once over SSH straight into the GitHub secret
#   WG_CI_PRIVATE_KEY (gh secret set reads stdin), then deleted from ns1.
# - The API still listens only on 127.0.0.1:8081. A systemd socket proxy
#   listens on 10.99.0.1:8081 (the tunnel address) and forwards to loopback.
#   pdns does not depend on the tunnel: if wg0 is down, DNS is unaffected.
# - The host firewall accepts 8081 only from 10.99.0.2 on wg0. The API key is
#   still required on every request.
set -euo pipefail
H=${1:?ns1 address}; ROTATE=${2:-}
SSH=(ssh -i "${SSH_KEY:-$HOME/.ssh/runs_at_oci}" -o ConnectTimeout=20 "ubuntu@$H")

"${SSH[@]}" 'set -e
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq wireguard-tools > /dev/null
sudo install -d -m 0700 /etc/wireguard
[ -s /etc/wireguard/wg0.key ] || (umask 077; wg genkey | sudo tee /etc/wireguard/wg0.key > /dev/null)
sudo tee /etc/systemd/system/pdns-api-tunnel.socket > /dev/null <<UNIT
[Unit]
Description=PowerDNS API on the WireGuard deploy tunnel only
After=wg-quick@wg0.service
BindsTo=wg-quick@wg0.service
[Socket]
ListenStream=10.99.0.1:8081
FreeBind=yes
[Install]
WantedBy=sockets.target
UNIT
sudo tee /etc/systemd/system/pdns-api-tunnel.service > /dev/null <<UNIT
[Unit]
Description=Forward the tunnel API port to the loopback-only PowerDNS API
Requires=pdns-api-tunnel.socket
After=pdns-api-tunnel.socket
[Service]
ExecStart=/usr/lib/systemd/systemd-socket-proxyd 127.0.0.1:8081
DynamicUser=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
NoNewPrivileges=yes
UNIT
for r in "-p udp --dport 51820" "-i wg0 -s 10.99.0.2 -p tcp --dport 8081"; do
  sudo iptables -C INPUT $r -j ACCEPT 2> /dev/null || sudo iptables -I INPUT 5 $r -j ACCEPT
done
sudo netfilter-persistent save > /dev/null'

if [ "$ROTATE" = --rotate-ci-key ] || ! "${SSH[@]}" 'sudo test -s /etc/wireguard/ci.pub'; then
  # CI key pair: private half goes straight from ns1 into the GitHub secret.
  "${SSH[@]}" '(umask 077; wg genkey | sudo tee /etc/wireguard/ci.tmp > /dev/null)
    sudo sh -c "wg pubkey < /etc/wireguard/ci.tmp > /etc/wireguard/ci.pub"
    sudo cat /etc/wireguard/ci.tmp' | gh secret set WG_CI_PRIVATE_KEY
  "${SSH[@]}" 'sudo shred -u /etc/wireguard/ci.tmp'
fi

"${SSH[@]}" 'set -e
sudo tee /etc/wireguard/wg0.conf > /dev/null <<CONF
[Interface]
Address = 10.99.0.1/24
ListenPort = 51820
PostUp = wg set %i private-key /etc/wireguard/wg0.key
[Peer]
# GitHub Actions deploy runner
PublicKey = $(sudo cat /etc/wireguard/ci.pub)
AllowedIPs = 10.99.0.2/32
CONF
sudo chmod 600 /etc/wireguard/wg0.conf
sudo systemctl daemon-reload
sudo systemctl enable --now wg-quick@wg0 > /dev/null 2>&1
sudo systemctl restart wg-quick@wg0
sudo systemctl enable --now pdns-api-tunnel.socket > /dev/null 2>&1
sudo systemctl restart pdns-api-tunnel.socket
echo "wg0: $(systemctl is-active wg-quick@wg0)  api socket: $(systemctl is-active pdns-api-tunnel.socket)"
sudo ss -lnt "( sport = :8081 )" | tail -n +2 | awk "{print \"listen\", \$4}"'
# Public half of the server key, for the CI config (not a secret).
gh variable set PDNS_WG_PUBLIC_KEY --body "$("${SSH[@]}" 'sudo sh -c "wg pubkey < /etc/wireguard/wg0.key"')"
gh variable set PDNS_WG_ENDPOINT --body "$H:51820"
gh variable set PDNS_API_URL --body "http://10.99.0.1:8081"
echo "GitHub: secret WG_CI_PRIVATE_KEY, variables PDNS_WG_PUBLIC_KEY, PDNS_WG_ENDPOINT, PDNS_API_URL set"
