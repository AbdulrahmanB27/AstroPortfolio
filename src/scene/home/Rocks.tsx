import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Euler, IcosahedronGeometry, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { STAGE, WORLD } from '../../lib/constants';
import { mulberry32, noise3D } from '../../lib/noise';
import { terrainHeight } from './terrainGeometry';
import { LOW_POLY } from '../../lib/lowPoly';

/**
 * Scattered boulders plus three composed hero rocks. One shared perturbed icosahedron,
 * instanced with non-uniform scale and random orientation for variety.
 */

function buildRockGeometry(seed: number, detail = 2): IcosahedronGeometry {
  // Low-poly keeps the noise but drops a subdivision, so each rock is a handful of big facets.
  const g = new IcosahedronGeometry(1, LOW_POLY ? Math.max(0, detail - 1) : detail);
  const pos = g.attributes.position!;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = noise3D(v.x * 1.6 + seed, v.y * 1.6, v.z * 1.6 - seed) - 0.5;
    const n2 = noise3D(v.x * 4 - seed, v.y * 4 + seed, v.z * 4) - 0.5;
    v.multiplyScalar(1 + n * 0.55 + n2 * 0.18);
    // Flatten the underside a little so rocks sit rather than float.
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.35;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

interface RockInstance {
  x: number;
  z: number;
  scale: [number, number, number];
  yaw: number;
  tilt: number;
}

const HERO_ROCKS: RockInstance[] = [
  { x: -9.5, z: -14, scale: [3.4, 2.2, 2.8], yaw: 0.6, tilt: 0.08 },
  { x: 7.5, z: -5.5, scale: [1.1, 0.75, 0.95], yaw: -0.4, tilt: 0.05 },
  { x: -2.2, z: -20, scale: [1.6, 1.1, 1.3], yaw: 1.8, tilt: -0.06 },
  { x: 12.5, z: -24, scale: [2.4, 1.5, 2.0], yaw: 2.4, tilt: 0.1 },
];

function scatter(count: number, seed: number): RockInstance[] {
  const rand = mulberry32(seed);
  const out: RockInstance[] = [];
  const astro = STAGE.astronaut;
  const rocket = STAGE.rocket;
  let guard = 0;
  while (out.length < count && guard++ < count * 20) {
    const ang = rand() * Math.PI * 2;
    const dist = 6 + Math.pow(rand(), 0.7) * (WORLD.surfaceExtent * 0.55);
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;
    // Keep the camera's forward corridor and the characters clear.
    if (z > -3 && Math.abs(x) < 6) continue;
    if (Math.hypot(x - astro[0], z - astro[2]) < 3.5) continue;
    if (Math.hypot(x - rocket[0], z - rocket[2]) < 6.5) continue;
    if (Math.abs(x) < 2.2 && z > -14 && z < -4) continue;
    const s = 0.25 + Math.pow(rand(), 2.2) * (dist > 40 ? 3.5 : 1.4);
    out.push({
      x,
      z,
      scale: [s * (0.8 + rand() * 0.5), s * (0.55 + rand() * 0.4), s * (0.8 + rand() * 0.5)],
      yaw: rand() * Math.PI * 2,
      tilt: (rand() - 0.5) * 0.25,
    });
  }
  return out;
}

export function Rocks({ count, castShadow }: { count: number; castShadow: boolean }) {
  const meshRef = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => buildRockGeometry(4.2), []);
  const instances = useMemo(() => [...HERO_ROCKS, ...scatter(count, 909)], [count]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const s = new Vector3();
    const euler = new Euler();
    const color = new Color();
    instances.forEach((r, i) => {
      const y = terrainHeight(r.x, r.z);
      p.set(r.x, y + r.scale[1] * 0.42, r.z);
      s.set(r.scale[0], r.scale[1], r.scale[2]);
      euler.set(r.tilt, r.yaw, r.tilt * 0.5, 'XYZ');
      q.setFromEuler(euler);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      color.setHSL(0.075, 0.08 + (i % 5) * 0.02, 0.28 + ((i * 7) % 10) * 0.014);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [instances]);

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, instances.length]} castShadow={castShadow} receiveShadow name="rocks">
      <meshStandardMaterial color="#6a625a" roughness={0.96} metalness={0} flatShading />
    </instancedMesh>
  );
}
