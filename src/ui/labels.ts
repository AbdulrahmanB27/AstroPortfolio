import { PerspectiveCamera, Vector3 } from 'three'
import { STAR_POS, STAR_R, STAR_SYSTEM_SCALE } from '../world/constants'
import { systemRefs } from '../world/orbits'

/**
 * Planet labels are real DOM, but they are positioned imperatively every frame from the render loop
 * (no React state). Greedy placement with priorities keeps them off the star, planets and each other.
 */
interface Entry {
  el: HTMLElement
  line: HTMLElement
  w: number
  h: number
  slot: number
  featured: boolean
}
interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

const entries = new Map<string, Entry>()
/** Last projected planet discs (screen px), also used by the QA scripts to aim real pointer input. */
export const screenDiscs = new Map<string, { x: number; y: number; r: number }>()
const v = new Vector3()
const HOME_ID = '__home'

export function registerLabel(id: string, el: HTMLElement, line: HTMLElement, featured: boolean) {
  entries.set(id, { el, line, w: el.offsetWidth || 120, h: el.offsetHeight || 34, slot: -1, featured })
}
export function unregisterLabel(id: string) {
  entries.delete(id)
}
export function remeasureLabels() {
  entries.forEach((e) => {
    e.w = e.el.offsetWidth || e.w
    e.h = e.el.offsetHeight || e.h
  })
}

const overlaps = (a: Rect, b: Rect, pad = 4) => a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.y0 < b.y1 + pad && a.y1 > b.y0 - pad

function project(cam: PerspectiveCamera, p: Vector3, w: number, h: number) {
  v.copy(p).project(cam)
  return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, front: v.z < 1 && v.z > -1 }
}

/** Pixel radius of a sphere of world radius r at world position p. */
export function pixelRadius(cam: PerspectiveCamera, p: Vector3, r: number, h: number) {
  const d = cam.position.distanceTo(p)
  return (r / (d * Math.tan((cam.fov * Math.PI) / 360))) * (h / 2)
}

// candidate anchors: [dx sign, dy sign, extra distance in px]. Near corners first, then further out.
const SLOTS: [number, number, number][] = [
  [1, -1, 0],
  [1, 1, 0],
  [-1, -1, 0],
  [-1, 1, 0],
  [1, -1, 34],
  [-1, -1, 34],
  [1, 1, 34],
  [-1, 1, 34],
  [1, 0, 0],
  [-1, 0, 0],
  [1, 0, 40],
  [-1, 0, 40],
  [1, -1, 72],
  [-1, 1, 72],
]

