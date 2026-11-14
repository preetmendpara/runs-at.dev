#!/bin/bash
# Nightly: database dump + BIND export of every zone, with checksums. Keeps 14 days.
set -euo pipefail
umask 077
DIR=/var/backups/pdns
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$DIR"
if command -v pg_dump >/dev/null && [ -f /root/.pgpass ]; then
  pg_dump -h 127.0.0.1 -U pdns -Fc pdns > "$DIR/pdns-$STAMP.pgdump"
fi
if [ -f /var/lib/powerdns/pdns.sqlite3 ]; then
  sqlite3 /var/lib/powerdns/pdns.sqlite3 ".backup '$DIR/pdns-$STAMP.sqlite3'"
fi
for zone in $(pdnsutil list-all-zones); do
  pdnsutil list-zone "$zone" > "$DIR/$zone-$STAMP.zone"
done
(cd "$DIR" && sha256sum -- *"$STAMP"* > "SHA256SUMS-$STAMP")
find "$DIR" -type f -mtime +14 -delete
echo "$(date -u +%FT%TZ) backup ok $STAMP"
