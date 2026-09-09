import { BufferGeometry, CanvasTexture, Float32BufferAttribute, LinearMipmapLinearFilter, SRGBColorSpace, Vector3 } from 'three';
import { WORLD } from '../../lib/constants';
import { mulberry32 } from '../../lib/noise';
import { DEATH_STAR_POSITION } from './flightState';

/**
 * Procedural Death Star assets: a lat/long sphere with the dish carved in (vertices
 * inside a cone are displaced inward, no CSG) and an equatorial trench, plus canvas
 * textures for the plating, the darker dish and a few window lights.
 *
 * Built once per page and kept: the mesh is only mounted in flight mode, and re-entering
 * should not stall the camera glide with ~40 ms of texture work.
 */

const DEG = Math.PI / 180;
const R = WORLD.deathStarRadius;

/** The dish faces the star (so it is lit on approach), lifted into the upper hemisphere. */
export const DISH_DIR = (() => {
  const toStar = DEATH_STAR_POSITION.clone().negate().normalize();
  const lift = 28 * DEG;
  return new Vector3(toStar.x * Math.cos(lift), Math.sin(lift), toStar.z * Math.cos(lift)).normalize();
})();
export const DISH_CONE = 24 * DEG;
export const DISH_DEPTH = 22;
const TRENCH_HALF = 2.0 * DEG;
const TRENCH_DEPTH = 5;

export interface DeathStarAssets {
  geometry: BufferGeometry;
  map: CanvasTexture;
  emissiveMap: CanvasTexture;
}

let cache: DeathStarAssets | null = null;

