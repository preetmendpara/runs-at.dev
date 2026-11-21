# Baseline inventory: runs-at.dev (2026-11-13)

Source commit `0a25e464f5df1b551f72c934a0b1f32d69eb45b3`. All counts below come from `node migration/inventory.mjs` reading the files on disk. All DNS answers come from `migration/backup/live-dns-export.json`, queried directly against aida.ns.cloudflare.com (SOA serial 2419899443).

## Architecture

- **App**: Next.js 16 on Vercel. `vercel.json` disables Git deployments. Production deploys come from `.github/workflows/deploy.yml` (`npx vercel@59.26.0 deploy --prod` with `VERCEL_TOKEN`).
- **Auth**: GitHub OAuth (`app/api/auth/github`, `.../callback`, `app/api/auth/signout`). The session is an HMAC-SHA256-signed `__Host-session` cookie (`lib/session.js`, `SESSION_SECRET`, 24 h TTL). `/admin` is gated in `proxy.js` via `lib/admin.js`. Site API tokens are issued by `app/api/tokens` (`SITE_TOKEN_SECRET`).
- **Source of truth**: the Git registry in this repo: `domains/<name>.json` (claim and records), `owners/<login>.json` (per-account index), `entitlements/<login>.json` (allowance, pending, PR slots, history). Server writes go through the GitHub contents API (`lib/registry.js`, `REGISTRY_TOKEN`). Card reads use `CARD_TOKEN`. Build-time reads use `lib/registry-files.js` off disk.
- **Claim flow**: `POST /api/claim` checks the session, eligibility (`lib/eligibility.js`), the reserved lists (`lib/blocklist.js`, `data/reserved-*.json`) and the per-account limit (`lib/claim.js`, `lib/owners.js`, `lib/entitlements.js`), then calls `putRecord`. `putRecord` creates with no `sha`, so GitHub refuses an overwrite; a 409 or 422 maps to "exists".
- **Edit flow**: `POST /api/records` runs `validateEdit` (only the recorded owner may edit; `name`, `owner` and `claimedAt` are immutable), then `putRecordUpdate`, which does a compare-and-swap on `sha`. Edits are throttled to 12 writes per 10 minutes per account (in memory).
- **Release flow**: `POST /api/release` checks the session, a typed-name confirm, a 2-per-hour limit and the owner (`owner.github` must equal the session login). It then deletes the file with its `sha`, updates the owner index and calls `releaseSlot`. sync-dns then clears the DNS.
- **PR flow**: `validate.yml` (pull_request_target, base checkout) runs `lib/pr.js` `validateChangeset` / `validateNewClaim`.
- **Record storage**: `records` holds {CNAME, A, AAAA, TXT, MX, URL} at the claim. `subdomains.<label>` holds {CNAME, A, AAAA, TXT, MX}, at most 10, with `_x.label` nesting allowed. `URL` is an app-level redirect served off the wildcard and plans **no** DNS record (`lib/dns.js` `planFor`).

## How DNS changes deploy

