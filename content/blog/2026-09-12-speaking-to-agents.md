---
title: "Speaking to agents: OpenAPI, MCP, and markdown on runs-on.dev"
description: "The registry now publishes an OpenAPI spec, an MCP server, protected-resource metadata, and markdown negotiation — here is what each one is for."
date: "2026-09-12"
author: "Advance Labs"
category: "engineering"
tags: ["agents", "api", "openapi", "mcp"]
status: "published"
---

An increasing share of the traffic to sites like this one is not people — it
is agents doing homework on someone's behalf. The site now answers them
deliberately.

## The OpenAPI spec

[`/openapi.json`](/openapi.json) describes every endpoint: availability
checks, claiming, record updates, releases, swaps, deploy tokens, and the
static-site hosting API. Each operation has a stable id, typed parameters,
documented error codes, and an explicit security requirement naming its scope
(`names:claim`, `records:write`, and so on).

## The MCP server

[`/.well-known/mcp`](/.well-known/mcp) speaks Model Context Protocol over
JSON-RPC. Two tools are live: `check_name` (is this subdomain claimable?) and
`get_record` (fetch a claimed name's public registry record). Both read
public data; neither needs authentication.

## Markdown everywhere

Send `Accept: text/markdown` to any page and the site returns an agent index
instead of HTML. Unknown paths return markdown 404s that point at the sitemap
and the spec, and unknown API paths return JSON errors in a consistent shape.

## Scope discipline

The scopes an agent can hold are declared in two machine-readable places: the
OpenAPI security schemes and the RFC 9728 protected-resource document. A test
asserts the two lists never drift apart.
