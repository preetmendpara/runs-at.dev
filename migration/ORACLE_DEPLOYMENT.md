# Oracle deployment: runs-at.dev nameservers

As of 2026-11-14. Production DNS is unchanged: runs-at.dev is still delegated to Cloudflare. Nothing below is live for users.

## Account

| Item | Value |
|---|---|
| Account | One existing tenancy, home region `ap-mumbai-1` (BOM), one availability domain |
| Account status | Free Trial; becomes Always Free when the trial ends |
| Compartment | `runs-at-dns`, holds every resource below |
| Charge alert | Budget `runs-at-free-tripwire`: $1 a month on the compartment, with alerts at 1% of actual and of forecast spend |
| Access | API key for the existing administrator user; key fingerprint matches the console |

Shapes and limits were checked before applying:
- 2× `VM.Standard.E2.1.Micro`: the Always Free allowance is 2.
- 1× A1.Flex with 1 OCPU / 6 GB: within the 2 OCPU / 12 GB Always Free allowance.
- 3 boot volumes of 50 GB: within the 200 GB free total.
- Oracle's public price list has no public-IP product. Reserved IPs used: 3 of the tenancy limit of 6.

## Resources

| Resource | State |
|---|---|
| VCN, subnet, internet gateway, route table, security list (53/udp+tcp open; 22 open only to the operator's IP) | Created |
| ns1 `VM.Standard.E2.1.Micro`, reserved IP **130.210.29.239** | Running: PowerDNS primary (PostgreSQL); API on 127.0.0.1 only |
| ns2 `VM.Standard.E2.1.Micro`, reserved IP **130.210.102.127** | Running: PowerDNS secondary (SQLite), TSIG AXFR from ns1 |
| Edge | **On ns2** (owner-approved: Mumbai A1 was out of capacity in every fault domain). Caddy 2.6.2, sandboxed; ports 80/443 opened by the `edge-https` NSG on ns2 only. See `docs/operations/edge-on-ns2.md` |

## Fixes found on the real hosts (now in cloud-init)

- Oracle's Ubuntu image REJECTs every inbound port except 22 in iptables, so DNS and AXFR were unreachable. Ports 53/udp and 53/tcp are now opened and saved with `netfilter-persistent`; the edge gets 80 and 443.
- The Debian `pdns-server` package enables the BIND backend in `pdns.d/bind.conf`. That file is now removed.

## Zone loaded on ns1

- **Contents:** 224 records + SOA (the full production zone), DNSSEC-signed (CSK 56919, ECDSA P-256, NSEC), exported with the real glue. Wildcard `*` A 130.210.102.127 (ns2, the edge).
- **Kind and metadata:** `primary`, `SOA-EDIT-API DEFAULT`, `TSIG-ALLOW-AXFR xfr-runs-at-dev`.
- **Checks:** `pdnsutil check-zone` reports 0 errors.

## Checked from outside Oracle (GitHub runner, run #43575586572)

| Check | ns1 | ns2 |
|---|---|---|
| Authoritative (AA) | yes | yes |
| SOA serial | 2026111401 | 2026111401 |
| Declared records, UDP | 209/209 | 209/209 |
| Declared records, TCP | 209/209 | 209/209 |
| Records Cloudflare does not serve (19) | 19/19 | 19/19 |
| Apex A (follows Vercel) | 2 addresses | 2 addresses |
| AXFR without TSIG | refused | refused |

## Status of the remaining pieces (2026-11-14)

- **Edge certificate:** self-signed TEST certificate. The ACME key (root-only, hidden from Caddy) and contact `priieeet@gmail.com` (a Cloudflare-verified forwarding destination) are installed on ns2. The edge's update path to ns1 has been tested (add, read, delete of the challenge TXT; other names refused). Staging and production issuance wait for delegation.
- **DNSSEC:** zone signed on ns1 (CSK 56919, algorithm 13, NSEC). ns2 serves the signatures as-is (presigned). `delv` fully validates 9/9 test queries on both servers, including the apex, the wildcard and a nonexistent name. DS for the registrar, to be published only after the nameservers change: `runs-at.dev. DS 56919 13 2 a44a3cf52453541b3648844c105ec5bd600cfc4de5cd84c3ba8bfa3e4e2393ad`.
- **Deploy tunnel:** WireGuard (`infra/wireguard`) instead of Tailscale (no Tailscale account available). UDP 51820 is open on ns1 only, through an NSG. The API is reachable only via 10.99.0.1:8081 from 10.99.0.2 and still needs the API key. Checked from GitHub: direct access to ns1:8081 gets no answer; a request without a key gets 401; with the key, the zone reads; a `sync-dns` dry run plans 0/0/0.
- **Off-site backup:** private bucket `runs-at-backups` (first 10 GB free). Uploads go through a write-only link, objects expire after 90 days, and everything is age-encrypted. Restore tested. A second copy of the recovery key is in the owner's local app-data folder, `runs-at-recovery` (access limited to the owner).
