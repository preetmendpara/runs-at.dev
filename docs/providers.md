# Provider compatibility

Where a claimed name can point, and what actually works. Rows are marked
**tested** when a live claim on this registry proves them, and **untested**
when the mechanism should hold but nobody has shown it yet. The scheduled
`health-check` workflow re-proves the tested rows daily and fails loudly the
moment a pointed name starts answering with the profile card again.

| Provider | Records | Status | Notes |
| --- | --- | --- | --- |
| Vercel | `CNAME` + `_vercel` TXT | **tested broken → fixed by the zone mirror** | Vercel reads its ownership challenge from `_vercel.runs-on.dev` (zone level) whenever the apex sits in a Vercel account, which no claim file can express. Before the mirror, every Vercel-pointed name resolved, answered 200 with a valid certificate, and still served the profile card (issue #26). `sync-dns` now mirrors each claim's `_vercel` TXT to the zone-level host. |
| URL redirect (any target) | `URL` | **tested** | Served by the registry itself off the wildcard, so no provider-side verification exists to fail. The address bar ends at the target. |
| GitHub Pages | `CNAME` → `<you>.github.io`, plus the `CNAME` file in the Pages repo | **untested** | GitHub runs no ownership challenge for subdomains, so the standard Pages setup should work unchanged. |
| Netlify | `CNAME` → `apex-loadbalancer.netlify.com` | **untested** | Same foreign-apex risk class as Vercel: if Netlify demands proof at a zone-level host, a claim file cannot place it. |
| Cloudflare Pages | `CNAME` → `<project>.pages.dev` | **untested** | Same risk class; custom-hostname activation reads a TXT that may need to live above the claim. |
| Railway / Render / Replit / Firebase | see [`guides.md`](guides.md) | **untested** | Guides exist; no live claim demonstrates each provider's challenge behavior. |

The rule the table encodes: **a provider that verifies ownership by reading
a record at a zone-level host cannot be satisfied by a claim file**, because
`subdomains` only ever reaches `<label>.<name>.runs-on.dev`. If a provider
you use demands one, open an issue — the `_vercel` zone mirror in
`scripts/sync-dns.mjs` is the template for giving that provider's label the
same treatment.