export function getDeathStarAssets(): DeathStarAssets {
  if (!cache) cache = { geometry: buildGeometry(), map: buildColorTexture(), emissiveMap: buildEmissiveTexture() };
  return cache;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Radius of the surface in a direction (unit normal) — the shaping shared by mesh and textures. */
function surfaceRadius(nx: number, ny: number, nz: number, lat: number, trenchFloor: boolean): number {
  let rad = R;
  if (trenchFloor && Math.abs(lat) < TRENCH_HALF) rad -= TRENCH_DEPTH;
  const ang = Math.acos(clamp(nx * DISH_DIR.x + ny * DISH_DIR.y + nz * DISH_DIR.z, -1, 1));
  if (ang < DISH_CONE) {
    const t = ang / DISH_CONE;
    rad -= DISH_DEPTH * (1 - t * t);
  } else if (ang < DISH_CONE * 1.05) {
    // A slight raised lip so the rim catches light.
    rad += 1.4 * (1 - (ang - DISH_CONE) / (DISH_CONE * 0.05));
  }
  return rad;
}

function buildGeometry(): BufferGeometry {
  const cols = 160;
  const rows = 96;
  const wall = 0.08 * DEG;
  const lats: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const lat = -Math.PI / 2 + (Math.PI * i) / rows;
    if (Math.abs(lat) < TRENCH_HALF + 0.6 * DEG) continue;
    lats.push(lat);
  }
  // Trench walls: two rows almost on top of each other so the step is near vertical.
  lats.push(-TRENCH_HALF, -TRENCH_HALF + wall, TRENCH_HALF - wall, TRENCH_HALF);
  lats.sort((a, b) => a - b);

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let r = 0; r < lats.length; r++) {
    const lat = lats[r]!;
    const floor = Math.abs(lat) < TRENCH_HALF - wall * 0.5;
    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    for (let c = 0; c <= cols; c++) {
      const lon = (c / cols) * Math.PI * 2 - Math.PI;
      const nx = cl * Math.cos(lon);
      const ny = sl;
      const nz = cl * Math.sin(lon);
      const rad = surfaceRadius(nx, ny, nz, lat, floor);
      positions.push(nx * rad, ny * rad, nz * rad);
      uvs.push(c / cols, lat / Math.PI + 0.5);
    }
  }
  const stride = cols + 1;
  for (let r = 0; r < lats.length - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * stride + c;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Sorted boundaries splitting [0, size) into cells of random width in [min, max]. */
function boundaries(size: number, min: number, max: number, rand: () => number): number[] {
  const out = [0];
  let x = 0;
  while (x < size) {
    x += min + Math.floor(rand() * (max - min));
    out.push(Math.min(size, x));
  }
  return out;
}

function cellIndex(size: number, bounds: number[]): { idx: Int32Array; seam: Uint8Array } {
  const idx = new Int32Array(size);
  const seam = new Uint8Array(size);
  let k = 0;
  for (let i = 0; i < size; i++) {
    while (k + 1 < bounds.length && i >= bounds[k + 1]!) k++;
    idx[i] = k;
    const edge = bounds[k]!;
    if (i - edge < 1) seam[i] = 1;
  }
  return { idx, seam };
}

function hash2(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function buildColorTexture(): CanvasTexture {
  const W = 1536;
  const H = 768;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const rand = mulberry32(1977);

  const coarseX = cellIndex(W, boundaries(W, 20, 52, rand));
  const coarseY = cellIndex(H, boundaries(H, 16, 40, rand));
  const fineX = cellIndex(W, boundaries(W, 5, 13, rand));
  const fineY = cellIndex(H, boundaries(H, 4, 11, rand));

  const cosLon = new Float32Array(W);
  const sinLon = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const lon = (x / W) * Math.PI * 2 - Math.PI;
    cosLon[x] = Math.cos(lon);
    sinLon[x] = Math.sin(lon);
  }

  for (let y = 0; y < H; y++) {
    // Canvas row 0 is the top of the image → v = 1 → north pole.
    const lat = (0.5 - y / H) * Math.PI;
    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    const inTrench = Math.abs(lat) < TRENCH_HALF;
    const cy = coarseY.idx[y]!;
    const fy = fineY.idx[y]!;
    const seamY = coarseY.seam[y]! | 0;
    const fseamY = fineY.seam[y]! | 0;
    for (let x = 0; x < W; x++) {
      const plate = hash2(coarseX.idx[x]!, cy);
      const fine = hash2(fineX.idx[x]! + 17, fy + 31);
      let L = 0.56 + (plate - 0.5) * 0.13 + (fine - 0.5) * 0.045;
      if (seamY || coarseX.seam[x]) L -= 0.16;
      else if (fseamY || fineX.seam[x]) L -= 0.05;

      const nx = cl * cosLon[x]!;
      const nz = cl * sinLon[x]!;
      const dot = clamp(nx * DISH_DIR.x + sl * DISH_DIR.y + nz * DISH_DIR.z, -1, 1);
      const ang = Math.acos(dot);
      if (ang < DISH_CONE) {
        const t = ang / DISH_CONE;
        // Bowl: darker toward the focus, a few soft terraces, faint radial spokes.
        L *= 0.6 + t * 0.22;
        const ring = Math.floor(t * 5);
        L += ring % 2 === 0 ? 0.012 : -0.012;
        if (Math.abs(t * 5 - Math.round(t * 5)) < 0.03) L -= 0.05;
        if (t < 0.05) L *= 0.45;
        const ax = Math.atan2(nz - DISH_DIR.z * dot, nx - DISH_DIR.x * dot);
        if (Math.abs(Math.sin(ax * 8)) > 0.99) L -= 0.04;
      } else if (ang < DISH_CONE * 1.05) {
        L += 0.08;
      }
      if (inTrench) L *= 0.3;

      const i = (y * W + x) * 4;
      const l = clamp(L, 0.05, 0.95) * 255;
      // Slightly cool grey so the warm key light lands on something neutral.
      d[i] = l * 0.9;
      d[i + 1] = l * 0.95;
      d[i + 2] = l * 1.06;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function buildEmissiveTexture(): CanvasTexture {
  const W = 1024;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const rand = mulberry32(4242);
  const inDish = (x: number, y: number) => {
    const lat = (0.5 - y / H) * Math.PI;
    const lon = (x / W) * Math.PI * 2 - Math.PI;
    const nx = Math.cos(lat) * Math.cos(lon);
    const ny = Math.sin(lat);
    const nz = Math.cos(lat) * Math.sin(lon);
    return Math.acos(clamp(nx * DISH_DIR.x + ny * DISH_DIR.y + nz * DISH_DIR.z, -1, 1)) < DISH_CONE * 1.08;
  };
  // Sparse window dots across the hull, denser along the trench.
  for (let i = 0; i < 360; i++) {
    const x = rand() * W;
    const y = H * 0.08 + rand() * H * 0.84;
    if (inDish(x, y)) continue;
    const a = 0.35 + rand() * 0.45;
    ctx.fillStyle = `rgba(207, 232, 255, ${a.toFixed(2)})`;
    ctx.fillRect(Math.round(x), Math.round(y), rand() > 0.8 ? 2 : 1, 1);
  }
  const trenchPx = (TRENCH_HALF / Math.PI) * H;
  for (let i = 0; i < 260; i++) {
    const x = rand() * W;
    const y = H / 2 + (rand() - 0.5) * trenchPx * 1.4;
    ctx.fillStyle = `rgba(255, 214, 170, ${(0.5 + rand() * 0.5).toFixed(2)})`;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
