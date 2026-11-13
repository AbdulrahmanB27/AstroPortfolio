import { DataTexture, EquirectangularReflectionMapping, LinearFilter, SRGBColorSpace, Vector3 } from 'three';
import { STAGE_FRAME } from '../../lib/stageFrame';

/**
 * What the things standing on the surface reflect: a dark sky, the warm line of the horizon,
 * the lit ground, and the star.
 *
 * Without anything to reflect, a lit surface has only its direct light: the faces turned from
 * the star went flat and muddy, metal rendered as its highlight on black (the gold visor was a
 * dark-grey dome), and the white hull and suit had nothing to give them the soft gradients that
 * make a form read. The stage and the camera hold still, so a fixed picture of where they stand
 * is all the reflection they need: painted once into a small texture, in world space, and
 * shared by the rocket and the suit, rather than rendered by a cube camera every frame.
 */
function paint(toStar: Vector3, up: Vector3): DataTexture {
  const w = 256;
  const h = 128;
  const data = new Uint8Array(w * h * 4);
  const d = new Vector3();
  const mix = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
  for (let j = 0; j < h; j++) {
    // Row 0 is the bottom of the texture (DataTexture is not flipped): elevation -90 degrees.
    const lat = ((j + 0.5) / h - 0.5) * Math.PI;
    for (let i = 0; i < w; i++) {
      // The inverse of three's equirect lookup: u = atan2(z, x) / 2pi + 0.5, v = asin(y) / pi + 0.5.
      const lon = ((i + 0.5) / w - 0.5) * Math.PI * 2;
      d.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
      const e = d.dot(up);
      let r: number, g: number, b: number;
      if (e >= 0) {
        // Sky: a warm haze on the horizon, navy above it, near black overhead.
        const k = Math.pow(e, 0.45);
        r = mix(120, 8, k);
        g = mix(84, 12, k);
        b = mix(52, 26, k);
      } else {
        // Ground: lit regolith near the horizon, falling into shadow underfoot.
        const k = Math.pow(-e, 0.6);
        r = mix(96, 26, k);
        g = mix(72, 20, k);
        b = mix(50, 15, k);
      }
      // The star, and the glow it throws round itself.
      const s = d.dot(toStar);
      const core = Math.max(0, (s - 0.985) / 0.015);
      const halo = Math.pow(Math.max(0, s), 18) * 0.7;
      r = Math.min(255, r + 255 * (core + halo));
      g = Math.min(255, g + 230 * core + 170 * halo);
      b = Math.min(255, b + 200 * core + 90 * halo);
      const o = (j * w + i) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  const tex = new DataTexture(data, w, h);
  tex.mapping = EquirectangularReflectionMapping;
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

let shared: DataTexture | null = null;

/** The environment for anything on the surface stage. Built on first use and kept. */
export function stageEnvironment(): DataTexture {
  // The star sits at the world origin.
  shared ??= paint(STAGE_FRAME.origin.clone().negate().normalize(), STAGE_FRAME.up);
  return shared;
}
