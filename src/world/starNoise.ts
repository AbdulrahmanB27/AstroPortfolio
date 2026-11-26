import * as THREE from 'three'

/**
 * One small tiling texture that the star's surface and corona read instead of evaluating noise per pixel
 * (texture lookups compile instantly and cost a fraction of analytic noise over a disc that fills the sky).
 *   R  fine convection cells: 1 inside a cell, falling to 0 in the thin lanes between cells
 *   G  soft cloudy noise (large-scale mottling, corona streamers)
 *   B  coarse cells, same convention as R (their borders carry the bright network)
 */
const SIZE = 512

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Tiling cellular pattern: per pixel, distance to the nearest and second nearest of n x n jittered points. */
function cells(n: number, seed: number, lane: number, out: Float32Array) {
  const r = rng(seed)
  const px = new Float32Array(n * n)
  const py = new Float32Array(n * n)
  const tone = new Float32Array(n * n)
  for (let i = 0; i < n * n; i++) {
    px[i] = r()
    py[i] = r()
    tone[i] = 0.78 + 0.22 * r()
  }
  for (let y = 0; y < SIZE; y++) {
    const v = (y / SIZE) * n
    const cy = Math.floor(v)
    for (let x = 0; x < SIZE; x++) {
      const u = (x / SIZE) * n
      const cx = Math.floor(u)
      let d1 = 9
      let d2 = 9
      let t1 = 1
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const gx = cx + i
          const gy = cy + j
          const k = ((gy + n) % n) * n + ((gx + n) % n)
          const dx = gx + px[k] - u
          const dy = gy + py[k] - v
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < d1) {
            d2 = d1
            d1 = d
            t1 = tone[k]
          } else if (d < d2) d2 = d
        }
      }
      const e = Math.min(1, Math.max(0, (d2 - d1 - 0.015) / lane))
      out[y * SIZE + x] = e * e * (3 - 2 * e) * t1
    }
  }
}

/** Tiling value noise, a few octaves. */
function clouds(seed: number, out: Float32Array) {
  const r = rng(seed)
  let amp = 0.5
  let total = 0
  out.fill(0)
  for (let period = 4; period <= 64; period *= 2) {
    const g = new Float32Array(period * period)
    for (let i = 0; i < g.length; i++) g[i] = r()
    for (let y = 0; y < SIZE; y++) {
      const v = (y / SIZE) * period
      const y0 = Math.floor(v)
      const fy = v - y0
      const sy = fy * fy * (3 - 2 * fy)
      for (let x = 0; x < SIZE; x++) {
        const u = (x / SIZE) * period
        const x0 = Math.floor(u)
        const fx = u - x0
        const sx = fx * fx * (3 - 2 * fx)
        const a = g[(y0 % period) * period + (x0 % period)]
        const b = g[(y0 % period) * period + ((x0 + 1) % period)]
        const c = g[((y0 + 1) % period) * period + (x0 % period)]
        const d = g[((y0 + 1) % period) * period + ((x0 + 1) % period)]
        out[y * SIZE + x] += (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * amp
      }
    }
    total += amp
    amp *= 0.5
  }
  for (let i = 0; i < out.length; i++) out[i] /= total
}

let cached: THREE.DataTexture | null = null

export function starNoise(): THREE.DataTexture {
  if (cached) return cached
  const fine = new Float32Array(SIZE * SIZE)
  const coarse = new Float32Array(SIZE * SIZE)
  const soft = new Float32Array(SIZE * SIZE)
  cells(22, 7, 0.58, fine)
  cells(8, 31, 0.5, coarse)
  clouds(113, soft)
  const data = new Uint8Array(SIZE * SIZE * 4)
  for (let i = 0; i < SIZE * SIZE; i++) {
    data[i * 4] = Math.round(fine[i] * 255)
    data[i * 4 + 1] = Math.round(soft[i] * 255)
    data[i * 4 + 2] = Math.round(coarse[i] * 255)
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 4
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  cached = tex
  return tex
}
