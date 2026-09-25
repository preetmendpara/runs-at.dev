// Pages that get the desktop side-rail ads: the ones whose content sits in the
// narrow docs column (max-w-3xl, 768px), so a 300px rail fits beside it at the
// breakpoint below without touching it. The homepage (1200px content and its
// own banner), /stats (full-bleed canvas), /manage, /admin, /debug, the API and
// claimed *.runs-at.dev names never get them. An allow-list, so a new page
// stays rail-free until someone decides otherwise.
const ALLOWED = [
  /^\/docs(\/|$)/,
  /^\/faq$/,
  /^\/about$/,
  /^\/policy$/,
  /^\/privacy$/,
  /^\/contact$/,
  /^\/blog$/,
];

// 768px column + 2 x (32px gutter + 300px ad) = 1432px of ads and content,
// plus room for the fixed edge dock on the right (66px from the edge) and a
// margin on the left. At 1680px the right rail still clears the dock by 58px.
export const SIDE_RAIL_MIN_WIDTH = 1680;

export function sideRailsAllowed(pathname, hostname) {
  if (/\.runs-at\.dev$/i.test(hostname || '')) return false; // claimed names
  return ALLOWED.some((re) => re.test(pathname || ''));
}
