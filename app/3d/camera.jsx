'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { sceneState } from './use-scene-state.js';
import { cameraBack } from './config.js';

// Reads the camera from sceneState every frame and adds two things on top of
// it, never writing back into it:
//
//   1. aspect compensation -- a portrait phone pulls the camera back so the
//      network is not cropped down to one node
//   2. pointer parallax -- a small offset toward the pointer, eased
//
// Keeping both as additions to the tweened base is what lets GSAP own the
// camera for choreography while the pointer still nudges it.
export default function CameraRig({ parallax }) {
  const { camera, size } = useThree();
  const eased = useRef({ x: 0, y: 0 });

  useFrame(() => {
    const c = sceneState.camera;
    const aspect = size.width / size.height;
    // Landscape needs no help. Below 1:1 the frame loses width fast, so the
    // camera backs off in proportion to how narrow it has become.
    const back = cameraBack(aspect);

    // Pointer offset, eased at 6% per frame: the view follows the hand
    // without ever snapping to it. At most ~0.35 units -- a lean, not a
    // chase. Stays at zero on touch, where pointer is never written.
    if (parallax) {
      eased.current.x += (sceneState.pointer.x * 0.35 - eased.current.x) * 0.06;
      eased.current.y += (sceneState.pointer.y * 0.2 - eased.current.y) * 0.06;
    }

    camera.position.set(c.x + eased.current.x, c.y + eased.current.y, c.z + back);
    camera.lookAt(c.lookX, c.lookY, 0);
    // lookAt only sets the rotation; the world matrix is otherwise refreshed
    // at render time. The hostname ports unproject through this camera later
    // in the same frame, so they need the matrix now, not after the draw.
    camera.updateMatrixWorld();
  });

  return null;
}
