import type { PlanetStyle } from '../../data/schema';
import { mulberry32 } from '../../lib/noise';

/**
 * Procedural planet surfaces as raw pixels: no DOM, no three, so it runs in a worker.
 *
 * The first version drew each style with 2D canvas primitives — latitude stripes, random
 * ellipses for continents, zig-zag polylines for lava — and it read that way: the Adhan Clock's
 * world was an orange ball with pale scribbles on it, and continents stopped dead at the
 * texture's seam. Everything here is sampled from 3D noise at the point on the sphere each
 * pixel lands on, so a feature that crosses the seam continues across it and nothing pinches
 * at the poles. Each style is a small recipe over the same few fields: warped elevation for
 * continents and seas, ridged noise for cracks and fissures, craters for rock.
 *
 * Besides colour, each surface gets the maps that make light behave: height for bump,
 * roughness so seas catch the star and land does not, emissive so lava and the lit windows of
 * a metal world glow on the night side, and a cloud layer for the two worlds with weather.
 *
 * Rows run south to north, the order a DataTexture uploads them in.
 */

export interface SurfaceRequest {
  style: PlanetStyle;
  color: string;
  accent?: string;
  seed: number;
  /** Equirectangular width; the height is half of it. */
  width: number;
}

export interface SurfaceData {
  width: number;
  height: number;
  map: Uint8Array;
  bump?: Uint8Array;
  roughness?: Uint8Array;
  emissive?: Uint8Array;
  clouds?: Uint8Array;
}

type RGB = Float32Array;

function rgb(hex: string): RGB {
  const v = parseInt(hex.replace('#', ''), 16);
  return new Float32Array([(v >> 16) & 255, (v >> 8) & 255, v & 255]);
}

function mixed(a: RGB, b: RGB, t: number): RGB {
  return new Float32Array([a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t]);
}

const WHITE = rgb('#ffffff');
const BLACK = rgb('#000000');
/** Toward white for a positive amount, toward black for a negative one. Palette setup only. */
const shade = (c: RGB, amount: number): RGB => (amount >= 0 ? mixed(c, WHITE, amount) : mixed(c, BLACK, -amount));

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** 1 on the crest of a ridge, falling away either side: the shape of a crack or a fissure. */
const ridge = (t: number) => 1 - Math.abs(t * 2 - 1);

/**
 * Seeded 3D value noise, trilinear over a permutation table.
 *
 * `noise3D` in lib/noise is two 2D slices averaged — fine for roughening a rock, but across a
 * whole planet the slicing shows as streaks, and it is built on `Math.sin`. A surface is
 * ~130k samples times a dozen noise calls; this one is integer lookups and no allocation.
 */
export function makeNoise(seed: number): (x: number, y: number, z: number) => number {
  const rand = mulberry32(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = p[i]!;
    p[i] = p[j]!;
    p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]!;
  const val = new Float32Array(256);
  for (let i = 0; i < 256; i++) val[i] = rand();
  return (x, y, z) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    let t = x - xi;
    const u = t * t * t * (t * (t * 6 - 15) + 10);
    t = y - yi;
    const w = t * t * t * (t * (t * 6 - 15) + 10);
    t = z - zi;
    const s = t * t * t * (t * (t * 6 - 15) + 10);
    const X = xi & 255;
    const Y = yi & 255;
    const Z = zi & 255;
    const A = perm[X]! + Y;
    const B = perm[X + 1]! + Y;
    const AA = perm[A]! + Z;
    const AB = perm[A + 1]! + Z;
    const BA = perm[B]! + Z;
    const BB = perm[B + 1]! + Z;
    const c000 = val[perm[AA]!]!;
    const c100 = val[perm[BA]!]!;
    const c010 = val[perm[AB]!]!;
    const c110 = val[perm[BB]!]!;
    const c001 = val[perm[AA + 1]!]!;
    const c101 = val[perm[BA + 1]!]!;
    const c011 = val[perm[AB + 1]!]!;
    const c111 = val[perm[BB + 1]!]!;
    const x00 = c000 + (c100 - c000) * u;
    const x10 = c010 + (c110 - c010) * u;
    const x01 = c001 + (c101 - c001) * u;
    const x11 = c011 + (c111 - c011) * u;
    const y0 = x00 + (x10 - x00) * w;
    const y1 = x01 + (x11 - x01) * w;
    return y0 + (y1 - y0) * s;
  };
}

