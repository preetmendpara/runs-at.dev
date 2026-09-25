# Claiming a name

## The flow

1. Go to [runs-at.dev](https://runs-at.dev).
2. Sign in with GitHub (`app/api/auth/github/route.js` starts the OAuth
   flow; `.../callback/route.js` completes it and sets a signed session
   cookie).
3. Type a name. The form checks availability against `GET /api/check` as
   you type (debounced, see `app/claim-form.jsx`).
4. If it's available, click "Claim it". That calls `POST /api/claim`,
   which:
   - reads your session cookie (`lib/session.js`),
   - validates the name's grammar (`lib/name.js`) and checks it against the
     reserved-name lists (`lib/blocklist.js`),
   - checks eligibility (below),
   - and writes `domains/<name>.json` directly to this repo via the GitHub
     Contents API (`lib/registry.js`), with no pull request involved.

The write is an atomic create: no `sha` is sent, so GitHub itself refuses
to overwrite a file that already exists. That's what stops two people
claiming the same name in a race: whoever's request lands first wins, and
the second gets `409 taken`. See `putRecord` in `lib/registry.js`.

Once the file exists, the name resolves immediately: `*.runs-at.dev` is a
wildcard DNS record, so there's nothing to provision. You get a profile
card built from your GitHub account until you point the name at your own
hosting (see the main [README](../README.md#point-it-at-your-own-hosting)).

## Claiming by pull request

The site is the quick path; a pull request does the same thing by hand.
Add `domains/<name>.json` naming yourself as owner and open a PR:

```json
{
  "name": "yourname",
  "owner": { "github": "your-github-login" },
  "claimedAt": "2026-01-01T00:00:00.000Z",
  "records": {}
}
```

You can set `records` in the same PR rather than claiming empty and
pointing the name in a second one.

`validateChangeset` (`lib/pr.js`) holds this to the same gates
`evaluateClaim` applies on the site, in the same order: the record must
name its own author as owner, the name must not be reserved, `claimedAt`
may not be in the future, the account must be 30 days old with a public
repository, and it must not already hold a name. Eligibility is read from
`GET /users/<login>` and the owned-name count from `domains/` at the base
commit; if either lookup fails, the check fails with it rather than
guessing.

The one thing the site gives you that a PR cannot is the atomic create.
Two PRs claiming the same name will both pass CI, and the second to merge
produces a conflict rather than a clean `409 taken`.

## Eligibility

Claiming requires, checked by `lib/eligibility.js`:

- **Your GitHub account is at least 30 days old.**
- **Your account has at least one public repository.**

Both are enforced server-side in `POST /api/claim` via `evaluateClaim`
(`lib/claim.js`), not just in the UI.

### Why these limits exist

Names cannot be un-given once claimed except by the owner releasing them or
a maintainer pulling one under [POLICY.md](../POLICY.md). Without any
barrier to entry, a script that mints fresh GitHub accounts could sweep
every short, memorable name in the registry within the first hour of
launch, and there would be no way to get any of them back short of manual
takedowns. A 30-day-old account with at least one public repo is cheap for
a real developer and expensive for a bot farm to fake at scale, which is
the actual goal: keep the barrier low for genuine users and high for a
land-grab.

### How many names an account may hold

Every eligible GitHub account gets **one included name**. The maintainer can
grant any account **extra slots**, any positive number of them, from the
admin panel at `/admin`. An account may hold `1 + adminGranted` names at
once, and every one of them belongs to that same GitHub login: signing in
once manages all of them. A slot is permission to claim, not a name. The
account still claims each extra name itself through the normal flow, and
every other rule on this page still applies to each one. A claim past the
allowance returns `403 limit_reached`. Accounts nobody has granted anything
to hold one name, exactly as before.

The authoritative record is `entitlements/<login>.json` (`lib/entitlements.js`):
`adminGranted`, plus `names`, the list of names holding a slot. A name
reserved partway through a claim is also listed in `pending`, with the time
it was reserved. An account without the file has the default of one
included name and no grants. Every change to slots goes through one
compare-and-swap on that file, re-checking the allowance against a fresh
read: claiming, releasing, swapping, granting and revoking. So two claims
from one account are applied one after the other and cannot together exceed
the allowance. A revoke can only take back slots that are not in use.

A claim reserves its slot before it writes `domains/<name>.json`, and
confirms or returns the slot afterwards. If a claim dies in between, its
reservation keeps counting. It is only reclaimed once it is older than
any claim can run, and only after `domains/` confirms that no file was
written. Held names whose file is gone (released by pull request, or
removed by moderation) are reclaimed the same way when the account is at its
limit.

`owners/<login>.json` stays a derived index, rebuilt from `domains/` by
`scripts/sync-owners.mjs` after every merge that touches a record. It is only
ever added to the count (it knows about names claimed by pull request), so a
stale, rebuilt or deleted index can never free a slot. The pull-request path
applies the same rule, using `withinNameLimit` in `lib/claim.js`. It counts
owned names from a checkout of `domains/` and reads `entitlements/` at the
**live tip** of `main` when the check runs, not at the commit the pull request was
opened against. A pull request may not change `entitlements/` itself.

A pull request that adds a name takes its slot in the entitlement record **before**
it can be merged. `.github/workflows/pr-slots.yml` runs trusted base-branch code
(`pull_request_target`, never the pull request's own code) and does three things:

- When the pull request opens or changes, it reserves the slot. The reservation is
  marked with the pull request number in `pullRequests`. It is refused, like a website
  claim, if every slot is held.
- When the pull request merges, it confirms the slot.
- When the pull request closes unmerged, it hands the slot back.

`validate` refuses a new-name pull request until that reservation is on `main`. So the
website counts the name from before the merge onward, and no website claim can use the
slot while the merge is catching up. An open pull request's slot never expires on a
timer. If its cleanup never ran, a closed, unmerged pull request's slot is reclaimed
the next time the account is at its limit. A name merged without a reservation (a
maintainer override) is still recorded when the pull request closes, so from then on
the account is counted as holding it.

A passing check can also go stale: the author might claim a name on the website after
their pull request was approved. Two things stop that stale pass being merged:

- `.github/workflows/revalidate-prs.yml` re-runs `validate` on every open pull request
  that touches `domains/` or `entitlements/` whenever either changes on `main`. The
  re-run counts at the new tip, so a pull request that no longer fits turns red.
- A branch ruleset on `main` should require the `validate` check and require pull
  request branches to be up to date before merging. Then any commit to `main` puts
  the pull request out of date, and updating it runs `validate` again. Three writers
  commit straight to `main` and need to be bypass actors: the site's `REGISTRY_TOKEN`,
  the workflow deploy key, and GitHub Actions (for `pr-slots`). While `REGISTRY_TOKEN`
  belongs to the maintainer's own account, that bypass also lets the maintainer
  override the rule by hand. Moving the token to a separate machine account removes
  that override.

Accounts that held names before `entitlements/` existed are given their file once,
by `scripts/backfill-entitlements.mjs`. It lists the names each account owns in
`domains/`, with one included slot and no grants. It never rewrites an existing file.
It prints its plan unless run with `--write`.

`MAINTAINER_PROJECT_NAMES` in `lib/claim.js` is a per-(account, name)
exemption list for the pull-request path; it is currently empty.

## Reserved names

`GET /api/check` and `POST /api/claim` both reject a name that
`lib/blocklist.js` flags as reserved, before eligibility is even checked.
Three lists back this, documented in [`data/README.md`](../data/README.md):
infrastructure names the registry itself needs, brands actually
impersonated in the wild, and an English profanity/slur list. Matching is
exact (case-insensitive, trimmed), no substring matching, so a reserved
word appearing inside a longer valid name is fine.

## Releasing a name

Delete `domains/<name>.json` in a pull request. `lib/pr.js` requires the PR
author's GitHub login to match the record's `owner.github` for a removal to
pass CI. Once merged, `scripts/sync-dns.mjs` clears any DNS records that
had been synced for that name.

## Changing a record after claiming

Claiming leaves `records` empty, which means the name serves a profile
card. Pointing it somewhere is a separate operation with its own rules,
enforced by `lib/edit.js` for both the site (`POST /api/records`, what
`/manage` posts to) and a pull request (`lib/pr.js`): only the recorded
owner may change a record, and `owner`, `claimedAt`, and `name` never
change once set. See [records.md](./records.md) for the field reference and
[architecture.md](./architecture.md) for how the write paths differ.
