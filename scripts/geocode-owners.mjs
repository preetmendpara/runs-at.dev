// One-shot generator for app/components/claim-geo.js: where the people who
// claimed names are, at the coarsest useful resolution.
//
// Two sources, in order of authority:
//   1. The record's own `country` field (ISO alpha-2, captured from the
//      request IP at claim time) -> the country's centroid, from a
//      restcountries.com snapshot cached at scripts/country-centroids.json.
//   2. The public `location` string on the owner's GitHub profile ->
//      geocoded (Open-Meteo for city-style names, Nominatim as the
//      full-text fallback that understands "Surat Gujarat").
//
//   node scripts/geocode-owners.mjs
//
// Unresolvable locations (blank profiles, jokes like "127.0.0.1") are
// counted and logged, never guessed.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DELAY_MS = 120;
const NOMINATUM_DELAY_MS = 1100; // public instance etiquette: 1.1 req/s

const readEnv = () => {
  try {
    const m = readFileSync('.env.local', 'utf8').match(/^REGISTRY_TOKEN=(.+)$/m);
    if (m) return m[1].trim();
  } catch {}
  return process.env.REGISTRY_TOKEN ?? '';
};
const token = readEnv();

// --- country centroids: committed snapshot (scripts/country-centroids.json),
// built once from the gavinr/world-countries-centroids dataset (CSV parsed
// non-greedily; 244 of 249 rows survive, every spot-check passes). No API.
const CENTROID_CACHE = 'scripts/country-centroids.json';

async function centroidTable() {
  return JSON.parse(readFileSync(CENTROID_CACHE, 'utf8'));
}

const dir = join(process.cwd(), 'domains');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const records = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const uniqueLogins = [...new Set(records.map((r) => r.owner?.github).filter(Boolean))];
const countryOfLogin = new Map(records.map((r) => [r.owner?.github, r.country ?? null]));
console.log(`${records.length} claims, ${uniqueLogins.length} unique owners`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function githubLocation(login) {
  try {
    const res = await fetch(`https://api.github.com/users/${login}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body.location?.trim() || null;
  } catch {
    return null;
  }
}

// Candidate queries from a free-text location: the whole string first, then
// the pieces of compound forms. "Surat Gujarat" -> itself, "Surat",
// "Gujarat"; "Kerala/India" -> itself, "Kerala", "India". Trailing
// punctuation ("Tamil Nadu, India.") stripped everywhere.
function candidates(place) {
  const clean = place.replace(/[.,;]+$/, '').replace(/\s+/g, ' ').trim();
  const parts = clean.split(/[,/]/).map((p) => p.trim()).filter((p) => p.length >= 2);
  const tries = [clean, ...parts];
  return [...new Set(tries)];
}

async function openMeteo(q) {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const hit = (await res.json()).results?.[0];
    if (hit) return { lat: hit.latitude, lon: hit.longitude };
  } catch {}
  return null;
}

// Nominatim understands full-text queries ("West Bengal", "Osaka Japan"),
// which is exactly where Open-Meteo's name-only search falls over.
async function nominatim(q) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'runs-on-dev-claim-map/1.0' } });
    if (!res.ok) return null;
    const hit = (await res.json())?.[0];
    if (hit) return { lat: parseFloat(hit.lat), lon: parseFloat(hit.lon) };
  } catch {}
  return null;
}

// Hand-checked coordinates for the last few real places every geocoder
// refuses (misspellings): keyed on the lowercased location string exactly as
// it appears on the profile. Everything still unplaceable after this is a
// genuine 404 (jokes, IP addresses) and stays off the map.
const HAND_CHECKED = {
  'uttrakhand dehradun': { lat: 30.3165, lon: 78.0322 }, // Dehradun, Uttarakhand, India
  'koh e noor faislabad': { lat: 31.4187, lon: 73.0791 }, // Faisalabad, Punjab, Pakistan
};

async function geocode(place) {
  if (HAND_CHECKED[place.toLowerCase()]) return HAND_CHECKED[place.toLowerCase()];
  for (const q of candidates(place)) {
    const viaMeteo = await openMeteo(q);
    if (viaMeteo) return viaMeteo;
    await sleep(DELAY_MS);
  }
  // Full-text fallback, on the cleaned whole string only.
  await sleep(NOMINATUM_DELAY_MS);
  return nominatim(candidates(place)[0]);
}

const centroids = await centroidTable();
console.log(`centroid table: ${Object.keys(centroids).length} countries`);

const geoCache = new Map(); // location string -> geocoded or null
const out = {};
let fromCountry = 0;
let resolved = 0;
let noLocation = 0;
let unresolvable = [];

for (let i = 0; i < uniqueLogins.length; i++) {
  const login = uniqueLogins[i];
  const country = countryOfLogin.get(login);
  if (country && centroids[country]) {
    out[login] = centroids[country];
    fromCountry++;
    resolved++;
    continue;
  }
  const place = await githubLocation(login);
  if (!place) {
    noLocation++;
    continue;
  }
  if (!geoCache.has(place)) {
    geoCache.set(place, await geocode(place));
    await sleep(DELAY_MS);
  }
  const hit = geoCache.get(place);
  if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lon)) {
    out[login] = [hit.lat, hit.lon];
    resolved++;
  } else {
    unresolvable.push(place);
  }
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${uniqueLogins.length} (resolved so far: ${resolved})`);
}

unresolvable = [...new Set(unresolvable)].slice(0, 25);
console.log(`resolved: ${resolved} (${fromCountry} from claim-time country), no location: ${noLocation}, unresolvable: ${uniqueLogins.length - resolved - noLocation}`);
if (unresolvable.length) console.log('sample unresolvable:', unresolvable.join(' | '));

const file = `// Generated by scripts/geocode-owners.mjs. Claim-time country fields map
// to country centroids; the rest come from the public location field on each
// owner's GitHub profile (Open-Meteo, Nominatim fallback). Regenerate, do
// not hand-edit. Owners with a blank or unplaceable location are simply
// absent; GEO_RESOLVED/GEO_TOTAL keep the stats page honest about coverage.
export const CLAIM_GEO = ${JSON.stringify(out)};
export const GEO_RESOLVED = ${resolved};
export const GEO_TOTAL = ${uniqueLogins.length};
`;
writeFileSync('app/components/claim-geo.js', file);
console.log(`wrote app/components/claim-geo.js (${(file.length / 1024).toFixed(1)} KB)`);