1. A push to `main` touching `domains/**` starts `sync-dns.yml`.
2. That runs `scripts/sync-dns.mjs` with `DNS_PROVIDER: cloudflare` (the default; the Vercel path is kept) and the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID`.
3. The script:
   - lists the whole zone;
   - diff-reconciles each changed name (`reconcileDnsRecords`, with rollback on a failed create);
   - sweeps the whole registry for drift (`planSweep`, which refuses to act on more than 25 drifted names);
   - mirrors each claim's own `_vercel` `vc-domain-verify=<name>.runs-at.dev,...` TXT to `_vercel.runs-at.dev`. The cap is 50; overflow goes to `prune-verification.yml`.

Records are created DNS-only (grey cloud) with TTL 300.

**Provider receiving changes: Cloudflare** (zone `runs-at.dev`, NS aida/damon.ns.cloudflare.com).

## Root, wildcard and system records (live, not in the registry)

| Host | Type | Live answer | Managed by |
| --- | --- | --- | --- |
| runs-at.dev | SOA | aida.ns.cloudflare.com dns.cloudflare.com 2419899443 10000 2400 604800 1800 | Cloudflare |
| runs-at.dev | NS | aida.ns.cloudflare.com, damon.ns.cloudflare.com | Cloudflare / registrar |
| runs-at.dev | A | 2 values (Vercel) | manual |
| runs-at.dev | AAAA | none | - |
| runs-at.dev | MX | 3 values (Cloudflare Email Routing) | manual |
| runs-at.dev | TXT | 3 values (SPF for Email Routing, a site-verification value, one unidentified value) | manual |
| runs-at.dev | CAA | none | - |
| www.runs-at.dev | CNAME | 1 value (Vercel) | manual |
| *.runs-at.dev | A/AAAA | proxied: 2 A + 2 AAAA (Cloudflare edge) | manual, plus `cloudflare/worker.js` on route `*.runs-at.dev/*` |
| _vercel.runs-at.dev | TXT | 1 value (vc-domain-verify mirror) | sync-dns mirror |

The wildcard is proxied and answered by a Cloudflare Worker. The Worker fetches `runs-at.dev/_card/<name>`, and `proxy.js` rewrites that to `/sites/<name>`. Reserved infrastructure labels in `data/reserved-infrastructure.json` (www, api, mail, mx, ns1-4, _dmarc, _acme-challenge and others) cannot be claimed. DNSSEC: the zone is signed but there is no DS at the registry, so the delegation is unsigned.

## Counts (exact, from files)

| Item | Count |
| --- | --- |
| Claims (`domains/*.json`) | 229 |
| Owners (`owners/*.json`) | 226 (names referenced: 229) |
| Entitlements (`entitlements/*.json`) | 241 |
| Claims with no records and no subdomains (card only) | 73 |
| Claims with subdomains | 29 |
| Subdomain entries | 46 |

- Record keys (values) at the claim root: CNAME 125 (125), A 11 (16), TXT 7 (8), MX 5 (10), URL 11 (11), AAAA 0.
- Record keys (values) in subdomains: TXT 35 (35), CNAME 9 (9), A 2 (2).
- DNS records planned by `planDnsChanges` across the registry: **205** (CNAME 134, TXT 43, A 18, MX 10). URL is excluded by design.

## Live vs declared

I checked 194 (fqdn, type) groups, 205 values in all, against aida.ns.cloudflare.com. Result: **178 live, 0 partial, 16 missing (16 values)**:

```
_amvera.ebmc TXT                              abdulloh CNAME
_cf-custom-hostname.xinniankuaile TXT         admin.jaku CNAME
_dmarc.send.chase-notify TXT                  adsimple.adsimple CNAME
_openai-site-verification.xinniankuaile TXT   ashenwings CNAME
_vercel.adsimple TXT                          aureon CNAME
dsa-visualizer CNAME                          ebmc CNAME
free-manner CNAME                             haxnonroot CNAME
mail.ofcstream A                              xinniankuaile CNAME
```

The missing CNAMEs currently resolve to the proxied wildcard, so they show the profile card instead of the owner's host. 189 live claim records plus about 10 system records is consistent with a zone cap of about 200 records. That is an inference: the Cloudflare plan is not visible from this machine.

## Workflows and failure causes

| Workflow | Status | Cause (from workflow/script source) |
| --- | --- | --- |
| `sync-dns.yml` | failing every run | The `createRecord` POST returns `400 Record quota exceeded` because the zone is at its record limit. Any name that needs a create fails, `syncEach` adds it to `failed`, and the script exits 1 (`could not sync ...`). The sweep and health-check repair retry the same drifted names, so the runs stay red. |
| `revalidate-prs.yml` | failing | For each open PR touching `domains/` or `entitlements/`, `scripts/rerun-validate.sh` finds the *latest* validate run and calls `gh run rerun`. GitHub refuses reruns of runs older than a month ("Unable to retry this workflow run because it was created over a month ago"). `set -euo pipefail` in both the step and the script turns that one stale PR into a failed job and aborts the loop for the remaining PRs. Fix: continue on a rerun failure, or skip runs older than 30 days. |
| `health-check.yml` | `repair` job failing | `check` probes the pointed names and emits `drifted` (declared records missing from DNS). `repair` calls `sync-dns.yml` via `workflow_call` with those names. Named names are fatal on failure, so the quota error turns the job red. The root cause is the same quota. |
| `deploy.yml`, `validate.yml`, `test.yml`, others | not reported failing | read only, not investigated further |

## Credentials required (names only; no values are held locally)

- **GitHub Actions secrets (exist):** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `REGISTRY_DEPLOY_KEY`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
- **Vercel runtime env (referenced in code):** `SESSION_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `REGISTRY_TOKEN`, `CARD_TOKEN`, `SITE_TOKEN_SECRET`, `ADMIN_TOKEN`, `GITHUB_WEBHOOK_SECRET`, `BLOB_READ_WRITE_TOKEN`, `BLOB_STORE_ID`, `APP_ORIGIN`.
- **For a PowerDNS/OCI migration (none present on this machine):** an Oracle Cloud API key plus tenancy/compartment OCIDs, an SSH key for the hosts, a PowerDNS API key, and an account at a registrar that permits custom NS and glue records.

## Risks

1. **Registrar lock (blocker).** The registrar is Cloudflare Registrar, which does not allow custom nameservers. Delegating to ns1/ns2.runs-at.dev needs a registrar transfer first, and transfer locks may apply. Production cutover is blocked until then.
2. **Provisioning blocked.** There are no OCI credentials, CLI, Terraform/OpenTofu or SSH keys on this machine, so any IaC is unapplied.
3. **The wildcard depends on the Cloudflare proxy and Worker.** Leaving Cloudflare DNS removes the Worker, so the wildcard would have to point at Vercel. Vercel only issues wildcard certificates for zones on Vercel nameservers. Without a replacement (our own TLS terminator, or Vercel NS), card serving for the 73 card-only names and every unclaimed label breaks.
4. **Email.** The apex MX and SPF use Cloudflare Email Routing. Moving DNS keeps the records, but Email Routing is a Cloudflare service and would also need replacing.
5. **DNSSEC.** The zone is signed but has no DS. Moving is safe now; do not add a DS until the new provider signs the zone.
6. **Ongoing drift.** 16 declared records are not live today. Any new claim that needs DNS will also fail until quota is freed or the zone moves.
7. **Records outside the registry.** The apex A/MX/TXT, www and wildcard records are managed by hand and captured only in `live-dns-export.json`. The purpose of the 40-hex apex TXT is unknown.
