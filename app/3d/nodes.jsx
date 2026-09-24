'use client';

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { AdditiveBlending } from 'three';
import { PALETTE } from './config.js';
import { glowTexture } from './materials.js';

// One infrastructure node: a small solid core and a soft additive halo, in
// ink. Nodes sit in the margins around the hero text, never on it.
function Node({ node, index, interactive }) {
  const group = useRef();
  const halo = useRef();
  const [hovered, setHovered] = useState(false);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // A slow vertical drift, phase-offset per node so they never move in
    // lockstep. 5cm of travel: enough to read as alive, not as bobbing.
    group.current.position.y = node.position[1] + Math.sin(t * 0.6 + index * 1.7) * 0.05;
    // Ease the halo toward its hover size instead of snapping to it.
    const target = hovered ? 1.3 : 0.95;
    halo.current.scale.setScalar(halo.current.scale.x + (target - halo.current.scale.x) * 0.12);
  });

  const hover = interactive
    ? {
        onPointerOver: (e) => {
          e.stopPropagation();
          setHovered(true);
        },
        onPointerOut: () => setHovered(false),
      }
    : {};

  return (
    <group ref={group} position={node.position}>
      <mesh {...hover}>
        {/* The hit target is a little larger than the visible core, so a
            node can be hovered without pixel-hunting a 6px dot. */}
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color={PALETTE.ink} />
      </mesh>
      <sprite ref={halo} scale={0.95}>
        <spriteMaterial map={glowTexture()} color={PALETTE.ink} transparent opacity={0.4} depthWrite={false} blending={AdditiveBlending} />
      </sprite>
      {hovered && (
        // A real DOM label, not text in the canvas: it uses the site's mono
        // face and stays crisp at any pixel ratio. Decorative -- the same
        // pipeline is explained in the page's own copy -- so it is hidden
        // from assistive tech rather than announced on hover.
        <Html center position={[0, 0.42, 0]} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div aria-hidden="true" className="three-label">
            <span className="three-label-name">{node.label}</span>
            <span className="three-label-note">{node.note}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

export default function Nodes({ nodes, interactive }) {
  return nodes.map((node, i) => <Node key={node.id} node={node} index={i} interactive={interactive} />);
}

// The anchor. The hostname is real DOM text, so the scene does not draw it;
// it lights it from behind: a wide, low amber haze the width of the name,
// set back from it. This is the one amber object in the scene, and it
// breathes very slowly -- a 9s cycle -- so the eye settles on the name
// without anything visibly pulsing.
//
// Position and width are getters over the live hostname ports, read every
// frame, so the haze stays behind the name while the camera moves.
export function AnchorHalo({ position, span }) {
  const sprite = useRef();
  const mat = useRef();
  useFrame((state) => {
    const p = position();
    const w = span();
    sprite.current.position.set(p[0], p[1], p[2]);
    sprite.current.scale.set(w * 1.25, w * 0.3, 1);
    mat.current.opacity = 0.2 + Math.sin(state.clock.elapsedTime * 0.7) * 0.05;
  });
  return (
    <sprite ref={sprite}>
      <spriteMaterial ref={mat} map={glowTexture()} color={PALETTE.amber} transparent opacity={0.2} depthWrite={false} blending={AdditiveBlending} />
    </sprite>
  );
}
