# Oracle Cloud setup (ns1 / ns2)

**None of this has been applied.** No OCI credentials, CLI, OpenTofu or SSH keys were available when it was written, and `tofu plan` has never run. Treat the first run as a review exercise.

## Prerequisites

- An OCI tenancy with an API signing key configured for OpenTofu, and its home region known (the Always Free E2.1.Micro shape exists only in the home region).
- OpenTofu installed, an SSH key pair, and your public IP as a /32.
- In the OCI console, confirm that the tenancy still has Always Free capacity and that **reserved public IPs are free in your tenancy** (this was not checked).

## Steps

1. Configure:
   ```sh
   cd infra/opentofu
   cp terraform.tfvars.example terraform.tfvars   # never commit terraform.tfvars
   ```
   - Required (no defaults): `tenancy_ocid`, `compartment_ocid`, `region`, `ssh_public_key`, `ssh_allowed_cidr` (must not be `0.0.0.0/0`).
   - Optional:
     - `shape`: `VM.Standard.E2.1.Micro` (default) or `VM.Standard.A1.Flex`
     - `a1_ocpus`: default 1
     - `a1_memory_gbs`: default 6
     - `boot_volume_gbs`: default 50
   - The config rejects any size outside the Always Free limits.
2. If you changed anything in `infra/powerdns/` or `infra/monitoring/`, regenerate cloud-init with `node infra/cloud-init/build.mjs` (a test fails if the files drift).
3. Run `tofu init && tofu plan` and review the plan. It should contain:
   - one VCN and one subnet
   - a security list allowing UDP and TCP 53 from anywhere, and TCP 22 from `ssh_allowed_cidr` only
   - two instances
   - two reserved public IPs

   Then run `tofu apply` and record the `glue` output.
4. First boot: cloud-init runs `setup-primary.sh` or `setup-secondary.sh`. Each host generates its own database password, API key and TSIG key, so no secret is in the repo or in cloud-init.
   - **ns1:** PowerDNS with PostgreSQL on loopback. The API listens on `127.0.0.1:8081` only, and transfers and NOTIFY go only to `10.53.1.12`.
   - **ns2:** PowerDNS with SQLite, a secondary with ns1 as its autoprimary.
   - **Both:**
     - a systemd hardening drop-in
     - security-only unattended upgrades
     - logrotate
     - `/etc/cron.d/pdns-local`: a nightly backup at 03:17 and `check-dns.sh` every 5 minutes
5. Load the zone (steps 4 and 5 of [dns-migration](dns-migration.md)).
6. Set up TSIG for zone transfers.
   1. On ns1, run `pdnsutil set-meta runs-at.dev TSIG-ALLOW-AXFR xfr-runs-at-dev`.
   2. From the operator's machine, run `infra/powerdns/rotate-xfr-tsig.sh <ns1> <ns2>`. It generates the key on ns1 and pipes it over SSH stdin into ns2, so the secret never appears in a command line, a log or a file. Then it checks that the key matches on both servers, a new serial transfers, and a wrong key is refused. Use the same command to rotate the key later.
   3. On ns2, rerun `/usr/local/sbin/setup-pdns.sh`.
7. API access for `sync-dns` in PowerDNS mode. The API listens on loopback only, so reach it through an SSH tunnel: `ssh -L 8081:127.0.0.1:8081 ubuntu@<ns1>`.
   - CI would need new secrets (`PDNS_API_URL`, `PDNS_API_KEY`, `PDNS_PRIMARY_IP`, `PDNS_SECONDARY_IPS`) and a design for the tunnel.
   - None of these exist yet, and `sync-dns.yml` is unchanged.

## Operating risks

- **Idle reclamation:** Oracle may reclaim Always Free instances it considers idle, and DNS servers are idle by nature.
  - Monitor them from outside OCI and keep copies of the backups off the instances.
  - Converting the tenancy to Pay As You Go ends idle reclamation, and Always Free resources stay free. Check Oracle's current terms and set a budget alert.
- **One account is one failure domain:** two VMs in one tenancy and region give no protection against an account, billing or regional failure. Add a secondary outside OCI for real independence.
- Stagger `Unattended-Upgrade::Automatic-Reboot-Time` between ns1 and ns2.
