# Troubleshooting

## sync-dns fails with `400 Record quota exceeded` (Cloudflare)

**Symptom:** every run of `.github/workflows/sync-dns.yml` fails, and the repair job in `health-check.yml` fails too, because it calls sync-dns with the drifted names. At the audit, 16 declared records were not live, among them the CNAMEs for abdulloh, ashenwings, aureon, dsa-visualizer, ebmc, free-manner, haxnonroot and xinniankuaile. The full list is in `migration/BASELINE_INVENTORY.md`.

**Cause:** the zone hit Cloudflare's per-zone record limit. The limit is about 200 by inference (189 live claim records plus about 10 system records); the plan's exact limit could not be seen. The script collects the failing names and exits 1, and the drift sweep keeps retrying the same names, so runs stay red.

**Fixes (pick one):**
1. Short term: ask Cloudflare to raise the record limit, or move to a plan with a higher one. No code change needed.
2. Free up records: remove records for released or abandoned claims (through the registry, never by hand), or check whether the `_vercel` mirror TXT values (capped at 50) are all still needed.
3. Long term: move the zone off Cloudflare ([dns-migration](dns-migration.md)). This is blocked on the registrar transfer and on provisioning.

Not recommended: making sync-dns ignore the error. That would hide the fact that claims are not published.

## revalidate-prs fails with "Unable to retry this workflow run because it was created over a month ago"

**Cause:** `scripts/rerun-validate.sh` ran `gh run rerun` on the latest `validate` run for each PR. GitHub refuses to re-run runs older than 30 days, and `set -euo pipefail` let one such PR stop the whole loop.

**Fix (in the migration worktree, not yet committed):**
- `rerun-validate.sh` now reads the run's `created_at`. It dispatches a fresh `validate.yml` run for the PR (`gh workflow run validate.yml -f pr=<n>`) when:
  - the run is 29 days old or more
  - there is no earlier run
  - GitHub refuses `gh run rerun`
- `revalidate-prs.yml` records failures and carries on with the other PRs, then fails at the end with the list.
- This depends on `validate.yml` accepting a `pr` dispatch input, which is also changed in the worktree. Two tests in `test/backfill.test.mjs` fail against that changed `validate.yml`; fix them before merging.

## PowerDNS (after provisioning)

| Symptom | Check |
| --- | --- |
| ns2 serial behind ns1 | Read `/var/log/check-dns.log` and run `pdnsutil show-zone runs-at.dev` on ns1. Check that the TSIG name and secret match on both (`pdnsutil list-tsig-keys`) and that the security list allows port 53 between 10.53.1.11 and 10.53.1.12 |
| `verify-parity --server` reports missing records | Was the zone reloaded? Run `pdnsutil increase-serial runs-at.dev` and `pdnsutil rectify-zone runs-at.dev` |
| sync-dns (powerdns) gets a 4xx | Wrong API key or zone name. 4xx responses are not retried; 5xx and network errors are retried with backoff |
| sync-dns refuses the plan | It would delete more than 25 RRsets. Inspect it with `PDNS_DRY_RUN=1` |
| A change is "refused" in the plan | The target is the apex, the wildcard, SOA or NS, or a reserved label (`data/reserved-infrastructure.json`). This is by design |
| An instance is gone or stopped | Possibly Always Free idle reclamation. Check the OCI console and notifications, then rebuild from Git ([backup-restore](backup-restore.md)) |
| Both servers are down | One OCI account and region is a single failure domain. Roll back ([rollback](rollback.md)) |

## export-zone exits 1: NS1_IPV4/NS2_IPV4 must be set

Set the real glue IPs. `--placeholder-glue` is for tests only.
