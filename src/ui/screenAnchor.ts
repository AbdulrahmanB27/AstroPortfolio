import { Object3D, PerspectiveCamera, Vector3 } from 'three'

/**
 * Bolts a DOM element onto a physical screen mesh. The camera faces these screens head-on, so the
 * projected quad is an axis-aligned rectangle: the element is laid out at real pixel size (crisp text,
 * native scrolling) and simply follows the hardware. Updated from the render loop, never via React state.
 */
const els = new Map<string, HTMLElement>()
const a = new Vector3()
const b = new Vector3()
const c = new Vector3()

export function bindScreen(name: string, el: HTMLElement | null) {
  if (el) els.set(name, el)
  else els.delete(name)
}

/**
 * @param halfW / halfH half extents of the screen in the object's local XY plane (local +Z faces the viewer)
 * @param inset     fraction of the screen kept as margin inside the bezel
 */
export function updateScreen(name: string, obj: Object3D, cam: PerspectiveCamera, vw: number, vh: number, halfW: number, halfH: number, inset = 0, clampPad = -1) {
  const el = els.get(name)
  if (!el) return
  obj.updateWorldMatrix(true, false)
  const k = 1 - inset
  a.set(-halfW * k, halfH * k, 0).applyMatrix4(obj.matrixWorld).project(cam)
  b.set(halfW * k, -halfH * k, 0).applyMatrix4(obj.matrixWorld).project(cam)
  c.set(halfW * k, halfH * k, 0).applyMatrix4(obj.matrixWorld).project(cam)
  if (a.z > 1 || b.z > 1) {
    el.style.visibility = 'hidden'
    return
  }
  let x0 = (Math.min(a.x, b.x) * 0.5 + 0.5) * vw
  let x1 = (Math.max(a.x, b.x) * 0.5 + 0.5) * vw
  let y0 = (-Math.max(a.y, b.y, c.y) * 0.5 + 0.5) * vh
  let y1 = (-Math.min(a.y, b.y) * 0.5 + 0.5) * vh
  if (clampPad >= 0) {
    x0 = Math.max(x0, clampPad)
    x1 = Math.min(x1, vw - clampPad)
    y0 = Math.max(y0, clampPad)
    y1 = Math.min(y1, vh - clampPad)
  }
  const left = Math.round(x0)
  const top = Math.round(y0)
  const width = Math.round(x1 - x0)
  const height = Math.round(y1 - y0)
  const key = `${left},${top},${width},${height}`
  if (el.dataset.rect !== key) {
    el.dataset.rect = key
    el.style.transform = `translate3d(${left}px, ${top}px, 0)`
    el.style.width = `${width}px`
    el.style.height = `${height}px`
  }
  el.style.visibility = 'visible'
}
