---
title: "A new look for runs-on.dev"
description: "The registry has a new visual system: a darker, quieter reading experience, a proper blog, and a set of agent-readable surfaces for tools that want to integrate."
date: "2026-09-12"
author: "Advance Labs"
category: "announcement"
tags: ["redesign", "design"]
image: /blog-media/redesign-cover.png
status: "published"
---

The registry works the same. Everything around it looks different.

## A darker, quieter system

The site now runs on a near-black canvas with weight-400 type and hairline
rules that fade at their ends. Cards, inputs, and dividers share one
treatment, the topbar is sticky, and headings are set in a pixel-matrix
display face that suits a project about dot-matrix maps.

Nothing moved. Every route, every record type, and every word of policy does
the same job as before — the presentation just stopped getting in the way.

## A claim map

The stats page now shows where claimed names come from: a dot-matrix world
map with a heat layer built from owners' public GitHub profiles, plus
per-continent counts. Clicking a continent dims the rest of the world and
spotlights that region's claims.

New claims can also carry a country code, captured from the request's
edge-inferred location at the moment of the claim — country granularity only,
never a city, never an IP address, and documented on the privacy page.

## Agent-readable surfaces

A audit of how machines see the site found real gaps, so the registry now
publishes:

- an OpenAPI 3.1 spec at [`/openapi.json`](/openapi.json) covering every
  endpoint, with typed parameters and named scopes
- an MCP server at [`/.well-known/mcp`](/.well-known/mcp) with
  `check_name` and `get_record` tools
- RFC 9728 protected-resource metadata, rate-limit headers on limited
  endpoints, markdown 404s that point agents somewhere useful, and
  `Accept: text/markdown` negotiation on every page

If you build things with agents, the [agent index](/llms.txt) is the entry
point.

## What's next

This blog is where new features, fixes worth explaining, and registry
decisions get documented. An RSS feed is available at
[`/feed.xml`](/feed.xml), and everything here is in the
[public repo](https://github.com/zordhalo/runs-on.dev) as always.
