# Registrar transfer and cutover runbook: runs-at.dev

Facts as of 2026-11-14 (RDAP, official sources):

| Item | Value |
|---|---|
| Registrar | Cloudflare, Inc. Cloudflare Registrar allows **only** Cloudflare nameservers, so a transfer away is required |
| Status | `client transfer prohibited` |
| Registered / expires | 2026-09-22 / 2028-09-22. The 60-day transfer lock ends about **2026-11-21** |
| DNSSEC at the parent | `delegationSigned=false`: no DS, so no stale DS to remove |
| Gaining registrar (checked) | Porkbun. Official price API: `.dev` transfer **$12.87** (includes a 1-year renewal). Its knowledge base documents glue records and DNSSEC |

## New delegation data

| Item | Value |
|---|---|
| Nameservers | `ns1.runs-at.dev`, `ns2.runs-at.dev` |
| Glue (host objects) | `ns1.runs-at.dev` → `130.210.29.239`, `ns2.runs-at.dev` → `130.210.102.127` (Oracle reserved IPs) |
| DS (publish **after** the NS change has propagated) | `56919 13 2 a44a3cf52453541b3648844c105ec5bd600cfc4de5cd84c3ba8bfa3e4e2393ad` |

## Gates (all must be true)

| Gate | State |
|---|---|
| ns1/ns2 serve the full zone from outside Oracle | **Yes**: 209/209 declared over UDP and TCP, 19/19 missing, serials equal (verify-oracle-dns) |
| Registry vs live ns1 | **Yes**: `sync-dns` dry run through the tunnel plans 0/0/0 |
| Edge on ns2 | **Yes**: 17/17 edge-vs-production checks (TEST certificate) |
| DNSSEC signed and validated | **Yes**: `delv` 9/9 on both servers |
| Encrypted backup and restore | **Yes**: Object Storage, restore compared with live |
| Rollback ready | **Yes**: see below |
| Registrar transfer complete | **No**: lock until about 2026-11-21, then an owner-only unlock, transfer code and payment |
| Email replacement | **No**: prepared (`migration/email-cutover.json`). Forward Email's free plan needs a transferred domain to be at least 90 days old, about **2026-12-21** for runs-at.dev, unless a paid plan or another provider is chosen |
| Public TLS | **No**: only possible after the NS change (DNS-01 through ns1) |

## Steps

1. **Owner, at Cloudflare:** Domain Registration → runs-at.dev → Configuration: turn off the transfer lock and copy the transfer code. Leave DNS untouched.
2. **Owner, at the gaining registrar:** start the transfer with the code and pay. **Keep the Cloudflare nameservers** during the transfer. Approve the transfer email. The transfer can take up to 5 days.
3. **After the transfer completes** (RDAP shows the new registrar), on the gaining registrar:
   1. Create the host objects (glue) above.
   2. Lower risk first: confirm that `verify-oracle-dns` and `pdns-api-tunnel-check` are green, and confirm ns1/ns2 serials are equal.
4. **Email:** apply `migration/email-cutover.json` to the PowerDNS zone: remove route1–3 MX, add Forward Email MX and the encrypted alias TXT, update the SPF. This must happen in the same window as the NS change, because Cloudflare Email Routing stops working once the zone leaves Cloudflare.
5. **Repository variable:** `DNS_PROVIDER=powerdns` (sync-dns then uses the tunnel). Rollback: unset it.
6. **At the registrar:** set the nameservers to `ns1.runs-at.dev` and `ns2.runs-at.dev`.
7. **Check from outside**, with several public resolvers, until stable:
   1. Run `verify-oracle-dns` and confirm the NS delegation through `dig +trace`.
   2. Check `https://runs-at.dev`, `www`, a card, a URL claim and the 19 records.
   3. Send a test message to each alias.
8. **TLS on ns2:**
   1. Staging dry run: `ACME_SERVER=https://acme-staging-v02.api.letsencrypt.org/directory /usr/local/sbin/renew-cert.sh`.
   2. Run `renew-cert.sh` without `ACME_SERVER`.
   3. Check `curl https://<card>.runs-at.dev/` without `-k`.
9. **DNSSEC, at least 48 hours after step 6 is stable:** publish the DS above at the registrar. Then confirm validation with a validating resolver (`delv @1.1.1.1 runs-at.dev SOA`).
10. **Clean up after 30 stable days:** retire the Cloudflare zone (export kept in the encrypted backups).

## Rollback

| Point | Action |
|---|---|
| Before step 6 | Nothing user-visible has changed. Unset `DNS_PROVIDER`. |
| After step 6, before the DS | Set the nameservers back to `aida.ns.cloudflare.com` / `damon.ns.cloudflare.com`. The Cloudflare zone, the Worker and Email Routing still exist because nothing in them was deleted. Unset `DNS_PROVIDER`. |
| After the DS | First remove the DS at the registrar and wait for the parent TTL. Then revert the nameservers as above. Never revert the nameservers while a DS for the PowerDNS key is published. |
| Edge only | `infra/edge/rollback-edge-ns2.sh 130.210.102.127` (tested) |
