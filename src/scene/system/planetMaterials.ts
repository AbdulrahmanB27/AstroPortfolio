import { CanvasTexture, Color, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import type { PlanetStyle } from '../../data/schema';
import { mulberry32 } from '../../lib/noise';

/**
 * Small procedural canvas textures give each planet style character without assets:
 * banded gas giants, mottled rocky worlds, glossy ice, cracked lava, brushed metal.
 */

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

function shade(base: Color, amount: number): string {
  const c = base.clone();
  if (amount >= 0) c.lerp(new Color('#ffffff'), amount);
  else c.lerp(new Color('#000000'), -amount);
  return `#${c.getHexString()}`;
}

export function buildPlanetTexture(style: PlanetStyle, colorHex: string, accentHex: string | undefined, seed: number): CanvasTexture {
  const w = 512;
  const h = 256;
  const { canvas, ctx } = makeCanvas(w, h);
  const base = new Color(colorHex);
  const accent = new Color(accentHex ?? shade(base, 0.35));
  const rand = mulberry32(seed);

  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, w, h);

  switch (style) {
    case 'gas':
    case 'ocean':
    case 'terra': {
      // Latitude bands with soft edges.
      const bands = style === 'gas' ? 14 : 7;
      for (let i = 0; i < bands; i++) {
        const y0 = (i / bands) * h;
        const bh = h / bands;
        const t = rand();
        ctx.fillStyle = shade(t > 0.5 ? accent : base, (rand() - 0.5) * (style === 'gas' ? 0.5 : 0.28));
        ctx.globalAlpha = 0.55;
        ctx.fillRect(0, y0, w, bh * (0.6 + rand() * 0.6));
      }
      ctx.globalAlpha = 1;
      if (style !== 'gas') {
        // Continents / islands.
        for (let i = 0; i < (style === 'terra' ? 26 : 12); i++) {
          const x = rand() * w;
          const y = h * 0.15 + rand() * h * 0.7;
          const r = 8 + rand() * (style === 'terra' ? 46 : 22);
          ctx.fillStyle = shade(style === 'terra' ? accent : base, style === 'terra' ? -0.15 : 0.22);
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.ellipse(x, y, r, r * (0.5 + rand() * 0.6), rand() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
          if (x + r > w) {
            ctx.beginPath();
            ctx.ellipse(x - w, y, r, r * 0.7, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }
      // Polar caps for terra/ocean.
      if (style !== 'gas') {
        const g = ctx.createLinearGradient(0, 0, 0, h * 0.14);
        g.addColorStop(0, 'rgba(255,255,255,0.75)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h * 0.14);
        const g2 = ctx.createLinearGradient(0, h, 0, h * 0.86);
        g2.addColorStop(0, 'rgba(255,255,255,0.75)');
        g2.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g2;
        ctx.fillRect(0, h * 0.86, w, h * 0.14);
      }
      break;
    }
    case 'rocky':
    case 'lava':
    case 'metal': {
      // Mottled speckle + craters/cracks.
      for (let i = 0; i < 900; i++) {
        const x = rand() * w;
        const y = rand() * h;
        const r = 1 + rand() * (style === 'metal' ? 2 : 6);
        ctx.fillStyle = shade(base, (rand() - 0.5) * 0.35);
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (style === 'rocky') {
        for (let i = 0; i < 22; i++) {
          const x = rand() * w;
          const y = rand() * h;
          const r = 6 + rand() * 18;
          ctx.strokeStyle = shade(base, 0.25);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = shade(base, -0.3);
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      if (style === 'lava') {
        ctx.strokeStyle = `#${accent.getHexString()}`;
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 40; i++) {
          let x = rand() * w;
          let y = rand() * h;
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (let k = 0; k < 6; k++) {
            x += (rand() - 0.5) * 60;
            y += (rand() - 0.5) * 40;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      if (style === 'metal') {
        for (let i = 0; i < 60; i++) {
          const y = rand() * h;
          ctx.fillStyle = shade(base, (rand() - 0.5) * 0.5);
          ctx.globalAlpha = 0.35;
          ctx.fillRect(0, y, w, 1 + rand() * 3);
        }
        ctx.globalAlpha = 1;
        // Panel seams.
        ctx.strokeStyle = shade(base, -0.45);
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 9; i++) {
          const x = (i / 9) * w + rand() * 20;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + (rand() - 0.5) * 30, h);
          ctx.stroke();
        }
      }
      break;
    }
    case 'ice': {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, shade(base, 0.55));
      g.addColorStop(0.5, `#${base.getHexString()}`);
      g.addColorStop(1, shade(base, 0.55));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = shade(accent, 0.2);
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.7;
      for (let i = 0; i < 70; i++) {
        let x = rand() * w;
        let y = rand() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += (rand() - 0.5) * 90;
          y += (rand() - 0.5) * 30;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export function planetMaterialFor(style: PlanetStyle, colorHex: string, accentHex: string | undefined, seed: number): MeshStandardMaterial {
  const map = buildPlanetTexture(style, colorHex, accentHex, seed);
  switch (style) {
    case 'ice':
      // A planet is not a polished sphere. At 0.28 the small non-featured bodies carried a
      // tight circular specular hotspot on a flat albedo and read as glossy plastic marbles —
      // closer to the cartoon the art direction rules out than the ringed and mooned ones,
      // which a reviewer singled out as looking genuinely good. Rougher turns the hotspot into
      // a broad terminator gradient, which is what reads as a body.
      return new MeshStandardMaterial({ map, roughness: 0.52, metalness: 0.04 });
    case 'ocean':
      return new MeshStandardMaterial({ map, roughness: 0.55, metalness: 0.06 });
    case 'metal':
      return new MeshStandardMaterial({ map, roughness: 0.42, metalness: 0.75 });
    case 'lava':
      return new MeshStandardMaterial({ map, roughness: 0.85, metalness: 0, emissive: new Color(accentHex ?? colorHex), emissiveIntensity: 0.22, emissiveMap: map });
    case 'gas':
      return new MeshStandardMaterial({ map, roughness: 0.75, metalness: 0 });
    default:
      return new MeshStandardMaterial({ map, roughness: 0.92, metalness: 0 });
  }
}

/** Ring band texture: soft inner edge, a couple of gaps, transparent outside. */
export function buildRingTexture(colorHex: string, seed: number): CanvasTexture {
  const w = 256;
  const { canvas, ctx } = makeCanvas(w, 2);
  const rand = mulberry32(seed);
  const base = new Color(colorHex);
  const img = ctx.createImageData(w, 2);
  for (let x = 0; x < w; x++) {
    const t = x / w;
    let a = Math.sin(t * Math.PI) * 0.9;
    // Gaps
    if (t > 0.42 && t < 0.47) a *= 0.2;
    if (t > 0.72 && t < 0.74) a *= 0.35;
    a *= 0.7 + rand() * 0.3;
    const c = base.clone().lerp(new Color('#ffffff'), 0.35 + t * 0.2);
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
