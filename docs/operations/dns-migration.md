# DNS migration: Cloudflare to PowerDNS

The migration is **blocked today** for two reasons:
1. runs-at.dev is at Cloudflare Registrar, which does not allow custom nameservers.
2. ns1 and ns2 are not provisioned.

Do not start step 7 until every earlier step is done and verified.

## 0. Preconditions (not yet met)

- [ ] A replacement host for the wildcard profile card outside Cloudflare (today the wildcard is proxied to `cloudflare/worker.js`). Once it exists, set `WILDCARD_CNAME` for the exporter.
- [ ] A replacement for apex mail (today: Cloudflare Email Routing MX and SPF).
- [ ] ns1 and ns2 provisioned ([oracle-setup](oracle-setup.md)), with their real glue IPs known.
- [ ] A decision on adding a secondary outside OCI (see [architecture](../architecture/dns-infrastructure.md)).

## 1. Transfer the domain away from Cloudflare Registrar (mandatory)

Cloudflare Registrar allows only Cloudflare nameservers, so ns1/ns2.runs-at.dev cannot be delegated while the domain is there.

Check these before starting (the rules vary, so check current ICANN policy and both registrars):
- **60-day lock:** ICANN rules generally block a transfer within 60 days of registration or of a previous transfer, and registrars may apply a 60-day lock after a registrant contact change. Look up the domain's creation and last-transfer dates through RDAP.
- **Transfer lock:** remove `clientTransferProhibited` in the Cloudflare dashboard, and get the auth (EPP) code there.
- **Gaining registrar:** it must support `.dev`, custom nameservers, **host objects (glue)** and DS records.
- `.dev` is on the HSTS preload list. The transfer does not change that, but keep HTTPS working throughout.

Leave the Cloudflare nameservers unchanged during the transfer. Most registrars keep the existing NS on transfer, but confirm this with the gaining registrar. When the transfer completes, Cloudflare still serves the zone and nothing visible to users should change.

## 2. DNSSEC

The delegation is unsigned today (there is no DS), so there is nothing to remove now. Check again before cutover:
```sh
node -e "require('dns').promises.resolve('runs-at.dev','DS').then(console.log,e=>console.log(e.code))"
```
Rule: **if a DS exists, remove it, or replace it with a DS for keys PowerDNS serves, and wait out the DS TTL before changing NS.** If NS changes while a DS still points at Cloudflare's keys, validation fails and validating resolvers return SERVFAIL. PowerDNS DNSSEC is not set up in this repo; signing the zone is a separate, later change.

## 3. Lower TTLs

Do this at least 48 hours before cutover:
- Record TTLs: claim records are already 300 s. At Cloudflare, lower the hand-placed apex and www records to 300 s if they are higher.
- The NS TTL at the parent (`.dev`) is set by the registry and cannot be changed, so plan around it. It is commonly up to 2 days; check it with `dig NS runs-at.dev @<a .dev server>` from a machine that has dig.

## 4. Build the zone

```sh
NS1_IPV4=<ns1> NS2_IPV4=<ns2> [WILDCARD_CNAME=<host>] node scripts/export-zone.mjs
node scripts/verify-parity.mjs        # registry against the zone file; must exit 0
```
Never load the output of `--placeholder-glue`. It uses TEST-NET addresses (192.0.2.x) and carries a NOT FOR PRODUCTION banner.

16 registry records are not live at Cloudflare today because of the record quota. The new zone includes them, so they will start resolving at cutover. This is expected.

## 5. Load and verify on ns1 and ns2 (staged, not yet delegated)

```sh
# on ns1
pdnsutil load-zone runs-at.dev runs-at.dev.zone
pdns_control rediscover   # refresh the zone cache, or pdns answers REFUSED
pdnsutil check-zone runs-at.dev
# locally
node scripts/verify-parity.mjs --server <ns1-public-ip>     # must exit 0
node scripts/verify-parity.mjs --server <ns2-public-ip>     # must exit 0
NS1=<ns1> NS2=<ns2> infra/monitoring/check-dns.sh            # serials equal over UDP and TCP
```
Also compare the apex, www, MX and TXT records by hand with `migration/backup/live-dns-export.json`.

Optionally, run sync in dry-run mode to confirm the diff is empty:
```sh
DNS_PROVIDER=powerdns PDNS_DRY_RUN=1 PDNS_API_URL=http://127.0.0.1:8081 PDNS_API_KEY=... \
  PDNS_PRIMARY_IP=<ns1> PDNS_SECONDARY_IPS=<ns2> node scripts/sync-dns.mjs
```

## 6. Freeze registry writes

From the final export until cutover is confirmed, pause merges that touch `domains/` (and with them `sync-dns`). Alternatively, re-export and reload just before step 7. Otherwise Cloudflare and PowerDNS drift apart.

## 7. Cutover at the new registrar

1. Create host objects `ns1.runs-at.dev` and `ns2.runs-at.dev` with the glue IPs.
2. Replace the NS records `aida.ns.cloudflare.com` and `damon.ns.cloudflare.com` with `ns1.runs-at.dev` and `ns2.runs-at.dev`.
3. **Do not delete or change the Cloudflare zone.** Resolvers keep using it until the parent NS TTL expires, and it is also the rollback path.

## 8. Verify after cutover

- The parent delegation shows ns1 and ns2 (query a `.dev` TLD server).
- Run `verify-parity.mjs --server` against both servers every few hours for 2 days.
- Spot-check from public resolvers (1.1.1.1 and 8.8.8.8): the apex, www, a claim CNAME, a URL-redirect name, and mail.
- Then switch CI (not done yet): add the `PDNS_*` secrets and set `DNS_PROVIDER=powerdns` in `sync-dns.yml`.

## 9. Afterwards

Keep the Cloudflare zone for at least 2 weeks. To roll back, see [rollback](rollback.md).
