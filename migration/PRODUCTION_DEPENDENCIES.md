# Production dependencies

What the cutover still needs from outside this repository. Values marked **REAL** must
come from the operator or from provisioned infrastructure; nothing in this branch invents
them. Values marked **TEST** exist only in tests and must never reach production.

## Test values in this branch (never production)

| Value | Where | Purpose |
|---|---|---|
| `192.0.2.1`, `192.0.2.2` (RFC 5737 TEST-NET) | `scripts/export-zone.mjs --placeholder-glue`, `infra/test/pdns-ci.sh` | glue in test zones; the zone file is stamped NOT FOR PRODUCTION |
| `127.0.0.11:5300`, `127.0.0.12:5301` | `infra/test/pdns-ci.sh`, `infra/test/check-servers.mjs` | loopback primary/secondary on the CI runner |
| generated API key, DB password, TSIG secret | `infra/test/pdns-ci.sh` | created on the runner, discarded with it |
| self-signed `*.runs-at.dev` certificate, stub app on `127.0.0.1:9000` | `infra/test/edge-ci.sh` | edge behaviour test |
| `10.53.1.11`, `10.53.1.12` | `infra/opentofu`, `infra/powerdns` | planned private VCN addresses (real once applied, fixed by the IaC) |

## Required real values and access

| # | Dependency | Needed for | Status |
|---|---|---|---|
| 1 | **Registrar transfer** away from Cloudflare Registrar (it does not allow custom nameservers) to a registrar that supports custom NS and host (glue) records for `ns1/ns2.runs-at.dev`, ideally with an API | delegating to ns1/ns2 | BLOCKED: not started (owner action). Check the 60-day transfer lock and the domain's expiry first. |
| 2 | **Oracle Cloud access**: tenancy OCID, compartment OCID, region, an API key for OpenTofu, an SSH public key and the operator's SSH source CIDR (`infra/opentofu/terraform.tfvars.example`) | creating ns1/ns2 | BLOCKED: no OCI credentials on this machine |
| 3 | **ns1/ns2 public IPv4 addresses** (reserved IPs from step 2) | glue records at the registrar, `NS1_IPV4`/`NS2_IPV4` for the zone export, the wildcard A records | REAL, unknown until step 2 |
| 4 | **Secure path from GitHub Actions to the PowerDNS API** (the API listens on ns1 loopback only). Options: SSH tunnel with a deploy key held as a GitHub secret, WireGuard, or running sync on ns1 itself (cron pulling the registry) | `sync-dns` with `DNS_PROVIDER=powerdns` | NOT BUILT: design decision needed; secrets `PDNS_API_KEY` etc. then go to GitHub Secrets |
| 5 | **Wildcard edge host(s)** running `infra/edge/Caddyfile` (on ns1/ns2 or separate VMs), plus `lego` and `ACME_EMAIL` (REAL contact for Let's Encrypt) | profile cards and URL-record redirects on `*.runs-at.dev` | config + behaviour test done; host not provisioned |
| 6 | **Mail forwarding replacement** for Cloudflare Email Routing: a provider (for example ImprovMX or Forward Email) and the REAL destination address(es) for `abuse@runs-at.dev` and any other routed aliases (they are configured in the Cloudflare dashboard and are not visible from here) | `abuse@runs-at.dev`, which the site and policy publish | BLOCKED on owner choice and addresses |
| 7 | **The 1 undeclared Cloudflare record**: identify it in the Cloudflare dashboard; keep it via `migration/operator-extra.json` or drop it deliberately | zero-loss guarantee | owner action |
| 8 | **Vercel apex**: confirm the Vercel project keeps `runs-at.dev` verified with external DNS (apex A records + any TXT Vercel asks for) | the main site | check in the Vercel dashboard before cutover |
| 9 | **Lower TTLs** on the Cloudflare zone and the registrar NS before cutover | fast rollback | operator action on the day |
| 10 | **Monitoring destination** for `infra/monitoring/check-dns.sh` alerts | operations | not chosen |

## Owner-side items for individual subdomains

Five of the 19 Cloudflare-missing records point at hosting projects that do not route the
name today (see `MISSING_17_RECORDS.md`). PowerDNS will publish the records exactly as
declared; whether those sites load is up to each name's owner (add the custom domain in
their Vercel/GitHub Pages/Amvera project). This does not block the cutover.

## Not a dependency

- Cloudflare proxy for claim records: every claim record is DNS-only already.
- DNSSEC: the zone is signed at Cloudflare but the registry holds no DS record, so the
  NS change does not break validation. DNSSEC on PowerDNS can be added after cutover.
- PostgreSQL for users: the app never used a database for users; the Git registry stays.
