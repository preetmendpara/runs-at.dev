#!/bin/bash
# Copy the scoped ACME TSIG key (acme-runs-at-dev) from ns1 to the edge and
# write the edge's ACME contact address. Run from the operator's machine:
#
#   SSH_KEY=~/.ssh/runs_at_oci provision-acme-key.sh <ns1-ip> <edge-ip> <acme-email>
#
# The secret goes from ns1 over SSH stdin into /etc/runs-at-edge/acme-tsig.env
# (mode 0600, root only; Caddy cannot read it) on the edge. It never appears in a command-line
# argument, a log, a file on the operator's machine, or git. On ns1, the key
# is limited by acme-update-policy.lua to TXT at _acme-challenge.runs-at.dev.
set -euo pipefail
NS1=${1:?ns1 address}; EDGE=${2:?edge address}; EMAIL=${3:?ACME contact email}
[[ "$EMAIL" == *@*.* ]] || { echo "not an email address"; exit 1; }
SSH=(ssh -i "${SSH_KEY:-$HOME/.ssh/runs_at_oci}" -o ConnectTimeout=20)

"${SSH[@]}" "ubuntu@$NS1" "sudo pdnsutil list-tsig-keys | awk '\$1 ~ /^acme-runs-at-dev/ {print \$3}'" \
  | "${SSH[@]}" "ubuntu@$EDGE" "read -r S
      sudo install -d -m 0755 /etc/runs-at-edge
      { echo 'RFC2136_NAMESERVER=10.53.1.11:53'
        echo 'RFC2136_TSIG_KEY=acme-runs-at-dev.'
        echo 'RFC2136_TSIG_ALGORITHM=hmac-sha256.'
        printf 'RFC2136_TSIG_SECRET=%s\n' \"\$S\"; } | sudo install -m 0600 /dev/stdin /etc/runs-at-edge/acme-tsig.env
      unset S"
printf 'ACME_EMAIL=%s\n' "$EMAIL" | "${SSH[@]}" "ubuntu@$EDGE" 'sudo install -m 0600 /dev/stdin /etc/runs-at-edge/acme.env'
# systemd masks these files for Caddy only if they exist when Caddy starts.
"${SSH[@]}" "ubuntu@$EDGE" 'sudo systemctl try-restart caddy'
"${SSH[@]}" "ubuntu@$EDGE" 'sudo grep -c "^RFC2136_TSIG_SECRET=." /etc/runs-at-edge/acme-tsig.env' | grep -qx 1 \
  || { echo "edge did not receive the key"; exit 1; }
echo "ACME key and contact installed on the edge. Next: sudo /usr/local/sbin/renew-cert.sh, then systemctl enable --now caddy"
