import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import { STAGE, WORLD, PALETTE } from '../../lib/constants';
import { fbm2D } from '../../lib/noise';

/**
 * Procedural surface patch for the home planet stage. A grid in the stage's local XZ
 * plane is dropped along a tangent sphere (so the horizon curves away), then shaped by
 * low-frequency hills, a few designed craters, and a flat area for the characters.
 */

interface Crater {
  x: number;
  z: number;
  radius: number;
  depth: number;
}

const CRATERS: Crater[] = [
  { x: -14, z: -24, radius: 5.5, depth: 1.1 },
  { x: 18, z: -28, radius: 4.2, depth: 0.8 },
  { x: -30, z: -44, radius: 9, depth: 1.8 },
  { x: 34, z: -52, radius: 6.5, depth: 1.3 },
  { x: 2, z: -62, radius: 12, depth: 2.2 },
  { x: -48, z: -20, radius: 7, depth: 1.4 },
  { x: 52, z: -10, radius: 5, depth: 1.0 },
];

/** Height of the terrain (before the spherical drop) at a local XZ point. */
export function terrainRelief(x: number, z: number): number {
  const d = Math.hypot(x, z);
  // Flat stage near the origin, blending out over ~14 units.
  const flat = smoothstep(STAGE.flatRadius, STAGE.flatRadius + 16, d);
  // Hills grow with distance so the horizon has silhouettes without cluttering the stage.
  const hills = (fbm2D(x * 0.045 + 3.1, z * 0.045 - 1.7, 4) - 0.5) * (1.4 + d * 0.035) * flat;
  const detail = (fbm2D(x * 0.35, z * 0.35, 3) - 0.5) * 0.28 * (0.35 + flat * 0.65);
  let craters = 0;
  for (const c of CRATERS) {
    const cd = Math.hypot(x - c.x, z - c.z);
    if (cd < c.radius * 1.6) {
      const t = cd / c.radius;
      if (t < 1) craters += -c.depth * Math.pow(1 - t * t, 1.5);
      const rim = Math.exp(-Math.pow((cd - c.radius) / (c.radius * 0.22), 2));
      craters += c.depth * 0.3 * rim;
    }
  }
  return hills + detail + craters * flat;
}

export function sphericalDrop(x: number, z: number): number {
  const R = WORLD.surfaceRadius;
  const d2 = x * x + z * z;
  return -(R - Math.sqrt(Math.max(0, R * R - d2)));
}

export function terrainHeight(x: number, z: number): number {
  return sphericalDrop(x, z) + terrainRelief(x, z);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function buildTerrainGeometry(segments = 190): BufferGeometry {
  const E = WORLD.surfaceExtent;
  const n = segments + 1;
  const positions = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const base = new Color(PALETTE.terrain);
  const dark = new Color(PALETTE.terrainDark);
  const warm = new Color('#8a7a66');
  const tmp = new Color();

  let k = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      // Denser sampling near the camera: bias the grid toward the origin.
      const u = (i / segments) * 2 - 1;
      const v = (j / segments) * 2 - 1;
      const x = Math.sign(u) * Math.pow(Math.abs(u), 1.35) * E;
      const z = Math.sign(v) * Math.pow(Math.abs(v), 1.35) * E;
      const relief = terrainRelief(x, z);
      const y = sphericalDrop(x, z) + relief;
      positions[k * 3] = x;
      positions[k * 3 + 1] = y;
      positions[k * 3 + 2] = z;
      // Subtle color variation: darker in dips, warmer on slopes toward the star (-z).
      const shade = Math.max(0, Math.min(1, 0.5 + relief * 0.18));
      tmp.copy(dark).lerp(base, shade);
      const toward = Math.max(0, Math.min(1, 0.5 - z / (E * 2)));
      tmp.lerp(warm, toward * 0.25 + fbm2D(x * 0.12, z * 0.12, 2) * 0.12);
      colors[k * 3] = tmp.r;
      colors[k * 3 + 1] = tmp.g;
      colors[k * 3 + 2] = tmp.b;
      k++;
    }
  }

  const indices: number[] = [];
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
