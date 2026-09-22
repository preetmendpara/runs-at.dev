# Reserved-name data

These files back `lib/blocklist.js` (`isReserved`). Each is a flat JSON array of
lowercase strings, matched exactly (case-insensitive, trimmed) against a
requested subdomain name — no substring matching.

- **`reserved-infrastructure.json`** — labels the registry itself needs for
  DNS/service plumbing (`www`, `api`, `mail`, `_dmarc`, etc). Extended by pull
  request as the infrastructure grows.
- **`reserved-brands.json`** — names actually impersonated in the wild. Public
  and extended by pull request as new impersonation attempts turn up.
- **`reserved-words.json`** — an English profanity/slur blocklist, seeded from
  [LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words)
  (English list), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  Entries that can never match a valid name (they contain spaces, `&`, or other
  characters `validateName`'s grammar already rejects) are filtered out, and
  entries that collide with common given names are removed on report (e.g.
  `dick`). Extend by pull request; keep entries lowercase and grammar-valid.
