#!/bin/bash
# First-boot setup for ns2. Idempotent. The TSIG secret does not exist here at
# boot: import it from ns1 (infra/README.md step 3), then run this again.
set -euo pipefail
DB=/var/lib/powerdns/pdns.sqlite3
if [ ! -f "$DB" ]; then
  sqlite3 "$DB" < /usr/share/pdns-backend-sqlite3/schema/schema.sqlite3.sql
  chown pdns:pdns "$DB"
  chmod 0640 "$DB"
fi
systemctl daemon-reload
systemctl enable pdns
systemctl restart pdns

pdnsutil list-autoprimaries 2>/dev/null | grep -q 10.53.1.11 || pdnsutil add-autoprimary 10.53.1.11 ns1.runs-at.dev ns1
if pdnsutil list-tsig-keys | grep -q '^xfr-runs-at-dev\.'; then
  pdnsutil list-all-zones | grep -qx runs-at.dev || pdnsutil create-secondary-zone runs-at.dev 10.53.1.11
  pdnsutil set-meta runs-at.dev AXFR-MASTER-TSIG xfr-runs-at-dev
  pdns_control retrieve runs-at.dev || true
else
  echo "setup-secondary: TSIG key xfr-runs-at-dev not imported yet; zone not created" >&2
fi
