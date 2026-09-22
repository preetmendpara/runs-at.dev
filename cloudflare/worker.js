// Cloudflare Worker for *.runs-at.dev.
//
// runs-at.dev's DNS lives on Cloudflare, and Vercel only issues wildcard
// certificates for zones on its own nameservers. So the wildcard record is
// proxied through Cloudflare, and this Worker answers it: the front page of
// <name>.runs-at.dev is fetched from the app's /_card/<name> path (see
// proxy.js), and every other path goes to the apex, as the upstream proxy
// does for claimed hosts.
//
// Names pointed at their own hosting have exact, DNS-only records, which
// Cloudflare never routes through a Worker.
//
// Deploy: Cloudflare dashboard -> Workers -> create -> paste this file ->
// add the route *.runs-at.dev/* on the runs-at.dev zone.

const ROOT = 'runs-at.dev';
const APP = `https://${ROOT}`;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    // Only single-label names under the root; anything else passes through.
    if (!host.endsWith(`.${ROOT}`)) return fetch(request);
    const name = host.slice(0, -(ROOT.length + 1));
    if (!name || name.includes('.') || name === 'www') return fetch(request);

    if (url.pathname !== '/') {
      return Response.redirect(`${APP}${url.pathname}${url.search}`, 307);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }

    // Visitor cookies are not forwarded: the card needs none, and cookies
    // set on a claimed subdomain must never reach the app.
    const headers = new Headers();
    for (const key of ['accept', 'accept-language', 'user-agent']) {
      const value = request.headers.get(key);
      if (value) headers.set(key, value);
    }

    // redirect: 'manual' so a name's URL redirect record reaches the visitor
    // as a redirect, not as the page it points at.
    const upstream = await fetch(`${APP}/_card/${encodeURIComponent(name)}${url.search}`, {
      method: request.method,
      headers,
      redirect: 'manual',
    });

    const response = new Response(upstream.body, upstream);
    response.headers.delete('set-cookie');
    return response;
  },
};
