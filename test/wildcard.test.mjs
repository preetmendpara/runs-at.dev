// The *.runs-at.dev Worker, used while DNS stays on Cloudflare: it forwards a
// name's front page to /_card/<name>, which proxy.js turns into the card.
// proxy.js imports next/server, which only resolves inside Next, so its side
// is checked against a running build rather than here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.js';

async function runWorker(url, init = {}, upstream = new Response('card', { status: 200 })) {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (target, opts) => {
    calls.push({ target: String(target?.url ?? target), opts });
    return upstream;
  };
  try {
    return { res: await worker.fetch(new Request(url, init)), calls };
  } finally {
    globalThis.fetch = realFetch;
  }
}

test('worker fetches a name\'s front page from the card door, without cookies', async () => {
  const { res, calls } = await runWorker('https://alice.runs-at.dev/', { headers: { cookie: 'session=x', accept: 'text/html' } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].target, 'https://runs-at.dev/_card/alice');
  assert.equal(calls[0].opts.headers.get('cookie'), null);
  assert.equal(calls[0].opts.headers.get('accept'), 'text/html');
  assert.equal(calls[0].opts.redirect, 'manual');
  assert.equal(await res.text(), 'card');
});

test('worker sends other paths on a name to the apex', async () => {
  const { res, calls } = await runWorker('https://alice.runs-at.dev/manage?x=1');
  assert.equal(calls.length, 0);
  assert.equal(res.status, 307);
  assert.equal(res.headers.get('location'), 'https://runs-at.dev/manage?x=1');
});

test('worker strips cookies the app tries to set on a claimed name', async () => {
  const upstream = new Response('card', { headers: { 'set-cookie': 'a=b' } });
  const { res } = await runWorker('https://alice.runs-at.dev/', {}, upstream);
  assert.equal(res.headers.get('set-cookie'), null);
});

test('worker passes through the apex, www, and deeper names untouched', async () => {
  for (const url of ['https://runs-at.dev/', 'https://www.runs-at.dev/', 'https://blog.alice.runs-at.dev/']) {
    const { calls } = await runWorker(url);
    assert.equal(calls.length, 1, url);
    assert.equal(calls[0].target, url);
  }
});

test('worker refuses writes to a card', async () => {
  const { res, calls } = await runWorker('https://alice.runs-at.dev/', { method: 'POST' });
  assert.equal(res.status, 405);
  assert.equal(calls.length, 0);
});
