# DNS migration: verification results (2026-11-13)

Independent re-check of the `feat/powerdns-migration` worktree against `origin/main`
(`0a25e464f5df1b551f72c934a0b1f32d69eb45b3`). Nothing was committed, pushed, provisioned or applied.

## Production readiness (final review, 2026-11-13)

| Area | Ready? | Reason |
|---|---|---|
| Code (lib/dns, scripts, sync-dns powerdns branch) | Ready for review | Default provider still `cloudflare`; PowerDNS path is opt-in via `DNS_PROVIDER=powerdns`. Never run against a real server. |
| Tests | Ready | `npm test`: 699 tests, 699 pass, 0 fail, 0 skipped. `npm run build` exit 0. |
| Backup | Ready | `sha256sum -c SHA256SUMS` 3/3 OK; tarball has 704 files (701 .json); GIT_COMMIT = origin/main. |
| Restore | Ready | `node scripts/verify-backup-restore.mjs` exit 0: 704 restored = 704 manifest = 704 git tree files, byte-identical. |
| Reconciliation | Ready | `node migration/reconcile.mjs`: 0 anomalies, 24 expected discrepancies. `destination-map.mjs`: 229/229 claims, 205/205 records mapped, 0 missing. |
| Cloudflare API export | **Not ready** | Not run. Needs a new read-only `CLOUDFLARE_DNS_READ_TOKEN` secret (Zone, DNS, Read on runs-at.dev only); runs in `.github/workflows/export-cloudflare-dns.yml` on the runner only and publishes aggregate counts plus the whole-export SHA-256. |
| Oracle provisioning (ns1/ns2) | **Not ready** | No OCI credentials/CLI/OpenTofu here. `infra/` written, never applied. |
| PowerDNS running | **Not ready** | No host exists. Adapter tested only against fakes. |
| Registrar transfer | **Not ready** | Cloudflare Registrar does not allow custom nameservers; transfer is a prerequisite. |
| Wildcard / card hosting off Cloudflare | **Not ready** | 4 live records (2 A, 2 AAAA proxied wildcard) point at Cloudflare edge; need a replacement origin. |
| Mail off Cloudflare | **Not ready** | 4 live records (3 MX + SPF TXT) are Cloudflare Email Routing; need a replacement mail provider. |
| DNSSEC | **Not ready** | Not configured in `infra/`; no DS at registrar today. |
| Cutover | **Not ready, blocked** | Blocked by all "not ready" rows above. Authoritative DNS is still Cloudflare. |

## Source counts (registry at origin/main)

- `domains/*.json`: 229, `owners/*.json`: 226, `entitlements/*.json`: 241.
- `git diff --stat origin/main -- domains owners entitlements`: empty.
- Independent recount (own script reading raw `records` / `subdomains` maps, not `planDnsChanges`):
  205 DNS records (CNAME 134, TXT 43, MX 10, A 18) plus 11 URL redirect entries that create no DNS record.

## Export (`node scripts/export-zone.mjs --placeholder-glue`)

- 224 records + SOA (`counts.total` = 225 includes SOA): NS 2, A 24, MX 13, TXT 48, CNAME 135, AAAA 2.
- 205 from claims (matches independent recount, per type), 19 system records (apex, www, wildcard, `_vercel`, NS), 0 duplicates dropped.
- Zone file sha256 `8bf6db8cee162cea6eac198970ef8329e55c0cb693b386b93dd1672fab02f95f`,
  records sha256 `dd925095b40ace08fb1460778099eb52db97b7a7dacd61cd177232534f34e177` (reproducible).
- Glue is TEST-NET placeholder (192.0.2.1/2); file carries a NOT FOR PRODUCTION banner.

## Parity (`node scripts/verify-parity.mjs`)

- declared 205, in zone 225 (incl. SOA), matched 205, missing 0, mismatched 0, extra 0, system 19. Exit 0.
- Declared and zone sha256 both `c1d0cab7ef94001d11b3ccb8c4f1a1db6a681ef2c4fe3542e941d384733de231`.
- Earlier stage reported live Cloudflare (`--server 172.64.32.58`): 189 of 205 match, 16 missing live (consistent with the
  sync-dns "Record quota exceeded" failures). Not re-run here.

## Backup

- `sha256sum -c migration/backup/SHA256SUMS`: all 3 OK (tarball, live-dns-export.json, registry-files.sha256).
- `registry-files.sha256` (704 lines) verifies against the working tree. Tarball holds 701 .json files.
- `GIT_COMMIT` equals origin/main.

## Tests and build

- `npm test`: 699 tests, 699 pass, 0 fail, 0 skipped, 0 cancelled.
  (The earlier 687/685/2-fail result is superseded; the `backfill.test.mjs` failures are fixed in this tree.)
- `npm run build`: exit 0. `public/claim-map.svg` was regenerated and reverted with `git checkout`.

## Reconciliation (`node migration/reconcile.mjs`, `node migration/destination-map.mjs`)

Both exit 0. Independently recounted from the raw files with one-off node scripts:
229 domains, 226 owners, 241 entitlements, 226 distinct owners; 237 entitlement names, 7 empty entitlements,
2 with adminGranted > 0; claims 146 with DNS records, 73 card-only, 10 URL-only, 29 with subdomains;
205 declared records (root CNAME 125, MX 10, TXT 8, A 16; subdomain CNAME 9, TXT 35, A 2).
Zone JSON: 224 records (A 24, AAAA 2, CNAME 135, MX 13, NS 2, TXT 48), `counts.total` 225 incl. SOA,
0 duplicates dropped. `sha256sum -c migration/reports/SHA256SUMS`: 6/6 OK.
Reconcile: 0 anomalies, 24 expected (15 entitlements without owners file = 7 empty + 8 PR-only; 8 entitlement names
without domain; 1 reservation mark on an existing domain).

## Restore (`node scripts/verify-backup-restore.mjs`)

Exit 0, `RESTORE VERIFY OK`: SHA256SUMS 3, live export parsed, restored 704, manifest 704, git tree 704
(domains 230, owners 227, entitlements 241, data 5, schema 1; domains/owners each include .gitkeep).

## Default provider check

- `lib/dns.js`: no diff against origin/main.
- `scripts/sync-dns.mjs`: purely additive; a `DNS_PROVIDER === 'powerdns'` branch that exits before the existing code, plus an
  updated error string. Cloudflare and Vercel paths are byte-identical.

## Secrets and exposure

- Diff and new files grepped for keys/tokens/private keys: no secrets (only checksum lines matched).
- PowerDNS API: `webserver-address=127.0.0.1`, `webserver-allow-from=127.0.0.1/32` on ns1; `api=no` on ns2.
  API key, DB password and TSIG key are generated on-host by setup scripts.
- No `PDNS_*` / powerdns reference under `app/`, `components/` or `lib/*.js`; no `NEXT_PUBLIC_PDNS*`.

## Fixes made in this pass

- `scripts/export-zone.mjs`: log line said "225 records (+SOA)" though 225 already included SOA. Now prints "224 records + SOA".

## Remaining issues

- Live Cloudflare parity (189/205; 16 missing due to record quota) was not re-run in this pass.
- Cloudflare API export has never run; the 8 live system records were taken from the DNS-query export, not the API.
- Wildcard and apex mail still point at Cloudflare-only targets (edge IPs, Email Routing); they break once the zone leaves Cloudflare.
- Registrar transfer is a prerequisite for any cutover.
