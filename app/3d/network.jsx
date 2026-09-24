'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { PALETTE, LAYOUTS, SKIP, cameraBack, toWorld } from './config.js';
import { sceneState } from './use-scene-state.js';
import { glowTexture } from './materials.js';
import Nodes, { AnchorHalo } from './nodes.jsx';

// The pipeline: nodes, the edges between them, and one travelling pulse per
// edge.
//
// Two kinds of point, deliberately treated differently:
//
//   nodes -- real world-space objects. When the camera moves (pointer lean,
//     scroll choreography) they move on screen with true parallax, which is
//     the whole point of having depth.
//
//   ports -- the two ends of the hostname, where the network meets the DOM
//     text. The text does not move with the camera, so a port must not
//     either. Each frame the port is re-projected from its fixed screen
//     position, through the current camera, onto the hostname's plane. The
//     line stays attached to the name however the camera moves, and the
//     only per-frame cost is two ray/plane intersections and a two-vertex
//     buffer update. The screen position itself is measured from the DOM on
//     resize, never per frame.
export default function Network({ nodes, edges, anchor, region, interactive, pulses }) {
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);

  const layout = useMemo(() => {
    const aspect = size.width / size.height;
    const camZ = sceneState.camera.z + cameraBack(aspect);
    const orient = aspect < 1 ? 'portrait' : 'landscape';
    const fractions = LAYOUTS[orient];
    const skip = new Set(SKIP[orient].map((e) => e.join('>')));

    // Layout fractions are relative to the hero's own box (region), not the
    // canvas: the canvas can be wider than the content -- full-bleed on a
    // desktop, or reaching under the side dock on a phone -- and the network
    // belongs around the content, not out at the canvas edges.
    const at = (fx, fy, z) => toWorld(region.x + fx * region.w, region.y + fy * region.h, z, camZ, aspect);

    const placed = nodes.map((n) => ({ ...n, position: at(...fractions[n.id]) }));
    const byId = Object.fromEntries(placed.map((n) => [n.id, n.position]));
    const centerX = toWorld(anchor.fx, anchor.fy, 0, camZ, aspect)[0];

    // A hostname endpoint is recorded as the name of a port, resolved every
    // frame; everything else is a fixed world point.
    const segments = edges
      .filter((e) => !skip.has(e.join('>')))
      .map(([a, b]) => [byId[a], b === 'hostname' ? (byId[a][0] < centerX ? 'left' : 'right') : byId[b]]);

    const pts = new Float32Array(segments.length * 6);
    segments.forEach(([f, t], i) => {
      pts.set(f, i * 6);
      if (Array.isArray(t)) pts.set(t, i * 6 + 3);
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pts, 3));
    return { placed, segments, lines: g };
  }, [size.width, size.height, nodes, edges, anchor, region]);

  // A resize rebuilds the geometry; the old buffer lives on the GPU until it
  // is disposed, so every rebuild would otherwise leak one.
  useEffect(() => () => layout.lines.dispose(), [layout]);

  // Live port positions, rewritten every frame and read by the lines, the
  // pulses and the halo. A ref, not state: nothing here should re-render.
  const ports = useRef({ left: [0, 0, 0], right: [0, 0, 0], halo: [0, 0, 0] });
  const scratch = useMemo(() => ({ o: new Vector3(), d: new Vector3() }), []);

  // Screen fraction -> the point on the plane z = depth that the current
  // camera sees there. Runs after the camera rig, which is mounted (and so
  // subscribed) first, so it always uses this frame's camera.
  const project = (fx, fy, depth, out) => {
    scratch.o.copy(camera.position);
    scratch.d.set(fx * 2 - 1, 1 - fy * 2, 0.5).unproject(camera).sub(scratch.o).normalize();
    const t = (depth - scratch.o.z) / scratch.d.z;
    out[0] = scratch.o.x + scratch.d.x * t;
    out[1] = scratch.o.y + scratch.d.y * t;
    out[2] = depth;
  };

  const updatePorts = () => {
    const p = ports.current;
    project(anchor.fx - anchor.fw / 2, anchor.fy, 0, p.left);
    project(anchor.fx + anchor.fw / 2, anchor.fy, 0, p.right);
    project(anchor.fx, anchor.fy, -1.5, p.halo);

    const attr = layout.lines.getAttribute('position');
    layout.segments.forEach(([, t], i) => {
      if (typeof t === 'string') attr.array.set(p[t], i * 6 + 3);
    });
    attr.needsUpdate = true;
  };

  const endOf = (t) => (typeof t === 'string' ? () => ports.current[t] : () => t);

  return (
    <group>
      {/* First child on purpose. useFrame callbacks run in subscription
          order, and React subscribes children before their parent -- so
          done in Network itself this would run AFTER the pulses and halo
          below had already read last frame's ports. As the first sibling
          it runs before them, and everything agrees within one frame. */}
      <OnFrame run={updatePorts} />
      {/* Not frustum-culled: the geometry's bounds are computed once, but
          the port vertices move every frame, so a stale bounding sphere
          could cull lines that are actually on screen. */}
      <lineSegments geometry={layout.lines} frustumCulled={false}>
        <lineBasicMaterial color={PALETTE.rule} transparent opacity={0.85} />
      </lineSegments>
      {pulses && layout.segments.map(([from, to], i) => <Pulse key={i} from={from} to={endOf(to)} offset={i * 0.37} />)}
      <AnchorHalo position={() => ports.current.halo} span={() => ports.current.right[0] - ports.current.left[0]} />
      <Nodes nodes={layout.placed} interactive={interactive} />
    </group>
  );
}

function OnFrame({ run }) {
  useFrame(run);
  return null;
}

// A small bright point travelling an edge in the direction a claim flows.
// It fades in and out at the ends so it never pops into existence on top of
// a node. Blue, not amber: it is data in motion, and amber is reserved for
// the hostname it is travelling toward. `to` is a getter, so a pulse into
// the hostname follows the live port.
function Pulse({ from, to, offset }) {
  const ref = useRef();
  const mat = useRef();
  useFrame((state) => {
    const t = (state.clock.elapsedTime * 0.22 + offset) % 1;
    const end = to();
    ref.current.position.set(
      from[0] + (end[0] - from[0]) * t,
      from[1] + (end[1] - from[1]) * t,
      from[2] + (end[2] - from[2]) * t,
    );
    mat.current.opacity = Math.sin(t * Math.PI) * 0.9;
  });
  return (
    <sprite ref={ref} scale={0.32}>
      <spriteMaterial ref={mat} map={glowTexture()} color={PALETTE.blue} transparent opacity={0} depthWrite={false} blending={AdditiveBlending} />
    </sprite>
  );
}

// Ambient depth: a field of faint points around the network. They are placed
// once and never updated individually; the whole field turns as one object,
// which costs a single matrix per frame instead of a buffer upload.
export function Particles({ count }) {
  const ref = useRef();
  const geometry = useMemo(() => {
    const pts = new Float32Array(count * 3);
    // Seeded, so every reload draws the same field. Math.random would
    // reshuffle it on every visit.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      pts[i * 3] = (rand() - 0.5) * 26;
      pts[i * 3 + 1] = (rand() - 0.5) * 14;
      pts[i * 3 + 2] = -rand() * 14 + 2;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pts, 3));
    return g;
  }, [count]);

  useFrame((_, delta) => {
    ref.current.rotation.y += delta * 0.012;
  });

  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        map={glowTexture()}
        color={PALETTE.muted}
        size={0.09}
        sizeAttenuation
        transparent
        opacity={0.5}
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}
