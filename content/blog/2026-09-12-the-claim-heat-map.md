---
title: "The claim heat map, and what the dots mean"
description: "How the new world map on the stats page is built, where its coordinates come from, and what the 404 row is for."
date: "2026-09-12"
author: "Advance Labs"
category: "engineering"
tags: ["stats", "map", "data"]
status: "published"
---

The stats page has a new world map: a dot-matrix earth where brighter, larger
dots mark regions with more claimed names. This is how it is built, and what
it deliberately does not claim to know.

## Where the coordinates come from

Two sources, in order of trust. Some owners write a location on their public
GitHub profile — that string is geocoded once against Open-Meteo and cached.
Newer claims also record a country code at the moment of the claim, taken
from the request's edge-inferred location: country granularity only, never a
city, never an IP address.

## The 404 row

Many owners have no location on their profile at all. The map counts them
honestly in a "404 not found" row instead of guessing. That row being large
is the point: a map that says "I know where 219 of 575 of you are, and I
refuse to invent the rest" is worth more than a fully-lit world with quiet
asterisks.

## Regenerating

The dataset is committed (`app/components/claim-geo.js`) and rebuilt by
`scripts/geocode-owners.mjs`. Nothing about it is fetched at request time,
so the stats page stays static, fast, and free.
