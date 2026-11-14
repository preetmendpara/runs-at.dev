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
| edge A1.Flex, NSG 80/443, reserved IP | **Not created**: Oracle returns `Out of host capacity` for A1 in Mumbai. A retry runs every 5 minutes |

## Fixes found on the real hosts (now in cloud-init)

- Oracle's Ubuntu image REJECTs every inbound port except 22 in iptables, so DNS and AXFR were unreachable. Ports 53/udp and 53/tcp are now opened and saved with `netfilter-persistent`; the edge gets 80 and 443.
- The Debian `pdns-server` package enables the BIND backend in `pdns.d/bind.conf`. That file is now removed.

## Zone loaded on ns1

- **Contents:** 222 records + SOA, exported with the real glue. The wildcard is left out until the edge has an address, at which point the zone becomes 223 records (the full production zone).
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
| Apex ALIAS expanded to A | 2 addresses | 2 addresses |
| AXFR without TSIG | refused | refused |

## Not done yet

- **Edge:** waits for A1 capacity. Then: wildcard `A` to the edge IP, then the first certificate (needs `ACME_EMAIL`).
- **DNSSEC:** zone not signed. Sign only when the registrar transfer is scheduled, and publish the DS after the delegation.
- **Tailscale:** no tailnet credentials. The ns1 API stays on loopback.
- **Off-site backup:** an Object Storage bucket is possible within the 20 GB free tier, but not created yet.
- **Delegation:** registrar transfer, email destination and the owner's go-ahead are still required.