type Noise = ReturnType<typeof makeNoise>;

function fbm(n: Noise, x: number, y: number, z: number, octaves: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * n(x * freq + i * 19.1, y * freq - i * 7.7, z * freq + i * 3.3);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

interface Crater {
  x: number;
  y: number;
  z: number;
  cos: number;
  r: number;
}

function craters(rand: () => number, count: number): Crater[] {
  const out: Crater[] = [];
  for (let i = 0; i < count; i++) {
    const z = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const k = Math.sqrt(1 - z * z);
    // Many small, few large — the size distribution of real cratered surfaces.
    const r = 0.03 + Math.pow(rand(), 3) * 0.22;
    out.push({ x: k * Math.cos(a), y: z, z: k * Math.sin(a), cos: Math.cos(r * 1.15), r });
  }
  return out;
}

export function generatePlanetSurface({ style, color, accent: accentHex, seed, width }: SurfaceRequest): SurfaceData {
  const w = width;
  const h = width / 2;
  const base = rgb(color);
  const accent = accentHex ? rgb(accentHex) : shade(base, 0.35);
  const n = makeNoise(seed);
  const n2 = makeNoise(seed * 7 + 13);
  const rand = mulberry32(seed ^ 0x5bd1e995);

  const size = w * h * 4;
  const map = new Uint8Array(size);
  const bump = style !== 'gas' ? new Uint8Array(size) : undefined;
  const roughness = style === 'ocean' || style === 'terra' ? new Uint8Array(size) : undefined;
  const emissive = style === 'lava' || style === 'metal' ? new Uint8Array(size) : undefined;
  const clouds = style === 'ocean' || style === 'terra' ? new Uint8Array(size) : undefined;

  // Palettes are fixed per planet, so they are built once rather than per pixel.
  const ocean = style === 'ocean';
  const P = {
    deep: shade(base, ocean ? -0.55 : -0.5),
    shallow: ocean ? shade(base, 0.05) : shade(base, -0.18),
    landDark: mixed(shade(base, -0.35), rgb('#3d7a46'), 0.55),
    landDetail: mixed(accent, rgb('#e9dcb0'), 0.6),
    terraDark: shade(base, -0.2),
    // Faintly cool: under the star's warm key a neutral white reads as beige.
    cap: rgb('#eef3f6'),
    rockDark: shade(base, -0.28),
    rockLight: shade(base, 0.14),
    maria: shade(base, -0.42),
    craterFloor: shade(base, -0.4),
    craterRim: shade(accent, 0.1),
    crustDark: shade(base, -0.66),
    crustLight: shade(base, -0.42),
    glow: mixed(accent, rgb('#ff7a2a'), 0.3),
    iceDark: shade(base, 0.18),
    iceLight: shade(base, 0.5),
    iceCrack: shade(accent, 0.25),
    iceFrost: shade(accent, 0.3),
    seam: shade(base, -0.55),
    trench: shade(base, -0.6),
    window: shade(accent, 0.2),
    windowGlow: shade(accent, 0.1),
    gasDark: shade(base, -0.25),
    gasLight: shade(accent, 0.2),
  };

  const crater = style === 'rocky' ? craters(rand, 70) : style === 'ice' ? craters(rand, 9) : [];
  // Metal worlds: a lit window in roughly one panel in seven.
  const lights = new Uint8Array(48 * 24);
  if (style === 'metal') for (let i = 0; i < 170; i++) lights[Math.floor(rand() * lights.length)] = 1;

  // Working colours. Every blend below writes into these rather than allocating.
  const C = new Float32Array(3);
  const G = new Float32Array(3);
  const set = (out: Float32Array, c: RGB) => {
    out[0] = c[0]!;
    out[1] = c[1]!;
    out[2] = c[2]!;
  };
  const toward = (out: Float32Array, c: RGB, t: number) => {
    out[0] = out[0]! + (c[0]! - out[0]!) * t;
    out[1] = out[1]! + (c[1]! - out[1]!) * t;
    out[2] = out[2]! + (c[2]! - out[2]!) * t;
  };

  for (let row = 0; row < h; row++) {
    const lat = ((row + 0.5) / h - 0.5) * Math.PI;
    const cl = Math.cos(lat);
    const y = Math.sin(lat);
    for (let col = 0; col < w; col++) {
      const lon = ((col + 0.5) / w) * Math.PI * 2;
      const x = cl * Math.cos(lon);
      const z = cl * Math.sin(lon);
      let height = 0.5;
      let rough = 0.85;
      let glowT = 0;
      let glowColor = P.glow;
      let cloudA = 0;
      set(C, base);

      switch (style) {
        case 'terra':
        case 'ocean': {
          // Warped elevation: continents with coastlines rather than blobs.
          const wx = fbm(n2, x * 1.1, y * 1.1, z * 1.1, 3) - 0.5;
          const e = fbm(n, x * 1.7 + wx * 1.6, y * 1.7 + wx, z * 1.7 - wx * 1.2, 5);
          const sea = ocean ? 0.63 : 0.5;
          const land = smoothstep(sea, sea + 0.02, e);
          const detail = fbm(n2, x * 9, y * 9, z * 9, 2);
          set(C, P.deep);
          toward(C, P.shallow, smoothstep(sea - 0.22, sea, e));
          if (ocean) {
            // Islands: pale beaches at the shore, greener inland.
            set(G, P.landDetail);
            toward(G, P.landDark, smoothstep(sea + 0.02, sea + 0.14, e));
            toward(G, accent, (1 - smoothstep(sea, sea + 0.025, e)) * 0.6);
          } else {
            set(G, base);
            toward(G, accent, smoothstep(sea + 0.04, sea + 0.26, e));
            toward(G, P.terraDark, clamp01((detail - 0.5) * 0.7 + 0.15));
          }
          toward(C, G, land);
          // Polar caps, ragged at the edge, and small: the orbit is viewed from above, so a
          // pole is always in shot and a cap down to 55° turned the whole disc white.
          const cap = smoothstep(0.93, 0.97, Math.abs(y) + (detail - 0.5) * 0.08);
          toward(C, P.cap, cap * 0.9);
          height = land > 0 ? 0.5 + (e - sea) * 1.6 : 0.42;
          rough = land > 0.5 || cap > 0.5 ? 0.92 : 0.32;
          const cw = fbm(n2, x * 2.2 + 31, y * 3.2, z * 2.2, 4);
          const band = 0.5 + 0.5 * Math.sin(lat * 5 + cw * 6);
          cloudA = smoothstep(0.56, 0.76, cw * 0.8 + band * 0.25) * (ocean ? 0.62 : 0.55);
          break;
        }
        case 'rocky': {
          const mottle = fbm(n, x * 3, y * 3, z * 3, 4);
          const maria = smoothstep(0.52, 0.62, fbm(n2, x * 1.2, y * 1.2, z * 1.2, 3));
          set(C, P.rockDark);
          toward(C, P.rockLight, mottle);
          toward(C, P.maria, maria * 0.6);
          height = 0.45 + mottle * 0.2 - maria * 0.08;
          for (const k of crater) {
            const d = x * k.x + y * k.y + z * k.z;
            if (d < k.cos) continue;
            const t = Math.acos(d > 1 ? 1 : d) / k.r;
            if (t < 0.85) {
              toward(C, P.craterFloor, 0.3 * (1 - t / 0.85) + 0.08);
              height -= 0.22 * (1 - t * t);
            } else if (t < 1.15) {
              const rim = 1 - Math.abs(t - 1) / 0.15;
              toward(C, P.craterRim, rim * 0.22);
              height += 0.18 * rim;
            }
          }
          rough = 0.95;
          break;
        }
        case 'lava': {
          const crust = fbm(n, x * 4, y * 4, z * 4, 3);
          const wx = fbm(n2, x * 1.5, y * 1.5, z * 1.5, 2) - 0.5;
          const r = ridge(fbm(n, x * 2.4 + wx * 2, y * 2.4 - wx, z * 2.4 + wx * 1.5, 4));
          const crack = smoothstep(0.91, 0.978, r);
          const heat = smoothstep(0.8, 0.978, r);
          set(C, P.crustDark);
          toward(C, P.crustLight, crust);
          toward(C, accent, crack * 0.9);
          glowT = clamp01(crack * 0.9 + heat * 0.12);
          height = 0.6 - crack * 0.45 + crust * 0.15;
          break;
        }
        case 'ice': {
          const f = fbm(n, x * 2, y * 2, z * 2, 4);
          const band = 0.5 + 0.5 * Math.sin(lat * 7 + f * 5);
          set(C, P.iceDark);
          toward(C, P.iceLight, f * 0.7 + band * 0.3);
          const r = ridge(fbm(n2, x * 3.2, y * 3.2, z * 3.2, 4));
          const crack = smoothstep(0.945, 0.99, r);
          toward(C, P.iceCrack, crack * 0.7);
          height = 0.55 - crack * 0.3 + f * 0.1;
          for (const k of crater) {
            const d = x * k.x + y * k.y + z * k.z;
            if (d < k.cos) continue;
            const t = Math.acos(d > 1 ? 1 : d) / k.r;
            if (t < 1) {
              toward(C, P.iceFrost, 0.35 * (1 - t));
              height -= 0.1 * (1 - t);
            }
          }
          rough = 0.6;
          break;
        }
        case 'metal': {
          // Panels on a lat/long grid, each its own shade; seams between them; a few lit.
          const pu = (lon / (Math.PI * 2)) * 48;
          const pv = ((lat + Math.PI / 2) / Math.PI) * 24;
          const cu = Math.floor(pu);
          const cv = Math.floor(pv);
          const fu = pu - cu;
          const fv = pv - cv;
          const cellRand = n(cu * 1.7, cv * 2.3, 0.5);
          const brushed = n2(x * 2, y * 60, z * 2);
          set(C, shadeInto(G, base, (cellRand - 0.5) * 0.36 + (brushed - 0.5) * 0.08));
          const seamDist = Math.min(fu, 1 - fu, fv * 2, (1 - fv) * 2);
          const line = 1 - smoothstep(0.02, 0.06, seamDist);
          toward(C, P.seam, line * 0.8);
          height = 0.6 - line * 0.5 + (cellRand - 0.5) * 0.1;
          if (lights[cu + cv * 48] && fu > 0.4 && fu < 0.6 && fv > 0.42 && fv < 0.58) {
            set(C, P.window);
            glowT = 1;
            glowColor = P.windowGlow;
          }
          // A trench around the equator: the one thing that tells you it was built.
          const trench = 1 - smoothstep(0.015, 0.03, Math.abs(y));
          toward(C, P.trench, trench);
          height -= trench * 0.3;
          break;
        }
        case 'gas': {
          const wx = fbm(n2, x * 1.4, y * 1.4, z * 1.4, 4);
          const t = 0.5 + 0.5 * Math.sin(lat * 11 + wx * 7);
          const fine = fbm(n, x * 3, y * 18, z * 3, 3);
          set(C, P.gasDark);
          toward(C, base, t);
          set(G, accent);
          toward(G, P.gasLight, fine);
          toward(C, G, smoothstep(0.55, 0.95, t * 0.7 + fine * 0.4));
          break;
        }
      }

      const i = (row * w + col) * 4;
      map[i] = C[0]!;
      map[i + 1] = C[1]!;
      map[i + 2] = C[2]!;
      map[i + 3] = 255;
      if (bump) {
        const v = clamp01(height) * 255;
        bump[i] = v;
        bump[i + 1] = v;
        bump[i + 2] = v;
        bump[i + 3] = 255;
      }
      if (roughness) {
        const v = rough * 255;
        roughness[i] = v;
        roughness[i + 1] = v;
        roughness[i + 2] = v;
        roughness[i + 3] = 255;
      }
      if (emissive) {
        emissive[i] = glowColor[0]! * glowT;
        emissive[i + 1] = glowColor[1]! * glowT;
        emissive[i + 2] = glowColor[2]! * glowT;
        emissive[i + 3] = 255;
      }
      if (clouds) {
        clouds[i] = 255;
        clouds[i + 1] = 255;
        clouds[i + 2] = 255;
        clouds[i + 3] = cloudA * 255;
      }
    }
  }

  return { width: w, height: h, map, bump, roughness, emissive, clouds };
}

/** `shade` without the allocation, for the one place it has to run per pixel. */
function shadeInto(out: Float32Array, c: RGB, amount: number): RGB {
  const target = amount >= 0 ? 255 : 0;
  const t = Math.abs(amount);
  out[0] = c[0]! + (target - c[0]!) * t;
  out[1] = c[1]! + (target - c[1]!) * t;
  out[2] = c[2]! + (target - c[2]!) * t;
  return out;
}
