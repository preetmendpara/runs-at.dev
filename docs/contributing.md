# Contributing

## Adding to the blocklists

Reserved names live in `data/` as flat, lowercase JSON arrays, matched
exactly (case-insensitive, trimmed, no substring matching) by
`lib/blocklist.js`. See [`data/README.md`](../data/README.md) for what each
file is for:

- `data/reserved-infrastructure.json`: names the registry itself needs
  (`www`, `api`, `mail`, `_dmarc`, and similar).
- `data/reserved-brands.json`: names actually impersonated in the wild.
- `data/reserved-words.json`: the English profanity/slur list, seeded from
  [LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words)
  (CC BY 4.0). Entries that can never match a valid name (spaces, `&`, or
  anything `lib/name.js`'s grammar already rejects) are filtered out, and
  entries that collide with common given names are removed on report.

Send blocklist changes as their own pull request, separate from any
`domains/` change. They go through a different validation path
(`npm test`'s `blocklist.test.mjs`), not `lib/pr.js`'s `validateChangeset`.
Keep entries lowercase and grammar-valid, one per line, sorted where the
existing file already is.

## Running tests

```bash
npm install
npm test
```

This runs every file under `test/**/*.test.mjs` with Node's built-in test
runner (`node --test`). As of this writing that's 98 tests covering the
record schema (including `MX`, `URL`, and `subdomains`), the name grammar,
eligibility and the per-account claim limit, PR validation, DNS planning,
session signing, and the blocklist. No build step or running server is
required. The suite exercises the library functions directly.

## What CI checks

Three workflows, all under `.github/workflows/`:

- **`test.yml`** runs on every pull request: `npm test`, then `npm run
  build` to catch anything the test suite wouldn't (a broken import, a
  React error at build time).
- **`validate.yml`** runs on pull requests that touch `domains/**`. It
  checks out the PR's *base* branch (not the PR's own code, see
  [docs/architecture.md](./architecture.md#the-two-write-paths-into-domains))
  and runs `scripts/validate-pr.mjs`, which calls `lib/pr.js`'s
  `validateChangeset` against the actual PR diff over the GitHub API.
- **`sync-dns.yml`** runs on pushes to `main` that touch `domains/**`
  (i.e., after a PR merges), and pushes the resulting DNS changes to
  Vercel. It doesn't gate pull requests; it's what makes a merged record
  change take effect.

### What `validateChangeset` actually enforces

`lib/pr.js`'s `validateChangeset` is what `validate.yml` runs against every
`domains/**` pull request. As of this writing it checks:

- **Exactly one file** may change per pull request.
- **The path** must match `domains/<name>.json`, and the name inside the
  file must match the filename.
- **Renaming a record is refused outright.** A rename arrives as a single
  file entry carrying only the new path, which would otherwise let anyone
  rename someone else's record into a name they own with no ownership
  check at all; `validateChangeset` rejects any changeset flagged
  `renamed` or carrying a `previous_filename`, before it looks at anything
  else.
- **Removing a record** is allowed only for its recorded owner (or a
  maintainer, per [POLICY.md](../POLICY.md)); `validateChangeset` compares
  the PR author's GitHub login against `owner.github` on the file being
  removed.
- **Editing a record** is allowed only for its recorded owner, and
  `owner`/`claimedAt` can never change by pull request, even for the
  owner, only set once at claim time.
- **Creating a record** is allowed, and is held to exactly the gates
  `POST /api/claim` applies through `evaluateClaim`, in the same order:
  the record must name its own author as `owner.github` (compared
  case-insensitively, since GitHub logins are unique that way), the name
  must not be reserved, `claimedAt` may not be in the future, the account
  must pass `lib/eligibility.js` (30 days old, one public repository), and
  it must not already own a name. A pull request is a second front door
  onto the same registry, so any gate it checked less strictly would
  simply become the way around that gate.
- **Both claim lookups fail closed.** Eligibility comes from
  `GET /users/<login>` and the owned-name count from scanning `domains/`
  at the base commit; if either cannot be read, `validateChangeset`
  reports "could not check" and the PR fails. A rate-limited check must
  never read as "eligible" or "owns nothing", because load is exactly when
  a land grab happens — the same reasoning `POST /api/claim` uses when it
  answers busy rather than letting an uncounted claim through.
- The record itself must still pass `lib/schema.js`'s `validateRecord` and
  `lib/name.js`'s `validateName`.

If you're changing `lib/pr.js`, `lib/schema.js`, `lib/name.js`, or anything
else those two gating workflows depend on, add or update a test in `test/`
alongside the change. That's what `npm test` in `validate.yml` and
`test.yml` will actually run against your PR.
