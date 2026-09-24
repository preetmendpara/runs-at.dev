'use client';

import { CanvasTexture, SRGBColorSpace } from 'three';

// One soft radial falloff, drawn once on a 2D canvas and shared by every
// glow and particle in the scene. A sprite with this texture and additive
// blending is the cheapest "glow" there is: no shader, no postprocessing,
// no bloom pass -- the GPU just adds a blurred dot to what is already there.
let glow;
export function glowTexture() {
  if (glow) return glow;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glow = new CanvasTexture(canvas);
  glow.colorSpace = SRGBColorSpace;
  return glow;
}
