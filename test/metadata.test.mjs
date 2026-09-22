import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardMetadata } from '../lib/metadata.js';

const record = { name: 'shrey', owner: { github: 'satanrayshe' } };
const profile = { name: 'Shrey', bio: 'Building things.', avatar_url: 'https://x/y.png' };

test('points the canonical at the name, not the registry apex', () => {
  // The root layout sets metadataBase to https://runs-on.dev, so a relative
  // canonical would resolve to the apex and tell crawlers every card is the
  // same page. These have to be absolute to the subdomain.
  const m = cardMetadata({ name: 'shrey', record, profile });
  assert.equal(m.alternates.canonical, 'https://shrey.runs-on.dev');
  assert.equal(m.openGraph.url, 'https://shrey.runs-on.dev');
});

test('bypasses the title template so the suffix is not doubled', () => {
  // Layout template is '%s — runs-on.dev'; a plain string title would render
  // 'shrey.runs-on.dev — runs-on.dev'.
  const m = cardMetadata({ name: 'shrey', record, profile });
  assert.equal(typeof m.title, 'object');
  assert.ok(m.title.absolute.includes('shrey.runs-on.dev'));
  assert.ok(!m.title.absolute.includes('— runs-on.dev'));
});

test('carries the owner name into the title when GitHub has one', () => {
  const m = cardMetadata({ name: 'shrey', record, profile });
  assert.equal(m.title.absolute, 'Shrey (shrey.runs-on.dev)');
});

test('falls back to the hostname alone when GitHub has no display name', () => {
  const m = cardMetadata({ name: 'shrey', record, profile: { bio: 'hi' } });
  assert.equal(m.title.absolute, 'shrey.runs-on.dev');
});

test('uses the bio as the description when there is one', () => {
  const m = cardMetadata({ name: 'shrey', record, profile });
  assert.equal(m.description, 'Building things.');
});

test('describes the name when there is no bio', () => {
  for (const p of [null, {}, { bio: '   ' }, { bio: null }]) {
    const m = cardMetadata({ name: 'shrey', record, profile: p });
    assert.ok(m.description.includes('shrey.runs-on.dev'), JSON.stringify(p));
    assert.ok(m.description.includes('satanrayshe'), JSON.stringify(p));
  }
});

test('overrides the twitter tags rather than inheriting the registry ones', () => {
  // X prefers twitter:* over og:*, so leaving these unset is what made every
  // claimed name unfurl as 'runs-on.dev — free subdomains'.
  const m = cardMetadata({ name: 'shrey', record, profile });
  assert.equal(m.twitter.title, m.title.absolute);
  assert.equal(m.twitter.description, m.description);
  assert.ok(!m.twitter.title.includes('free subdomains'));
});

test('marks the card as a profile, not a website', () => {
  const m = cardMetadata({ name: 'shrey', record, profile });
  assert.equal(m.openGraph.type, 'profile');
  assert.equal(m.openGraph.siteName, 'runs-on.dev');
});

test('survives a record with no profile fetched at all', () => {
  const m = cardMetadata({ name: 'lucas', record: { owner: { github: 'zordhalo' } }, profile: null });
  assert.equal(m.title.absolute, 'lucas.runs-on.dev');
  assert.equal(m.alternates.canonical, 'https://lucas.runs-on.dev');
});

test('collapses whitespace in a multi-line bio', () => {
  const m = cardMetadata({ name: 'shrey', record, profile: { bio: 'one\n\ntwo   three' } });
  assert.equal(m.description, 'one two three');
});
