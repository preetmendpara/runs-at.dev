#!/bin/bash
# Remove the edge from ns2 and leave a DNS-only secondary, as before the edge.
#
#   SSH_KEY=~/.ssh/runs_at_oci rollback-edge-ns2.sh <ns2-ip> [--purge]
#
# Stops and disables Caddy, closes 80/443 in the host firewall, removes the
# edge cron/health jobs and the pdns priority drop-in. Certificates, the ACME
# key and packages stay unless --purge is given. PowerDNS keeps running
# throughout. Redeploy with deploy-edge-ns2.sh.
set -euo pipefail
H=${1:?ns2 address}; PURGE=${2:-}
SSH=(ssh -i "${SSH_KEY:-$HOME/.ssh/runs_at_oci}" -o ConnectTimeout=20 "ubuntu@$H")
"${SSH[@]}" "set -e
sudo systemctl disable --now caddy > /dev/null 2>&1 || true
sudo rm -f /etc/cron.d/runs-at-edge /etc/systemd/system/pdns.service.d/priority.conf
for p in 80 443; do while sudo iptables -D INPUT -p tcp --dport \$p -j ACCEPT 2> /dev/null; do :; done; done
sudo netfilter-persistent save > /dev/null
sudo systemctl daemon-reload
if [ '$PURGE' = --purge ]; then
  sudo apt-get purge -y -qq caddy lego > /dev/null
  sudo rm -rf /etc/runs-at-edge /etc/systemd/system/caddy.service.d /var/lib/lego /etc/logrotate.d/runs-at-edge
fi
echo \"caddy: \$(systemctl is-active caddy || true)  pdns: \$(systemctl is-active pdns)\"
echo \"listening 80/443: \$(sudo ss -lnt '( sport = :80 or sport = :443 )' | tail -n +2 | wc -l)\""
