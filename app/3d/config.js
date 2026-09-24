// Everything the scene is made of, as data. The network is the registry's own
// pipeline -- a claim is committed on GitHub, lands in the registry, is synced
// to DNS, served through Cloudflare, and resolves as a hostname -- so the
// geometry here is a picture of the product rather than decoration.
//
// Nodes are placed in SCREEN terms, not world units: each is a fraction of
// the canvas (fx across, fy down) plus a depth. The scene converts them to
// world space for the current camera, so the network keeps its composition
// at every width -- framing the hero text instead of landing on it.
//
// Two layouts, because the hero is a wide row on a desktop and a tall stack
// on a phone, and the empty space around it is in different places. The
// hostname is not listed: it is measured from the real DOM element
// (data-scene-anchor) so the lines meet the name wherever it is laid out.
// The site's tokens, mirrored for the GPU. three.js takes colours as values,
// not CSS variables, so these must track :root in globals.css by hand.
export const PALETTE = {
  canvas: '#0b0d0f',
  ink: '#edf1f5',
  muted: '#8a97a4',
  rule: '#3a434d',
  amber: '#e8a33d',
  blue: '#4d7cff',
};

export const NODES = [
  { id: 'github', label: 'github', note: 'claim committed' },
  { id: 'registry', label: 'registry', note: 'domains/<name>.json' },
  { id: 'dns', label: 'dns', note: 'records synced' },
  { id: 'cloudflare', label: 'cloudflare', note: 'edge + tls' },
];

export const LAYOUTS = {
  // Desktop: an arc over and beside the hero. The top edge runs above the
  // status badge; the flanks sit outside the text column.
  landscape: {
    github: [0.13, 0.44, -4],
    registry: [0.21, 0.125, -2],
    dns: [0.79, 0.125, -2],
    cloudflare: [0.87, 0.44, -4],
  },
  // Phone: a row along the top band above the badge, then the last hop
  // down the LEFT margin into the left end of the hostname. The right margin
  // belongs to the side dock (x >= 319 at 375px, from y 216 down), and a
  // route there either crowds the dock or cuts across the badge; the left
  // margin is clear top to bottom. Direction on screen is not the claim's
  // direction, so the chain simply reads right to left here.
  portrait: {
    github: [0.9, 0.07, -1.5],
    registry: [0.5, 0.055, -1],
    dns: [0.045, 0.07, -1.5],
    cloudflare: [0.045, 0.33, -1],
  },
};

// Edges a layout leaves out. On a phone the registry sits above the text
// column, so its direct line to the hostname could only reach the name by
// cutting across the headline copy. The pipeline still reaches the name
// through cloudflare; only the shortcut is dropped.
export const SKIP = {
  landscape: [],
  portrait: [['registry', 'hostname']],
};

// Used only until the hostname element has been measured, and when no
// hostname is on the page at all.
export const FALLBACK_ANCHOR = { fx: 0.5, fy: 0.5, fw: 0.5, fh: 0.08 };

// Directed: the order a claim actually travels. registry -> hostname is the
// profile card, which serves straight from the registry before any DNS of
// the owner's own exists.
export const EDGES = [
  ['github', 'registry'],
  ['registry', 'dns'],
  ['dns', 'cloudflare'],
  ['cloudflare', 'hostname'],
  ['registry', 'hostname'],
];

// Capability tiers. `full` is a desktop with a fine pointer; `lite` is a
// phone, a tablet or a low-power machine. Reduced motion is not a tier -- it
// is a separate switch that freezes whichever tier is chosen.
export const TIERS = {
  full: { particles: 520, dprMax: 1.75, pointer: true, pulses: true, antialias: true },
  lite: { particles: 140, dprMax: 1.25, pointer: false, pulses: true, antialias: false },
};

export function detectTier() {
  if (typeof window === 'undefined') return 'lite';
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  // Both are advisory and absent in some browsers; missing reads as capable,
  // because the lite tier is a downgrade a capable machine would not want.
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = navigator.deviceMemory ?? 8;
  return fine && cores > 4 && memory > 4 ? 'full' : 'lite';
}

// Probe for WebGL without keeping a context. Creating one and dropping it is
// the only reliable test: a browser can expose the API and still refuse the
// context (blocklisted driver, GPU process crashed, hardware acceleration
// off). The scene only mounts when this returns true.
export function hasWebGL() {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

// Field of view and the distance the camera backs off on a narrow screen.
// Shared by the camera rig and the layout maths, which must agree exactly
// or a node placed "beside the hostname" lands on it.
export const FOV = 40;
export function cameraBack(aspect) {
  return aspect < 1 ? (1 - aspect) * 8 : 0;
}

// Screen fraction -> world position, for a camera on the z axis looking at
// the origin. Plain trigonometry, no raycast: at depth z the visible frame
// is (camZ - z) * tan(fov/2) tall on each side of centre.
export function toWorld(fx, fy, z, camZ, aspect) {
  const halfH = (camZ - z) * Math.tan((FOV * Math.PI) / 360);
  return [(fx * 2 - 1) * halfH * aspect, (1 - fy * 2) * halfH, z];
}
