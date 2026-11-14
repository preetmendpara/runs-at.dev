# Final cutover readiness

Status on 2026-11-14, branch `feat/powerdns-migration`. Production is unchanged: Cloudflare
still serves `runs-at.dev`, nameservers are `aida/damon.ns.cloudflare.com`, no record was
created, edited or deleted at Cloudflare, nothing was merged into `main`.

## Verdict

**Not ready for production cutover.** The data side is complete and verified; the blockers
are external infrastructure and owner decisions (`PRODUCTION_DEPENDENCIES.md`).

## Readiness by area

| Area | Ready | Evidence |
|---|---|---|
| Registry preserved (232 claims, 229 owners, 244 entitlements, 0 anomalies) | Yes | `migration/reconcile.mjs`; no diff to `domains/ owners/ entitlements/` |
| Every declared record (209) mapped into the PowerDNS zone, incl. all 19 Cloudflare-missing | Yes | `verify-parity` 207/207 claim records + 2 mirror; `MISSING_17_RECORDS.md` |
| URL entries kept as app behaviour (no DNS record) | Yes | `lib/dns.js planFor`, unchanged |
| Cloudflare's 200 records classified (190 / 9 / 1) | Yes, 1 needs an owner decision | `FINAL_DATA_RECONCILIATION.md` §3 |
| Provider architecture (Cloudflare default kept for rollback, PowerDNS opt-in) | Yes | `lib/dns/*`, `scripts/sync-dns.mjs`, unit tests |
| PowerDNS primary + secondary serving every record over UDP and TCP, TSIG-only AXFR, updates reaching the secondary | Built; **not yet run** | `.github/workflows/powerdns-integration.yml` runs only on a push of this branch (pending approval) |
| Wildcard edge replacing the Worker | Built; **not yet run** | `infra/edge/Caddyfile`, CI behaviour test `infra/test/edge-ci.sh` |
| Backups and restore verification | Yes | `scripts/verify-backup-restore.mjs`: 704/704 |
| Unit tests / build | Yes | `npm test` 703/703; `npm run build` passes |
| Oracle ns1/ns2 provisioned | **No** | no OCI credentials |
| Registrar allows ns1/ns2 delegation + glue | **No** | Cloudflare Registrar; transfer not started |
| Mail forwarding off Cloudflare | **No** | provider and destinations not chosen |
| GitHub Actions → PowerDNS API path | **No** | design decision pending |
| Wildcard TLS certificate issued | **No** | needs the edge host and PowerDNS live |

## The 19 Cloudflare-missing records after cutover

| Will resolve and serve | Will resolve; site not routed by owner's host today | Unreachable |
|---|---|---|
| 13: abdulloh, aureon, dsa-visualizer, fineclient, free-manner, mail.ofcstream, xinniankuaile, plus the TXT records `_vercel.adsimple`, `_dmarc.send.chase-notify`, `_amvera.ebmc`, `_openai-site-verification.xinniankuaile`, `_cf-custom-hostname.xinniankuaile`, `_vercel` (zone mirror) | 6: adsimple.adsimple, ashenwings, admin.jaku (Vercel: no deployment for the name), haxnonroot, wutong (GitHub Pages: no site for the name), ebmc (Amvera answers 404; its `_amvera` TXT is among the missing and publishes with PowerDNS) | 0 |

Each of the 19 is published by PowerDNS exactly as its owner declared it.

## Cutover order (when the blockers are cleared)

1. Provision ns1/ns2 (OpenTofu), run `setup-primary.sh` / `setup-secondary.sh`, exchange the TSIG key.
2. Export the zone with the real `NS1_IPV4`/`NS2_IPV4` (no `--placeholder-glue`), plus `--extra migration/operator-extra.json` if the undeclared record is kept; load on ns1; check `infra/test/check-servers.mjs <ns1> <ns2>`: 209/209 on both, UDP and TCP.
3. Bring up the edge, issue the wildcard certificate, point the wildcard A/AAAA at the edge in the zone; test cards on a few names with `curl --resolve`.
4. Set up mail forwarding and swap the apex MX/SPF in the zone.
5. Lower TTLs at Cloudflare; transfer the registrar; register glue; change NS; watch both NS sets answer identically.
6. Keep the Cloudflare zone and `DNS_PROVIDER=cloudflare` path untouched until the rollback window has passed (`docs/operations/rollback.md`).
