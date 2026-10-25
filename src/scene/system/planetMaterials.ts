import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DataTexture,
  FrontSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
} from 'three';
import type { PlanetStyle } from '../../data/schema';
import { mulberry32 } from '../../lib/noise';
import { generatePlanetSurface, makeNoise, type SurfaceData, type SurfaceRequest } from './planetSurface';

/**
 * Planet materials: the surface recipes live in `planetSurface.ts` and run in a worker; this
 * file turns their pixels into textures and hangs them on materials.
 *
 * A planet is drawn immediately in its flat base colour and picks up its surface when the
 * worker delivers it, a fraction of a second later. On the home planet the system is not on
 * screen at all, so in practice nobody sees the hand-over.
 */

// ---------------------------------------------------------------------------
// Worker plumbing
// ---------------------------------------------------------------------------

let worker: Worker | null | undefined;
let nextId = 1;
const waiting = new Map<number, { request: SurfaceRequest; resolve: (s: SurfaceData) => void }>();

/** Without a worker the work still has to happen; one planet per task keeps frames short. */
function generateSoon(request: SurfaceRequest, resolve: (s: SurfaceData) => void): void {
  setTimeout(() => resolve(generatePlanetSurface(request)), 0);
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./planetSurface.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; surface: SurfaceData }>) => {
      const job = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      job?.resolve(e.data.surface);
    };
    // A worker that cannot load (a strict CSP, an old browser) fails here, asynchronously.
    // Everything it was holding is redone on the main thread, and nothing is sent to it again.
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      for (const job of waiting.values()) generateSoon(job.request, job.resolve);
      waiting.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function requestSurface(request: SurfaceRequest): Promise<SurfaceData> {
  return new Promise((resolve) => {
    const w = getWorker();
    if (!w) return generateSoon(request, resolve);
    const id = nextId++;
    waiting.set(id, { request, resolve });
    w.postMessage({ id, ...request });
  });
}

function dataTexture(data: Uint8Array, width: number, height: number, srgb: boolean): DataTexture {
  const tex = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
  tex.wrapS = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Planet look
// ---------------------------------------------------------------------------

/** How hard each style's relief reads. Bump is screen-space, so these are tuned by eye. */
const BUMP: Record<PlanetStyle, number> = { terra: 1.2, ocean: 0.8, rocky: 2.6, lava: 2.2, ice: 1.1, metal: 1.6, gas: 0 };

export interface PlanetLook {
  material: MeshStandardMaterial;
  /** The weather layer, for the styles that have one; transparent until its texture lands. */
  cloudMaterial: MeshStandardMaterial | null;
  dispose(): void;
}

export function createPlanetLook(style: PlanetStyle, colorHex: string, accentHex: string | undefined, seed: number, width = 512): PlanetLook {
  const material = new MeshStandardMaterial({ color: colorHex, roughness: 0.92, metalness: 0 });
  switch (style) {
    // A planet is not a polished sphere: these stay rough enough that the star makes a broad
    // terminator rather than a tight plastic hotspot.
    case 'ice':
      material.roughness = 0.55;
      material.metalness = 0.04;
      break;
    case 'metal':
      material.roughness = 0.42;
      material.metalness = 0.6;
      break;
    case 'gas':
      material.roughness = 0.78;
      break;
  }
  const hasClouds = style === 'ocean' || style === 'terra';
  const cloudMaterial = hasClouds
    ? new MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, roughness: 1, metalness: 0 })
    : null;

  const textures: Texture[] = [];

  void requestSurface({ style, color: colorHex, accent: accentHex, seed, width }).then((s) => {
    const make = (data: Uint8Array | undefined, srgb: boolean) => {
      if (!data) return null;
      const tex = dataTexture(data, s.width, s.height, srgb);
      textures.push(tex);
      return tex;
    };
    const map = make(s.map, true);
    const bump = make(s.bump, false);
    const rough = make(s.roughness, false);
    const emissive = make(s.emissive, true);
    const clouds = make(s.clouds, true);
    // Dressed even if the planet unmounted while the worker was busy: a texture is uploaded on
    // first draw, so one on a material nobody draws costs nothing and goes with it. (Bailing
    // out here instead left every planet flat in development, where StrictMode runs each
    // cleanup once on mount.)
    material.map = map;
    // The map carries the colour now; the flat colour was the stand-in.
    material.color.set('#ffffff');
    if (bump) {
      material.bumpMap = bump;
      material.bumpScale = BUMP[style];
    }
    if (rough) {
      // The map carries the contrast between sea and land; the scalar is the ceiling.
      material.roughnessMap = rough;
      material.roughness = 1;
    }
    if (emissive) {
      material.emissiveMap = emissive;
      material.emissive = new Color('#ffffff');
      material.emissiveIntensity = style === 'lava' ? 1.0 : 1.1;
    }
    material.needsUpdate = true;
    if (cloudMaterial && clouds) {
      cloudMaterial.map = clouds;
      cloudMaterial.opacity = 1;
      cloudMaterial.needsUpdate = true;
    }
  });

  return {
    material,
    cloudMaterial,
    dispose() {
      // three re-uploads a disposed resource on its next draw, so this is safe to call on a
      // look that is still mounted — which StrictMode does.
      textures.forEach((t) => t.dispose());
      material.dispose();
      cloudMaterial?.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Atmosphere
// ---------------------------------------------------------------------------

/** Which styles carry an atmosphere, and how much of one. Bare rock and metal do not. */
export const ATMOSPHERE: Partial<Record<PlanetStyle, number>> = { terra: 0.85, ocean: 1, ice: 0.6, gas: 0.9, lava: 0.45 };

const atmosphereVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const atmosphereFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPosW);
    // The star is the origin of the world, so the light direction is free.
    vec3 l = normalize(-vPosW);
    float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.6);
    // Only the lit limb scatters: a glow all the way round reads as a selection outline.
    float day = smoothstep(-0.3, 0.55, dot(n, l));
    float a = rim * day * uStrength;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/**
 * The thin bright limb a world with air has on its sunlit side. A shell a few percent larger
 * than the body, additive, brightest where the view grazes it and fading out round the
 * terminator, so it reads as scattered light rather than as an outline.
 */
