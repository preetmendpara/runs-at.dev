# Rollback (PowerDNS to Cloudflare)

Rollback is possible only if the **Cloudflare zone is kept** after cutover. Do not delete it until the migration has been stable for weeks.

## Before cutover

There is nothing to roll back, because production never left Cloudflare. You can stop at any step. Unused OCI resources can be removed with `tofu destroy`, which affects only the instances and has no production impact.

## After the NS change

1. **Revert NS at the registrar** to `aida.ns.cloudflare.com` and `damon.ns.cloudflare.com`. The Cloudflare zone must still exist and be active for those nameservers to answer. If Cloudflare deactivated the zone or it moved to another account, the assigned nameserver pair may differ; use whatever Cloudflare shows for the zone.
2. Keep ns1 and ns2 running and serving until the parent NS TTL has expired everywhere. That is the `.dev` NS TTL, commonly 1 to 2 days. Resolvers that cached the new NS keep querying ns1 and ns2 until then.
3. Bring Cloudflare up to date with the registry by running `sync-dns` with the default provider (`DNS_PROVIDER` unset). Without this, changes merged while PowerDNS was live are missing from Cloudflare. The record quota still applies (see [troubleshooting](troubleshooting.md)).
4. DNSSEC:
   - If a DS for PowerDNS keys was added, remove it **before or together with** the NS revert, then wait out the DS TTL.
   - To use Cloudflare DNSSEC, add Cloudflare's DS only after the NS revert has propagated.
5. Verify with `node scripts/verify-parity.mjs --server 172.64.32.58` (aida) and spot checks from public resolvers.

## TTL notes

- Record TTLs are 300 s, so answers for individual records converge within minutes. NS changes converge on the parent TTL.
- During the overlap both providers answer. Keep them identical by freezing `domains/` merges, so it does not matter which one a resolver reaches.

## Registrar

Rollback does not move the domain back to Cloudflare Registrar, and it does not need to. If that is ever wanted, the new transfer is subject to the same lock rules as [step 1 of the migration](dns-migration.md).
