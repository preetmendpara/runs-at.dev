'use client';

// The seam between page choreography and the scene.
//
// A plain mutable object, deliberately not React state: GSAP tweens it
// directly (`gsap.to(sceneState.camera, { z: 14, scrollTrigger: ... })`) and
// the render loop reads it every frame. Routing a 60fps camera value through
// setState would re-render the tree on every frame for no benefit; the scene
// only needs the current number when it draws.
//
// This is the hook later scroll choreography plugs into. Nothing here knows
// about ScrollTrigger; a section that wants to move the camera tweens these
// fields and the scene follows.
export const sceneState = {
  camera: {
    // Base position. Pointer parallax is added on top of this, never
    // written into it, so a tween and the pointer can never fight.
    x: 0,
    y: 0,
    z: 11,
    // Where the camera looks. Tweening this pans the view without moving
    // the camera -- the cheap way to "follow" something.
    lookX: 0,
    lookY: 0,
  },
  // 0..1. How much of the network is lit. Choreography can fade the scene
  // down as the page moves on without unmounting it.
  intensity: 1,
  // Normalised pointer, -1..1 on each axis, written by the scene's pointer
  // listener. Zero on touch devices, where it is never written.
  pointer: { x: 0, y: 0 },
};
