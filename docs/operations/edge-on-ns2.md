# Wildcard edge on ns2

Mumbai had no Always Free A1 capacity for a separate edge machine, so the owner approved running Caddy on ns2, next to the PowerDNS secondary. OpenTofu records this layout as `edge_host = "ns2"` (the default). That setting attaches the `edge-https` NSG (80/443 only) to ns2's VNIC, and `edge_ip` is ns2's address. If A1 capacity appears later, set `edge_host = "separate"` to move the edge to its own machine, then roll back the edge on ns2.

## Files

| File on ns2 | Source in the repo |
|---|---|
| `/etc/caddy/Caddyfile` | `infra/edge/Caddyfile` |
| `/etc/systemd/system/caddy.service.d/runs-at-edge.conf` | `infra/edge/caddy-override.conf` |
| `/etc/systemd/system/pdns.service.d/priority.conf` | `infra/powerdns/pdns-priority.conf` |
| `/usr/local/sbin/renew-cert.sh`, `/usr/local/sbin/edge-health.sh` | `infra/edge/` |
| `/etc/cron.d/runs-at-edge`, `/etc/logrotate.d/runs-at-edge` | `infra/edge/edge-cron`, `infra/edge/logrotate-edge` |
| `/etc/runs-at-edge/tls/` (0750 root:caddy) | wildcard certificate. A self-signed TEST certificate until the first ACME issue |
| `/etc/runs-at-edge/acme-tsig.env`, `acme.env` (0600 root) | `infra/edge/provision-acme-key.sh` |

## Deploy, roll back, redeploy

```bash
SSH_KEY=~/.ssh/runs_at_oci infra/edge/deploy-edge-ns2.sh <ns2-ip>        # idempotent
SSH_KEY=~/.ssh/runs_at_oci infra/edge/rollback-edge-ns2.sh <ns2-ip>      # stop Caddy, close 80/443; DNS untouched
SSH_KEY=~/.ssh/runs_at_oci infra/edge/rollback-edge-ns2.sh <ns2-ip> --purge  # also remove packages, certs, keys
bash infra/test/edge-live.sh <ns2-ip> --insecure                          # edge vs production, real names
```

Rollback was tested on 2026-11-14. Caddy stopped and nothing listened on 80/443; ns2 kept serving DNS. Redeploying restored 17/17 edge checks.

The wildcard DNS record is a separate rollback step. Before cutover, Cloudflare still serves the zone, so nothing points at the edge. After cutover, point `*` back to another host if the edge must go away.

## Isolation

- **Process:** Caddy runs as user `caddy` with no capabilities except `CAP_NET_BIND_SERVICE` and `NoNewPrivileges`. Its systemd exposure score is 1.4 (pdns: 2.1).
- **Filesystem:** `ProtectSystem=strict`; the only writable path is `/var/lib/caddy`. These paths are invisible to Caddy: `/etc/powerdns`, `/var/lib/powerdns` (SQLite database including the zone-transfer TSIG key), `/etc/pdns-backup` (off-site upload URL), `/var/backups/pdns`, `/root`, the ACME key files and `/var/lib/lego`. Checked from inside Caddy's mount namespace.
- **Admin:** the admin API is off (`admin off`), and there is no HTTP/3 UDP listener. ns2 has no PowerDNS API (`api=no`); ns1's API listens only on ns1's loopback.
- **ACME:** only `renew-cert.sh` (root, cron) uses the ACME TSIG key. That key can write only TXT at `_acme-challenge.runs-at.dev` (Lua policy on ns1, verified live). Caddy reads only the resulting certificate.

## Resources (ns2: E2.1.Micro, 2 vCPU burstable, 952 MB)

- **Caddy:** `MemoryHigh=160M`, `MemoryMax=220M`, no swap, `CPUWeight=20`, `CPUQuota=80%`, `TasksMax=256`, `Nice=5`, `IOWeight=20`.
- **pdns:** `CPUWeight=400`, `IOWeight=400`, `OOMScoreAdjust=-500`, `Restart=always`. DNS wins any contention.
- **Under concurrent load** (2,200 edge requests, 1,500 DNS queries to ns2, one zone change replicated): Caddy peaked at 14 MB and pdns at 48 MB. CPU averaged 2% user, minimum idle was 82%, and steal was 0%. There were 0 DNS failures, replication took 1 s, and every HTTP code was as expected.

## Monitoring and recovery

- `edge-health.sh` runs every minute and logs HTTPS/HTTP status, ns2's SOA serial and Caddy's memory to `/var/log/runs-at-edge-health.log`. After 3 consecutive failures it restarts Caddy.
- systemd restarts Caddy on a crash (tested with `kill -9`) and pdns always.
- The logs are rotated weekly and 8 are kept. Caddy's access log goes to journald.

## TLS

- **Until DNS is delegated:** a self-signed TEST certificate serves HTTPS. Let's Encrypt (staging or production) cannot validate DNS-01 yet, because public resolvers still ask Cloudflare for `_acme-challenge.runs-at.dev`. No certificate has been requested.
- **After delegation:**
  1. Run `provision-acme-key.sh <ns1> <ns2> <ACME_EMAIL>`.
  2. Do a staging dry run: `ACME_SERVER=https://acme-staging-v02.api.letsencrypt.org/directory renew-cert.sh`.
  3. Run `renew-cert.sh` without `ACME_SERVER`. The daily cron renews the certificate from then on.
