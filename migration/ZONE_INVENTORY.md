# Zone inventory: runs-at.dev on PowerDNS

Sanitized: counts and record classes only, no addresses or TXT values.
Checked on 2026-11-14 against the registry at the branch head and the Cloudflare export (CI run #43560748138, whole-export SHA-256 `e90d106c…54ea0d`).

## Why the earlier count was 227 and not 219

The earlier figure of 227 records came from a test export (`--placeholder-glue`, no edge address). It was 8 more than 209 declared + 9 Cloudflare system + 1 DKIM = 219, because:

| Cause | Extra records |
|---|---|
| Apex NS (ns1, ns2). Cloudflare's API does not list NS records, so they were not among its 200. | +2 |
| Glue A records for ns1 and ns2 (new nameservers) | +2 |
| Wildcard: Cloudflare holds **1** proxied record (`* AAAA 100::`, the Worker route). Resolving it gave Cloudflare's anycast addresses (2 A + 2 AAAA). | +3 |
| Apex: Cloudflare holds **1** CNAME to the Vercel target (flattened at the apex). Resolving it gave 2 A records. | +1 |
| **Total** | **+8** |

Cloudflare's 9 undeclared system records, by name and type (sanitized export): `* AAAA proxied` 1, `@ CNAME` 1, `@ MX` 3, `@ TXT` 3, `www CNAME` 1.

## Fixes made

- **Wildcard.** Cloudflare's anycast addresses stop serving the cards once the zone leaves Cloudflare. A production export now refuses to run without `EDGE_IPV4` (the `edge_ip` OpenTofu output) or `WILDCARD_CNAME`. The wildcard is then **one** `A` record pointing at the Caddy edge.
- **Apex.** The apex is now **one** `ALIAS` record to the same Vercel target as `www`. That the two targets are identical was checked against the decrypted Cloudflare export. PowerDNS expands the ALIAS at query time (`expand-alias=yes` and `resolver=` on ns1 and ns2), so the apex does not depend on addresses that Vercel can change. CI step F checks the expansion on both servers.

## Production zone: 223 records + SOA

Generated with real `NS1_IPV4`/`NS2_IPV4`/`EDGE_IPV4` values (TEST-NET values in the check).

| Class | Records | Source |
|---|---|---|
| User-owned (claims) | 207 | `domains/*.json` (`claim:<name>`) |
| Zone-level `_vercel` mirror TXT | 2 | `system:_vercel-mirror`; part of the 209 declared |
| Apex NS | 2 | `system:ns` |
| Glue (ns1/ns2 A) | 2 | `system:glue`; must also be registered as host objects at the new registrar |
| Apex ALIAS (Vercel) | 1 | `system:live-export`; replaces Cloudflare's apex CNAME |
| Apex MX (Email Routing route1–3) | 3 | `system:live-export` |
| Apex TXT (SPF, Google site verification, one other verification token) | 3 | `system:live-export` |
| `www` CNAME (Vercel) | 1 | `system:live-export` |
| DKIM `cf2024-1._domainkey` TXT | 1 | `system:live-export`, value taken unchanged from the live zone; matches Cloudflare's 1 undeclared record |
| Wildcard `*` A (Caddy edge) | 1 | `system:edge` |
| ACME `_acme-challenge` TXT | 0 | Created only while a certificate is being issued, through the scoped TSIG key; sync-dns leaves it alone |
| DMARC | 0 | No `_dmarc` record exists today (checked on public DNS); nothing to preserve |
| **Total** | **223** | + SOA |

209 declared + 2 NS + 2 glue + 10 system (ALIAS, 3 MX, 3 TXT, www, DKIM, wildcard) = 223.

## Coverage

- **19 records missing from Cloudflare:** all are in the desired state and answer on both servers over UDP and TCP (CI `check-servers`).
- **12 URL redirects:** handled by the application through `/_card/<name>` behind the edge, not by DNS records. CI checks edge vs production for a real URL-redirect claim.
- **DKIM record:** kept with its live value. The encrypted backup holds the Cloudflare export copy as provenance.
