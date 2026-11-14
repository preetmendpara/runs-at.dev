# Registry reconciliation

Generated from the working tree by `node migration/reconcile.mjs` (full detail:
`--json`, also written to `migration/reports/reconciliation.json` by
`node migration/destination-map.mjs`). Every number below is from that output.
Tests: `test/migration-reconcile.test.mjs`.

## Counts

| | Count |
|---|---|
| domains/*.json (claims) | 229 |
| owners/*.json | 226 |
| entitlements/*.json | 241 |
| Distinct domain owners (owner.github, lowercased) | 226 |
| Names listed across owners files | 229 |
| Names listed across entitlement files | 237 (229 owned + 8 PR reservations without a domain yet) |
| Owners with an entitlement file | 226 |
| Owners without an entitlement file | 0 |
| Entitlement files without an owners file | 15 |
| Entitlements with adminGranted > 0 | 2 |
| Website reservations (`pending`) | 0 |
| Pull-request reservations (`pullRequests`) | 9 |
| Genuine anomalies | **0** |
| Expected-by-design discrepancies | 24 |

## domains vs owners: fully consistent

Every claim's `owner.github` has an `owners/<login>.json` listing that name;
no owners file lists a name with no domain file or a name owned by someone
else; no name appears in two owners files; no filename/`name` or
filename/`github` mismatch in any of the three directories. This matches
`scripts/sync-owners.mjs`, which rebuilds owners/ from domains/ and deletes
files for logins that no longer hold a domain.

## Why 241 entitlements vs 226 owners (15 extra, all expected)

Entitlement files are never deleted: `releaseSlot`, `settleSlot` and
`closePullRequestSlot` (lib/entitlements.js) only remove names, because
`adminGranted` and `history` must survive. owners/ is a derived index that is
deleted when a login holds no domain. So:

- **7** entitlement files with `names: []` (released, returned, or PR closed
  unmerged): anthonyrichardstark, bhwcommu-eng, iocmet, kfireew,
  mostly-carbon, odii1485, osintttdemonnnnn. All have adminGranted 0 and empty
  history.
- **8** entitlement files whose only name is a pull-request reservation with no
  domain file yet (`reservePullRequestSlot`; held until the PR closes):
  4104182/ai-business-suite #21, abiysetargew/abiysetargew #25,
  chasmet/sync30 #9, genalyncenena-sudo/feona-jae-invitation #26,
  saadopencode1/aster #20, tswetc/influenceros #11, zorvantex/zorvantex #7,
  zxc20057423/line-ai-bookkeeping #10. These are the same 8
  `entitlement-name-without-domain` entries.

## Other expected discrepancies

- **1** reservation mark on an existing domain: kai88-change/kumagai still
  carries `pullRequests: 19` although domains/kumagai.json exists and is theirs
  (PR still open, or merged before the close workflow cleared the mark).
  `staleSlots` confirms and clears it on the next limit check.
- No entitlement lists a name owned by another account (that would be a stale
  slot reclaimed by `staleSlots`; none found).
- No owned name is missing from its owner's entitlement (would be covered by
  `heldNames()` unioning the owners index; none found).

## Migration impact

None of owners/ or entitlements/ moves: PowerDNS stores no users. All 229 + 226
+ 241 registry files stay in Git unchanged. See
`migration/reports/source-vs-destination.md` for the DNS mapping.
