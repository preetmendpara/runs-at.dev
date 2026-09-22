# Moderation

This directory is the public record of comment moderation on this repository.

The registry keeps no hidden database, and moderation is held to the same
standard: if the bot removes something in the maintainers' name, what it
removed is recorded here where anyone can audit it.

## Contents

| Path | What it is |
|------|------------|
| `log.jsonl` | Append-only. One JSON object per comment removed. |
| `../data/spam-patterns.json` | The patterns that mark a comment as spam. |
| `../scripts/moderate-spam.mjs` | The sweep. |
| `../.github/workflows/moderate.yml` | Runs it every 30 minutes and on each new comment. |

## How it works

Three steps, in this order:

```
archive  ->  commit + push log.jsonl  ->  enforce
```

`archive` writes a tombstone for every spam match. The workflow commits it.
Only then does `enforce` delete, and only comments the log already accounts
for. Deleting first would mean any crash or timeout in the gap destroys the
only copy of what was said. Losing a delete is recoverable -- the next sweep
catches it thirty minutes later. Losing the body is not.

Each tombstone stores the comment body verbatim, its author and author id, the
thread, the comment URL, both timestamps, and which pattern matched.

## Adding a pattern

Edit `data/spam-patterns.json` and open a pull request. The sweep reads the
file on every run, so a merged pattern takes effect on the next tick with no
deploy. Prefer explicit domain literals over heuristics: the bot blocks on a
first match, which is only defensible while a match cannot happen by accident.

## Why this exists

On 2026-09-03, four contributor pull requests received unsolicited comments
advertising a competing subdomain service. Each comment copied this
repository's own pull request checklist back into the thread, then appended a
promotional link. The affected threads:

| PR | Title | Opened by |
|----|-------|-----------|
| [#60](https://github.com/zordhalo/runs-on.dev/pull/60) | Update ansh.json | @AnshShinde2007 |
| [#61](https://github.com/zordhalo/runs-on.dev/pull/61) | Add URL record to animcin.json | @animcin84-dev |
| [#76](https://github.com/zordhalo/runs-on.dev/pull/76) | Remove shanu | @Shanu-Kumawat |
| [#78](https://github.com/zordhalo/runs-on.dev/pull/78) | Remove viberoulette | @Kxrbx |

Every pull request in this registry is a person completing a signup. Comments
that intercept them mid-claim to redirect them elsewhere are the specific
thing this tooling exists to stop.

Those four comments were removed before the log existed, so they are not in
`log.jsonl`; that gap is what prompted archiving in the first place. They
remain attributable through GitHub's search index:

```
repo:zordhalo/runs-on.dev commenter:<account>
```

## Scope

This record documents comment spam. It makes no claim about anyone's source
code. Free subdomain registries are a long-established category -- this
project's own README cites is-a.dev, js.org, and eu.org as prior art -- and a
competing service existing is not misconduct. Advertising it on a
contributor's pull request is.

Removals here are not accusations of anything beyond what the log shows.
Anyone who believes a comment of theirs was removed in error can open an
issue; the tombstone preserves the full text, so the question can be settled
by reading it rather than by recollection.
