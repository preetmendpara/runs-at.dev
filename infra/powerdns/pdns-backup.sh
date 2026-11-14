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
# Off-site copy: only when both files exist (/etc/pdns-backup, mode 0700).
#   age-recipient  the owner's age PUBLIC key; the private key never lives here
#   par-url        write-only pre-authenticated request for the private bucket
# The bundle is encrypted before it leaves the host. The URL is passed to curl
# on stdin (-K -), never as a command-line argument.
CONF=/etc/pdns-backup
if [ -s "$CONF/age-recipient" ] && [ -s "$CONF/par-url" ] && command -v age >/dev/null; then
  OBJ="backups/$(hostname -s)/pdns-$STAMP.tar.age"
  tar -C "$DIR" -cf - $(cd "$DIR" && ls -- *"$STAMP"*)       -C / etc/powerdns etc/cron.d/pdns-local     | age -R "$CONF/age-recipient" > "$DIR/offsite-$STAMP.tar.age"
  printf 'url = "%s%s"\nupload-file = "%s"\n' "$(cat "$CONF/par-url")" "$OBJ" "$DIR/offsite-$STAMP.tar.age" \
    | curl -sS -f -K - -o /dev/null
  echo "$(date -u +%FT%TZ) offsite ok $OBJ sha256 $(sha256sum "$DIR/offsite-$STAMP.tar.age" | cut -c1-64)"
  rm -f "$DIR/offsite-$STAMP.tar.age"
fi
find "$DIR" -type f -mtime +14 -delete
echo "$(date -u +%FT%TZ) backup ok $STAMP"
