# Backup and restore

## Registry (source of truth)

The registry is Git, so its history is the main backup. A point-in-time archive is also kept in `migration/backup/`:

| File | Content |
| --- | --- |
| `registry-2026-11-13.tar.gz` | `domains/ owners/ entitlements/ data/ schema/`: 704 files from commit `0a25e464f5df1b551f72c934a0b1f32d69eb45b3` |
| `registry-files.sha256` | a checksum for every file |
| `live-dns-export.json` | live answers from `aida.ns.cloudflare.com` next to what the registry declares (includes the apex, MX, TXT and www records that are not in the registry) |
| `SHA256SUMS` | checksums of the three files above (archive sha256 `b308b90c2c802d3a24e65688d2921da657062cdaa1eae90aefe241d6ce411087`) |

Verify:
```sh
cd migration/backup && sha256sum -c SHA256SUMS
T=$(mktemp -d) && tar -xzf registry-2026-11-13.tar.gz -C "$T" \
  && (cd "$T" && sha256sum -c --quiet "$OLDPWD/registry-files.sha256") && echo OK
```

Full check (checksums, extraction, byte-for-byte comparison with the git tree at `GIT_COMMIT`), exits non-zero on any mismatch:
```sh
node scripts/verify-backup-restore.mjs            # last run 2026-11-13: RESTORE VERIFY OK, 704/704 files match git
node scripts/verify-backup-restore.mjs --dry-run  # print the restore commands only
```

Restore on a fresh branch, then open a PR. Never force-push `main`.
1. From Git (preferred): `git checkout 0a25e464f5df1b551f72c934a0b1f32d69eb45b3 -- domains owners entitlements data schema`
2. From the archive, at the repo root:
   ```sh
   tar -xzf migration/backup/registry-2026-11-13.tar.gz
   sha256sum -c --quiet migration/backup/registry-files.sha256
   npm test
   ```
3. When the PR merges to `main`, `sync-dns` recreates the declared records. Records outside the registry (apex, MX, TXT, www, `_vercel`) must be re-entered by hand from `live-dns-export.json`.

More detail is in `migration/BACKUP_MANIFEST.md` and `migration/backup/README`.

## Cloudflare zone

`scripts/export-cloudflare-dns.mjs` exports every record in the zone (all pages, all types) and only makes read (GET) requests. It runs in `export-cloudflare-dns.yml` on a GitHub-hosted runner, on pushes to `feat/powerdns-migration` that change the export code, using a dedicated read-only token (`CLOUDFLARE_DNS_READ_TOKEN`: Zone, DNS, Read on runs-at.dev only).

The raw export never leaves that runner. It is written under `$RUNNER_TEMP` (mode 700, umask 077), reconciled against the registry in the same step by `scripts/reconcile-cloudflare.mjs`, and deleted by a shell trap and an `always()` step. It is never uploaded as an artifact, cached or committed, because this repository is public. The job summary carries only aggregate counts and the SHA-256 of the whole export. Error messages carry only paths, HTTP status codes and counts, never response bodies.

## PowerDNS hosts (once provisioned)

`/usr/local/sbin/pdns-backup.sh` runs nightly at 03:17 from `/etc/cron.d/pdns-local` and writes to `/var/backups/pdns`:
- ns1: a `pg_dump -Fc` of the `pdns` database.
- ns2: a SQLite `.backup` copy.
- Both: a BIND-format export of every zone, with checksums. Files older than 14 days are deleted.

These backups stay on the instance. Copy them off OCI, because idle reclamation or losing the account takes the disk with it.

To restore a host, you can always rebuild the zone from Git instead of from a dump:
```sh
NS1_IPV4=<ns1> NS2_IPV4=<ns2> node scripts/export-zone.mjs
node scripts/verify-parity.mjs                     # must exit 0
# on ns1:
pdnsutil load-zone runs-at.dev runs-at.dev.zone    # when reloading, run pdnsutil increase-serial afterwards
```
ns2 then transfers the zone again from ns1. Use the pg_dump (with `pg_restore`) or the SQLite copy only when you need state that is not in Git, such as TSIG metadata or hand edits.
