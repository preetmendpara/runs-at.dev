#!/bin/bash
# Deploy (or redeploy) the wildcard edge onto ns2 from the operator's machine.
#
#   SSH_KEY=~/.ssh/runs_at_oci deploy-edge-ns2.sh <ns2-ip>
#
# Installs Caddy and lego from Ubuntu (so unattended-upgrades patches them),
# the Caddyfile, the hardening/resource drop-in, the pdns priority drop-in,
# health checks, cron and log rotation, and opens 80/443 in the host
# firewall. Until renew-cert.sh has issued the real wildcard certificate, it
# installs a self-signed TEST certificate so the edge can be exercised.
# Idempotent. Undo with rollback-edge-ns2.sh.
set -euo pipefail
H=${1:?ns2 address}
here=$(cd "$(dirname "$0")" && pwd)
SSH=(ssh -i "${SSH_KEY:-$HOME/.ssh/runs_at_oci}" -o ConnectTimeout=20 "ubuntu@$H")
put() { "${SSH[@]}" "sudo install -D -m $2 /dev/stdin $3" < "$1"; }

"${SSH[@]}" 'sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq caddy lego > /dev/null'
put "$here/Caddyfile"                     0644 /etc/caddy/Caddyfile
put "$here/caddy-override.conf"           0644 /etc/systemd/system/caddy.service.d/runs-at-edge.conf
put "$here/../powerdns/pdns-priority.conf" 0644 /etc/systemd/system/pdns.service.d/priority.conf
put "$here/renew-cert.sh"                 0750 /usr/local/sbin/renew-cert.sh
put "$here/edge-health.sh"                0750 /usr/local/sbin/edge-health.sh
put "$here/edge-cron"                     0644 /etc/cron.d/runs-at-edge
put "$here/logrotate-edge"                0644 /etc/logrotate.d/runs-at-edge

"${SSH[@]}" 'set -e
sudo install -d -m 0755 /etc/runs-at-edge
sudo install -d -m 0750 -g caddy /etc/runs-at-edge/tls
if [ ! -s /etc/runs-at-edge/tls/wildcard.crt ]; then
  # TEST ONLY: replaced by the first renew-cert.sh run.
  sudo openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 30 \
    -subj "/CN=TEST *.runs-at.dev" -addext "subjectAltName=DNS:*.runs-at.dev" \
    -keyout /etc/runs-at-edge/tls/wildcard.key -out /etc/runs-at-edge/tls/wildcard.crt 2> /dev/null
  sudo chgrp caddy /etc/runs-at-edge/tls/wildcard.key && sudo chmod 0640 /etc/runs-at-edge/tls/wildcard.key
fi
for p in 80 443; do sudo iptables -C INPUT -p tcp --dport $p -j ACCEPT 2> /dev/null || sudo iptables -I INPUT 5 -p tcp --dport $p -j ACCEPT; done
sudo netfilter-persistent save > /dev/null
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile > /dev/null 2>&1 || { sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; exit 1; }
sudo systemctl daemon-reload
sudo systemctl restart pdns
sudo systemctl enable --now caddy > /dev/null 2>&1
sudo systemctl restart caddy
sleep 2
systemctl is-active caddy pdns
sudo /usr/local/sbin/edge-health.sh'