export function atmosphereMaterial(colorHex: string, strength: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: atmosphereVertex,
    fragmentShader: atmosphereFragment,
    uniforms: { uColor: { value: new Color(colorHex).lerp(new Color('#ffffff'), 0.25) }, uStrength: { value: strength } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: FrontSide,
  });
}

// ---------------------------------------------------------------------------
// Moons and rings
// ---------------------------------------------------------------------------

let moonSurface: Promise<DataTexture> | null = null;

/**
 * One cratered grey surface shared by every moon, tinted per planet through the material's
 * colour. Requested once and kept: there are only ever a handful of moons.
 */
export function sharedMoonTexture(): Promise<DataTexture> {
  moonSurface ??= requestSurface({ style: 'rocky', color: '#b9b9b9', accent: '#e6e6e6', seed: 4242, width: 256 }).then((s) =>
    dataTexture(s.map, s.width, s.height, true),
  );
  return moonSurface;
}

/** Ring band texture: soft edges, a few gaps, and fine ringlets across the band. */
export function buildRingTexture(colorHex: string, seed: number): CanvasTexture {
  const w = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = 2;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, 2);
  const rand = mulberry32(seed);
  const n = makeNoise(seed);
  const base = new Color(colorHex);
  const white = new Color('#ffffff');
  const c = new Color();
  const gapA = 0.38 + rand() * 0.08;
  const gapB = 0.7 + rand() * 0.06;
  for (let x = 0; x < w; x++) {
    const t = x / w;
    let a = Math.pow(Math.sin(t * Math.PI), 0.7) * 0.9;
    if (Math.abs(t - gapA) < 0.025) a *= 0.12;
    if (Math.abs(t - gapB) < 0.012) a *= 0.3;
    // Ringlets: fine structure across the whole band, so it is not one smooth gradient.
    const ringlet = n(t * 90, 0.5, 0.5);
    a *= 0.55 + ringlet * 0.45;
    c.copy(base).lerp(white, 0.25 + t * 0.25 + (ringlet - 0.5) * 0.15);
    for (let y = 0; y < 2; y++) {
      const i = (y * w + x) * 4;
      img.data[i] = Math.round(c.r * 255);
      img.data[i + 1] = Math.round(c.g * 255);
      img.data[i + 2] = Math.round(c.b * 255);
      img.data[i + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}