export function updateLabels(cam: PerspectiveCamera, w: number, h: number, opts: { show: boolean; hoverId: string | null; focusId: string | null; shipClear?: boolean }) {
  const taken: Rect[] = []
  // in flight the ship sits low in the middle of the frame: callouts stay off it
  if (opts.shipClear) taken.push({ x0: w / 2 - 130, y0: h * 0.62, x1: w / 2 + 130, y1: h * 0.84 })
  const discs: { id: string; x: number; y: number; r: number; rp: number; front: boolean }[] = []
  // the star is an obstacle
  const sp = project(cam, STAR_POS, w, h)
  const sr = pixelRadius(cam, STAR_POS, STAR_R * STAR_SYSTEM_SCALE * 1.2, h)
  taken.push({ x0: sp.x - sr, y0: sp.y - sr, x1: sp.x + sr, y1: sp.y + sr })
  systemRefs.world.forEach((b, id) => {
    const s = project(cam, b.pos, w, h)
    // ringed planets claim their ring's footprint, so callouts never sit on it
    const rp = Math.max(4, pixelRadius(cam, b.pos, b.radius, h))
    const r = b.ring && !opts.shipClear ? rp * 2 : rp
    discs.push({ id, x: s.x, y: s.y, r, rp, front: s.front })
    screenDiscs.set(id, { x: s.x, y: s.y, r })
  })
  if (!opts.show) {
    entries.forEach((e) => {
      if (e.el.style.opacity !== '0') {
        e.el.style.opacity = '0'
        e.line.style.opacity = '0'
        e.el.style.pointerEvents = 'none'
      }
    })
    return
  }
  const order = discs
    .filter((d) => entries.has(d.id))
    .sort((a, b) => {
      // the home planet's callout is the way back to the surface: it is placed before the others
      const pa = (a.id === opts.hoverId ? 1000 : 0) + (a.id === HOME_ID ? 500 : 0) + (entries.get(a.id)!.featured ? 100 : 0) + a.r
      const pb = (b.id === opts.hoverId ? 1000 : 0) + (b.id === HOME_ID ? 500 : 0) + (entries.get(b.id)!.featured ? 100 : 0) + b.r
      return pb - pa
    })
  const discRects = discs.map((d) => ({ id: d.id, rect: { x0: d.x - d.r, y0: d.y - d.r, x1: d.x + d.r, y1: d.y + d.r } }))

  for (const d of order) {
    const e = entries.get(d.id)!
    const hovered = d.id === opts.hoverId
    let placed: { x: number; y: number; slot: number } | null = null
    if (d.front && d.x > -40 && d.x < w + 40 && d.y > -40 && d.y < h + 40) {
      const all = SLOTS.map((_, i) => i)
      const tryOrder = e.slot >= 0 ? [e.slot, ...all.filter((s) => s !== e.slot)] : all
      for (const s of tryOrder) {
        const [sx, sy, far] = SLOTS[s]
        // small number badges (phones) sit right on the limb; full callouts keep a leader's length away
        const tight = e.w < 44
        const off = tight ? d.r * 0.72 + 2 + far * 0.5 : d.r * 0.74 + 14 + far
        const reach = sy === 0 ? (tight ? d.r + 3 + far * 0.5 : d.r + 12 + far) : off
        const x = sx > 0 ? d.x + reach : d.x - reach - e.w
        const y = sy === 0 ? d.y - e.h * 0.5 : sy < 0 ? d.y - off * (far ? 0.8 : 1) - e.h * 0.5 : d.y + off * (far ? 0.8 : 1) - e.h * 0.5
        const rect = { x0: x, y0: y, x1: x + e.w, y1: y + e.h }
        if (rect.x0 < 10 || rect.x1 > w - 10 || rect.y0 < 64 || rect.y1 > h - 56) continue
        if (taken.some((t) => overlaps(rect, t))) continue
        if (discRects.some((o) => o.id !== d.id && overlaps(rect, o.rect, 2))) continue
        placed = { x, y, slot: s }
        taken.push(rect)
        break
      }
      // ...and is shown even when no free slot is left
      if (!placed && (hovered || d.id === HOME_ID)) {
        const x = Math.min(w - e.w - 10, Math.max(10, d.x + d.r + 14))
        const y = Math.min(h - e.h - 56, Math.max(64, d.y - d.r - e.h))
        placed = { x, y, slot: 0 }
      }
    }
    if (!placed) {
      e.el.style.opacity = '0'
      e.line.style.opacity = '0'
      e.el.style.pointerEvents = 'none'
      e.slot = -1
      continue
    }
    e.slot = placed.slot
    const dim = opts.hoverId && !hovered ? 0.34 : opts.focusId ? 0 : opts.shipClear ? 0.6 : 1
    e.el.style.opacity = String(dim)
    e.el.style.pointerEvents = dim > 0.2 ? 'auto' : 'none'
    e.el.style.transform = `translate3d(${placed.x.toFixed(1)}px, ${placed.y.toFixed(1)}px, 0)`
    e.el.dataset.side = SLOTS[placed.slot][0] > 0 ? 'right' : 'left'
    // leader from the label's inner edge to the planet's limb
    const ax = SLOTS[placed.slot][0] > 0 ? placed.x - 6 : placed.x + e.w + 6
    const ay = placed.y + e.h * 0.5
    const dx = d.x - ax
    const dy = d.y - ay
    const len = Math.max(0, Math.hypot(dx, dy) - d.rp - 3)
    e.line.style.opacity = String(dim * 0.9)
    e.line.style.width = `${len.toFixed(1)}px`
    e.line.style.transform = `translate3d(${ax.toFixed(1)}px, ${ay.toFixed(1)}px, 0) rotate(${Math.atan2(dy, dx).toFixed(4)}rad)`
  }
}
