#!/bin/bash
# Rotate the ns1 -> ns2 zone-transfer TSIG key (xfr-runs-at-dev) from the
# operator's machine. Also use it for first-time setup of ns2.
#
#   SSH_KEY=~/.ssh/runs_at_oci rotate-xfr-tsig.sh <ns1-ip> <ns2-ip>
#
# The new secret is generated on ns1 and travels over SSH stdin straight into
# ns2's SQLite database. It never appears in a command-line argument (on
# either host or here), a log, a file on the operator's machine, or git. The
# old secret is overwritten on both servers, so it stops working at once.
set -euo pipefail
NS1=${1:?ns1 address}; NS2=${2:?ns2 address}
SSH=(ssh -i "${SSH_KEY:-$HOME/.ssh/runs_at_oci}" -o ConnectTimeout=20)
DB=/var/lib/powerdns/pdns.sqlite3

"${SSH[@]}" "ubuntu@$NS1" 'sudo pdnsutil delete-tsig-key xfr-runs-at-dev > /dev/null 2>&1 || true
  sudo pdnsutil generate-tsig-key xfr-runs-at-dev hmac-sha256 > /dev/null'

# ns1 prints the secret only into this pipe; ns2 reads it with the shell's
# read builtin and hands it to sqlite3 on stdin.
"${SSH[@]}" "ubuntu@$NS1" "sudo pdnsutil list-tsig-keys | awk '\$1 ~ /^xfr-runs-at-dev/ {print \$3}'" \
  | "${SSH[@]}" "ubuntu@$NS2" "read -r S
      { printf \"DELETE FROM tsigkeys WHERE name LIKE 'xfr-runs-at-dev%%';\\n\"
        printf \"INSERT INTO tsigkeys (name, algorithm, secret) VALUES ('xfr-runs-at-dev', 'hmac-sha256', '%s');\\n\" \"\$S\"; } \
        | sudo sqlite3 $DB
      unset S"

# Prove it: both sides hold the same secret (compared by hash only), a fresh
# serial transfers, and a wrong key is refused.
h1=$("${SSH[@]}" "ubuntu@$NS1" "sudo pdnsutil list-tsig-keys | awk '\$1 ~ /^xfr-runs-at-dev/ {print \$3}' | sha256sum | cut -c1-16")
h2=$("${SSH[@]}" "ubuntu@$NS2" "sudo sqlite3 $DB \"SELECT secret FROM tsigkeys WHERE name LIKE 'xfr-runs-at-dev%';\" | sha256sum | cut -c1-16")
[ "$h1" = "$h2" ] || { echo "secret mismatch between ns1 and ns2"; exit 1; }
"${SSH[@]}" "ubuntu@$NS1" 'sudo pdnsutil increase-serial runs-at.dev > /dev/null; sudo pdns_control purge > /dev/null; sudo pdns_control notify runs-at.dev > /dev/null'
"${SSH[@]}" "ubuntu@$NS2" 'sudo pdns_control purge > /dev/null; sudo pdns_control retrieve runs-at.dev > /dev/null'
sleep 10
s1=$("${SSH[@]}" "ubuntu@$NS1" "dig @127.0.0.1 +short runs-at.dev SOA | cut -d' ' -f3")
s2=$("${SSH[@]}" "ubuntu@$NS2" "dig @127.0.0.1 +short runs-at.dev SOA | cut -d' ' -f3")
[ "$s1" = "$s2" ] || { echo "ns2 did not transfer serial $s1 (has $s2)"; exit 1; }
bad=$("${SSH[@]}" "ubuntu@$NS2" 'f=$(mktemp); printf "key \"xfr-runs-at-dev\" { algorithm hmac-sha256; secret \"%s\"; };\n" "$(head -c 32 /dev/urandom | base64)" > "$f"
  dig @10.53.1.11 -k "$f" runs-at.dev AXFR | grep -cE "IN[[:space:]]+SOA" || true; rm -f "$f"')
[ "$bad" = 0 ] || { echo "a wrong key was accepted"; exit 1; }
echo "rotated: secret hash $h1 on both, serial $s1 transferred, wrong key refused"
