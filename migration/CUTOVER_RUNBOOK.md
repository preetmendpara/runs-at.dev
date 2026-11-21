# Registrar transfer and cutover runbook: runs-at.dev

Verified configuration as of 2026-11-14. RDAP, the Vercel API, Oracle, and checks from outside Oracle.

## Facts

| Item | Value |
|---|---|
| Registrar | Cloudflare, Inc. Cloudflare Registrar allows **only** Cloudflare nameservers, so a transfer away is required |
| Status | `client transfer prohibited`; registered 2026-09-22, expires 2028-09-22. The 60-day transfer lock ends about **2026-11-21** |
| Parent DNSSEC | `delegationSigned=false`: no DS today |
| Gaining registrar (checked) | Porkbun. Official price API: `.dev` transfer **$12.87** (includes 1 year). Its knowledge base documents glue records and DNSSEC |

## Final configuration (all live on Oracle, not yet delegated)

| Item | Value |
|---|---|
| Nameservers | `ns1.runs-at.dev` 130.210.29.239 (primary, PostgreSQL), `ns2.runs-at.dev` 130.210.102.127 (secondary + Caddy edge) |
| Glue (host objects) | `ns1.runs-at.dev` → 130.210.29.239, `ns2.runs-at.dev` → 130.210.102.127 |
| Zone | 224 records + SOA (`migration/ZONE_INVENTORY.md`). Registry vs live ns1: `sync-dns` dry run plans 0/0/0 |
| Apex | A 216.198.79.1, 64.29.17.1: Vercel API rank-1 `recommendedIPv4` (`migration/apex-vercel.json`); both serve runs-at.dev with a valid certificate |
| Wildcard | `*` A 130.210.102.127 (Caddy edge on ns2). 17/17 edge-vs-production checks |
| Email records today | MX route1–3.mx.cloudflare.net, SPF `include:_spf.mx.cloudflare.net`, DKIM `cf2024-1`. Identical on Cloudflare, ns1 and ns2 |
| Email at cutover | ImprovMX Free (`migration/email-cutover.json`, `migration/improvmx-setup.mjs`): MX mx1/mx2.improvmx.com, SPF `include:spf.improvmx.com`. Aliases `claude@` and `abuse@` with their original destinations, kept in the ImprovMX account only. DKIM `cf2024-1` stays |
| DNSSEC | CSK 56919, ECDSA P-256 (algorithm 13), NSEC. Signed on ns1; ns2 serves the signatures as-is. `delv` validates on both. The key is in the encrypted backup (restore matched) |
| DS (publish **only after** the NS change is externally verified) | `runs-at.dev. DS 56919 13 2 a44a3cf52453541b3648844c105ec5bd600cfc4de5cd84c3ba8bfa3e4e2393ad` |
| TLS | Self-signed TEST certificate. ACME key (scoped to `_acme-challenge` TXT) and contact are installed on ns2; issuing a real certificate needs delegation |
| Deploy path | WireGuard tunnel to ns1's private API (`PDNS_API_URL`=http://10.99.0.1:8081). Secrets `WG_CI_PRIVATE_KEY` and `PDNS_API_KEY` |
| Backups | Private Oracle bucket `runs-at-backups`, write-only upload link, 90-day expiry, age-encrypted. Restore tested |

## Gates

| Gate | State |
|---|---|
| Oracle DNS verified externally | **Yes** |
| Registry and system records reconciled | **Yes** |
| Edge working | **Yes** (TEST certificate until delegation) |
| DNSSEC signed, validated, key backed up | **Yes** |
| Backup and restore | **Yes** |
| Rollback ready | **Yes** |
| ImprovMX aliases created and SMTP-tested | **No**: needs the owner's ImprovMX signup and API key |
| Registrar transfer complete | **No**: lock until about 2026-11-21, then the owner's unlock, transfer code and payment |
| Public TLS | **No**: possible only after the NS change |

## Steps

1. **Owner:** sign up at improvmx.com (Free). Do not add DNS records there. Copy the API key.
2. **Operator:** run `IMPROVMX_API_KEY=… node migration/improvmx-setup.mjs ~/.runs-at-migration/email-routing-20261114.tar.age --apply --smtp-test`. Expect both aliases "created", "verify: … true", and SMTP RCPT 250 for both. Cloudflare Email Routing keeps working meanwhile.
3. **Owner, after about 2026-11-21:**
   1. In Cloudflare, go to Domain Registration → runs-at.dev. Turn off the transfer lock and copy the transfer code.
   2. At the gaining registrar, start the transfer and pay, keeping the Cloudflare nameservers.
   3. Approve the transfer email.
4. **After the transfer completes** (RDAP shows the new registrar):
   1. Create the two host objects (glue) at the new registrar.
   2. Confirm that `verify-oracle-dns` and `pdns-api-tunnel-check` are green.
5. **In one window:**
   1. Apply `migration/email-cutover.json` to the PowerDNS zone.
   2. Set the repository variable `DNS_PROVIDER=powerdns`.
   3. Set the nameservers to `ns1.runs-at.dev` and `ns2.runs-at.dev` at the registrar.
6. **Check from outside**, with several public resolvers:
   1. `dig +trace runs-at.dev`.
   2. The apex, `www`, a card, a URL claim, the 19 formerly missing records.
   3. A test message to each alias.
   4. ns1 and ns2 serials equal.
7. **TLS on ns2:**
   1. Staging dry run: `ACME_SERVER=https://acme-staging-v02.api.letsencrypt.org/directory /usr/local/sbin/renew-cert.sh`.
   2. `renew-cert.sh` without `ACME_SERVER`.
   3. Check `curl https://<card>.runs-at.dev/` without `-k`.
8. **DS, at least 48 hours after step 5 is stable and externally verified:** publish the DS above, then run `delv @1.1.1.1 runs-at.dev SOA` and confirm "fully validated".
9. **After 30 stable days:** retire the Cloudflare zone, Worker and Email Routing. The exports are kept in the encrypted backups.

## Rollback

| Point | Action |
|---|---|
| Before step 5 | Nothing user-visible has changed. |
| After step 5, before the DS | Set the nameservers back to `aida.ns.cloudflare.com` / `damon.ns.cloudflare.com` and unset `DNS_PROVIDER`. The Cloudflare zone, the Worker and Email Routing are untouched. |
| After the DS | First remove the DS and wait out the parent TTL, then revert as above. Never revert the nameservers while the PowerDNS DS is published. |
| Edge only | `infra/edge/rollback-edge-ns2.sh 130.210.102.127` (tested) |
