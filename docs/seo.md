# SEO on a runs-on.dev name

To a search engine, `you.runs-on.dev` is its own site. It gets indexed on
its own, ranks on its own, and starts with none of the registry's
reputation. Nothing about sitting under `runs-on.dev` helps or hurts you;
the name has to earn its own links like any other host.

That cuts both ways, and which way depends entirely on which record type
you use. The same material renders on the site at
[`/docs/seo`](https://runs-on.dev/docs/seo).

## Redirect names cannot rank

A `URL` record sends visitors somewhere else with a 307:

```json
"records": { "URL": "https://github.com/you" }
```

Nothing is served at your name, so there is nothing to index. The 307 is
also deliberately temporary (see
[docs/records.md](./records.md#url-redirects)), which means search engines
keep treating your name as the canonical rather than passing its signals
to the target. A permanent 301 would consolidate them, but it would also
be cached by browsers indefinitely and strand every visitor the day you
repoint the name.

So use a redirect because it is a short address you can hand to people,
not because you expect it to rank. If you want the target to rank, link
people to the target.

## Hosted names can rank fully

Point the name at a host you control and you serve every byte, so every
ordinary SEO lever is yours:

```json
"records": { "CNAME": "cname.vercel-dns.com" }
```

Titles, descriptions, structured data, internal links, page speed. The
registry is not in the request path at all once DNS resolves. See
[docs/guides.md](./guides.md) for the record each provider wants.

## robots.txt and sitemaps are per host, not per domain

This is the one that catches people. `robots.txt` is scoped to a single
hostname. `https://runs-on.dev/robots.txt` says nothing at all about
`you.runs-on.dev`, and you cannot inherit it, edit it, or be blocked by
it.

Serve your own:

```
https://you.runs-on.dev/robots.txt
https://you.runs-on.dev/sitemap.xml
```

and reference the sitemap by its full URL on your own host:

```
User-Agent: *
Allow: /

Sitemap: https://you.runs-on.dev/sitemap.xml
```

A name with no hosting has no `robots.txt` of its own and returns 404 for
it, which crawlers read as "no restrictions".

## Pick one canonical

If the same pages live at both `you.runs-on.dev` and `yoursite.com`,
search engines have to guess which one is the real address, and they will
split the signals while they do it. Say it explicitly with a canonical
link on every page.

If the runs-on.dev name is the only home for the content, point it at
itself:

```html
<link rel="canonical" href="https://you.runs-on.dev/about">
```

If it mirrors a site you already run, point it at that site instead, and
be consistent on every page rather than mixing the two.

## Verifying in Search Console and Bing

Add `https://you.runs-on.dev` as its own property. It will not appear
under a property for `runs-on.dev`, and you cannot verify the registry
domain itself.

A URL-prefix property verified by an HTML file or meta tag is the simplest
route when you are hosting real content. If you would rather verify by
DNS, a `TXT` record on your own name works:

```json
"records": {
  "CNAME": "cname.vercel-dns.com",
  "TXT": ["google-site-verification=your-token-here"]
}
```

For a token that has to sit on an underscore label, use `subdomains`:

```json
"subdomains": {
  "_acme-challenge": { "TXT": ["your-token-here"] }
}
```

`TXT` coexists with `A` and `MX` but never with `CNAME` at the same label.
[docs/records.md](./records.md#why-cname-cant-coexist-with-other-record-types)
explains why.

## HTTPS is already handled

`.dev` is on the HSTS preload list as a whole TLD, with `force-https` and
`include_subdomains` set. Browsers upgrade every `*.runs-on.dev` request
to HTTPS before it leaves the machine, and the registry sends
`Strict-Transport-Security` on top of that.

The practical effect is that you never have an `http://` copy of your site
competing with the `https://` one, which is a duplicate-URL problem you
would otherwise have to redirect your way out of.

## The profile card is not an SEO surface

A claimed name with no records is served a profile card off the wildcard.
Each card carries its own title, description and canonical, so it can be
indexed as its own page, but it is still one short page about a name.
Point the name at real hosting if you want something that competes in
search.

## One limitation worth knowing

`runs-on.dev` is not on the [Public Suffix List](https://publicsuffix.org)
yet. Until it is, a cookie scoped to `.runs-on.dev` is readable by every
other name in the registry.

Scope your cookies to `you.runs-on.dev` and nothing broader, and do not
put session tokens or anything else sensitive in a cookie set above your
own host.

## Checklist

- Hosting, not a redirect, if you want to rank.
- Your own `robots.txt` and `sitemap.xml`, on your own host.
- One canonical, declared on every page.
- Its own Search Console and Bing property.
- Cookies scoped to your name only.
