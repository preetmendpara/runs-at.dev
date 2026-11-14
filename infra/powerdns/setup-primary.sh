#!/bin/bash
# First-boot setup for ns1. Idempotent. Generates every secret on the host;
# none is ever written to the repo or to cloud-init user data.
set -euo pipefail
umask 077
SECRETS=/etc/powerdns/pdns.d/secrets.conf

# PostgreSQL: loopback only.
PGCONF=$(ls -d /etc/postgresql/*/main | head -1)
sed -i "s/^#\?listen_addresses.*/listen_addresses = 'localhost'/" "$PGCONF/postgresql.conf"
systemctl restart postgresql

if [ ! -f "$SECRETS" ]; then
  DBPASS=$(openssl rand -hex 24)
  APIKEY=$(openssl rand -hex 32)
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE pdns LOGIN PASSWORD '$DBPASS';"
  sudo -u postgres createdb -O pdns pdns
  PGPASSWORD=$DBPASS psql -h 127.0.0.1 -U pdns -d pdns -v ON_ERROR_STOP=1 \
    -f /usr/share/pdns-backend-pgsql/schema/schema.pgsql.sql
  printf 'gpgsql-password=%s\napi-key=%s\n' "$DBPASS" "$APIKEY" > "$SECRETS"
  chown root:pdns "$SECRETS"
  chmod 0640 "$SECRETS"
  # For pg_dump in pdns-backup.sh.
  printf '127.0.0.1:5432:pdns:pdns:%s\n' "$DBPASS" > /root/.pgpass
  chmod 0600 /root/.pgpass
fi

systemctl daemon-reload
systemctl enable pdns
systemctl restart pdns

# TSIG key for transfers to ns2; copied to ns2 by hand (infra/README.md).
pdnsutil list-tsig-keys | grep -q '^xfr-runs-at-dev\.' || pdnsutil generate-tsig-key xfr-runs-at-dev hmac-sha256 >/dev/null
