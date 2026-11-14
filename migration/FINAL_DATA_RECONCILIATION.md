# Final data reconciliation

Branch `feat/powerdns-migration`, registry merged from `origin/main` at `093e5c5`
(2026-11-14). Every number below is produced by a script in this repository; the
scripts are named so each figure can be reproduced.

## 1. Registry (source of truth)

`node migration/reconcile.mjs`

| Item | Baseline (0a25e464, 2026-11-13) | Now (093e5c5, 2026-11-14) |
|---|---|---|
| Claims (`domains/*.json`) | 229 | 232 |
| Owners (`owners/*.json`) | 226 | 229 |
| Entitlement files (`entitlements/*.json`) | 241 | 244 |
| Distinct claim owners | 226 | 229 |
| Owners whose file lists every claim they own | 226 | 229 |
| Owners without an entitlement file | 0 | 0 |
| Entitlement files without an owners file | 15 | 15 |
| Genuine anomalies | 0 | 0 |

The 15 entitlement files without an owners file are expected and are kept as they are:
7 hold no names (released, returned or pull request closed; `lib/entitlements.js` never
deletes the file) and 8 hold only a pull-request reservation for a name that has no claim
file yet. One reservation mark sits on an existing claim (`kumagai`, PR #19); `staleSlots`
clears it on the next limit check.

**Destination:** all of it stays in the Git registry, unchanged. PowerDNS stores DNS only;
users, owners, entitlements, claim dates, reserved names and ownership rules never move.
`git diff origin/main -- domains owners entitlements` on this branch is empty.

## 2. Declared DNS records

`node migration/destination-map.mjs`, `node scripts/verify-parity.mjs`

| Item | Baseline | Now |
|---|---|---|
| Claim records (`planDnsChanges`) | 205 | 207 |
| Zone-level `_vercel` mirror values | 2 | 2 |
| **Declared total** | **207** | **209** |
| By type (claim records, now) | | CNAME 136, TXT 43, A 18, MX 10 |
| URL entries (app-level redirects, no DNS record by design) | 11 | 12 |
| Card-only claims (no records, served by the wildcard) | 73 | 73 |

Every declared record maps to exactly one RRset in the generated PowerDNS zone:
`verify-parity`: declared 207, matched 207, missing 0, mismatched 0, extra 0; declared and
zone record-set SHA-256 identical (`6272aa31…`). The 2 `_vercel` mirror values are in the
zone too (system source `_vercel-mirror`).

URL entries stay application behaviour: they produce no DNS record; the wildcard answers
those names and the app issues the redirect (`/_card/<name>`), exactly as today.

## 3. Cloudflare zone (200 records)

From the sanitized CI export run (#43550755250, baseline registry, read-only token):

| Cloudflare records | Count | Destination |
|---|---|---|
| Declared records present | 190 | the same records, from the registry, in the PowerDNS zone |
| System names (apex, www, wildcard, `_vercel`) | 9 | apex A, www CNAME, `_vercel` hand-placed values: copied into the zone; apex MX/SPF and the proxied wildcard need service replacements (section 5) |
| Undeclared, non-system | 1 | **not yet mapped**: its name and value are deliberately not published by the sanitized run. The operator must identify it in the Cloudflare dashboard and either list it in `migration/operator-extra.json` (gitignored; `export-zone.mjs --extra`) or decide to drop it. Not silently discarded. |
| **Total** | **200** | |

Declared records Cloudflare does not serve: 17 at baseline, **19 now** (2 new claims). They
are investigated one by one in `MISSING_17_RECORDS.md`; all 19 are in the PowerDNS zone.

## 4. Generated PowerDNS zone

`node scripts/export-zone.mjs --placeholder-glue` (TEST glue)

226 records + SOA: CNAME 137, TXT 48, A 24, MX 13, NS 2, AAAA 2.
By source: 207 claim, 13 live system, 2 `_vercel` mirror, 2 NS, 2 glue. 0 duplicates.

The committed tooling only ever writes the zone to `migration/zone/` (gitignored). The glue
in the test zone is TEST-NET (192.0.2.1/.2) and the file is marked NOT FOR PRODUCTION; the
exporter refuses to run without `NS1_IPV4`/`NS2_IPV4` unless `--placeholder-glue` is given.

## 5. Behaviour that is not a DNS record

| Today (Cloudflare) | Copying the record is enough? | Replacement in this branch |
|---|---|---|
| Wildcard `*.runs-at.dev` proxied + `cloudflare/worker.js` (profile cards, path redirects) | No: needs TLS for every name and the Worker logic | `infra/edge/Caddyfile` (same routing, cookie stripping, redirect pass-through) + `infra/edge/renew-cert.sh` (wildcard certificate by DNS-01 on our PowerDNS); behaviour-tested in CI |
| Apex mail via Cloudflare Email Routing (3 MX + SPF) | No: the MX hosts only accept mail for Cloudflare-hosted zones | Needs a forwarding provider and the real destination address(es); see `PRODUCTION_DEPENDENCIES.md` |
| Cloudflare proxy on other names | Not used: every claim record is DNS-only | none needed |
| DNSSEC | Zone signed at Cloudflare, no DS at the registry | none needed for cutover; enable on PowerDNS after cutover if wanted |

## 6. Backups

`node scripts/verify-backup-restore.mjs`: RESTORE VERIFY OK, 704/704 files byte-identical
to the Git tree at `0a25e464`. Backups stay local (`migration/backup/`, gitignored); the Git
history itself is the primary, already-distributed backup of every registry file.
