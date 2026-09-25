// Where the HilltopAds Popunder (zone 7459517) may run: only on public
// reading pages of runs-at.dev itself. It fires on any click on the page, so it
// must never be live where a click does something that matters to the visitor:
// the homepage (claim form and GitHub sign-in), /manage, /admin, /api and auth
// routes, /debug, and every claimed *.runs-at.dev name. An allow-list rather
// than a block-list, so a route added later stays ad-free until someone
// decides otherwise.
const ALLOWED = [
  /^\/docs(\/|$)/,
  /^\/faq$/,
  /^\/about$/,
  /^\/stats$/,
  /^\/blog(\/|$)/,
  /^\/policy$/,
  /^\/privacy$/,
  /^\/contact$/,
];

export function popunderAllowed(pathname, hostname) {
  if (/\.runs-at\.dev$/i.test(hostname || '')) return false; // claimed names
  return ALLOWED.some((re) => re.test(pathname || ''));
}
