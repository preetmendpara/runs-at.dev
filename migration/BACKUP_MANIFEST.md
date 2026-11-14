# Backup manifest

Taken 2026-11-13 from commit `0a25e464f5df1b551f72c934a0b1f32d69eb45b3` (branch `feat/powerdns-migration`, based on origin/main). Working tree for the archived paths was clean (`git status --porcelain` empty).

## What and where

| File | Contents | sha256 |
| --- | --- | --- |
| `migration/backup/registry-2026-11-13.tar.gz` | `domains/` (229 json + .gitkeep), `owners/` (226 json + .gitkeep), `entitlements/` (241), `data/` (5), `schema/` (1): 704 files | `b308b90c2c802d3a24e65688d2921da657062cdaa1eae90aefe241d6ce411087` |
| `migration/backup/registry-files.sha256` | per-file sha256 of all 704 archived files | `2cd552701be2260b4fff6acbc00a9fbf950072ff7068bd05b60765db99a8ba44` |
| `migration/backup/live-dns-export.json` | live DNS from aida.ns.cloudflare.com, apex + wildcard + www/_vercel + every declared record | `69020f82b8bb85d2d192e3eb0d4994c0e35dcd3b002d448ee26baac7eb375362` |
| `migration/backup/GIT_COMMIT` | source commit SHA | - |
| `migration/backup/SHA256SUMS` | sha256 of the three files above | - |

Generator: `node migration/inventory.mjs --export` (counts + DNS export). Note: the archive is ~40 KB and the export ~73 KB; both are small enough to commit, but whether they belong in Git is the owner's call (they are a copy of data already in Git plus public DNS answers; no secrets).

## Verification output (actual)

```
EXTRACT VERIFY OK: 704 files        # extracted to mktemp dir, sha256sum -c of every file
registry-2026-11-13.tar.gz: OK
live-dns-export.json: OK
registry-files.sha256: OK
```

## Automated restore verification (actual, 2026-11-13)

`node scripts/verify-backup-restore.mjs` (default dir `migration/backup`) checks SHA256SUMS, extracts the archive into a temp dir (deleted afterwards), checks every file against `registry-files.sha256`, and compares each restored file to the git blob at `GIT_COMMIT` for domains/ owners/ entitlements/ data/ schema/ (read-only `git ls-tree`). It also parses `live-dns-export.json`. Exit is non-zero on any mismatch. `--dry-run` prints the operator restore commands without running them. Covered by `test/backup-restore.test.mjs`.

```
{
  "sha256sums": 3,
  "liveExport": "parsed",
  "restored": 704,
  "manifest": 704,
  "commit": "0a25e464f5df1b551f72c934a0b1f32d69eb45b3",
  "gitTree": 704,
  "gitMatchedByDir": { "domains": 230, "owners": 227, "entitlements": 241, "data": 5, "schema": 1 }
}
RESTORE VERIFY OK
```
domains 230 and owners 227 include one `.gitkeep` each (229 and 226 JSON files).

## Restore procedure

1. Verify: `cd migration/backup && sha256sum -c SHA256SUMS`.
2. Preferred restore is Git: `git checkout 0a25e464f5df1b551f72c934a0b1f32d69eb45b3 -- domains owners entitlements data schema`.
3. If Git history is unavailable: on a fresh branch at repo root, `tar -xzf migration/backup/registry-2026-11-13.tar.gz`, then `sha256sum -c --quiet migration/backup/registry-files.sha256`, then `npm test`, then PR to main (never force-push).
4. DNS for claims is regenerated from `domains/*.json` by `sync-dns` on merge. Zone records that are NOT in the registry (apex A, MX, TXT, www CNAME, wildcard Worker route) must be recreated manually from `live-dns-export.json` (see BASELINE_INVENTORY.md, "Records outside the registry").
