import { useEffect, type RefObject } from 'react'

/** Text blocks that must never be shown half cut by the bottom edge of a scrolling display. */
const BLOCKS = 'p, li, h2, h3, h4, dt, dd, figcaption, a.btn, button.btn'
const HEADING = /^H[2-4]$/

/**
 * Marks a scroll container with data-more="down" while there is content below the fold, and marks
 * any text block the fold would cut through with data-cut so it stays hidden until it fits whole.
 * A heading whose first item does not fit is held back with it, so no heading is left alone at the fold.
 * In-world screens therefore always end on a clean line, with an honest "more below" cue.
 */
export function useScrollCue(ref: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const update = () => {
      frame = 0
      const more = el.scrollHeight - el.clientHeight - el.scrollTop > 6
      el.dataset.more = more ? 'down' : 'none'
      const box = el.getBoundingClientRect()
      const tall = box.height * 0.6
      const blocks = Array.from(el.querySelectorAll<HTMLElement>(BLOCKS))
      const rects = blocks.map((b) => b.getBoundingClientRect())
      const cut = rects.map((r) => more && r.height < tall && r.top < box.bottom && r.bottom > box.bottom + 0.5)
      for (let i = 0; i < blocks.length - 1; i++) {
        if (!more || cut[i] || !HEADING.test(blocks[i].tagName) || rects[i].bottom > box.bottom) continue
        if (cut[i + 1] || rects[i + 1].top >= box.bottom - 1) cut[i] = true
      }
      blocks.forEach((block, i) => {
        if (cut[i] !== block.hasAttribute('data-cut')) block.toggleAttribute('data-cut', cut[i])
      })
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    el.addEventListener('scroll', schedule, { passive: true })
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    const timers = [window.setTimeout(update, 400), window.setTimeout(update, 900)]
    return () => {
      timers.forEach((t) => window.clearTimeout(t))
      if (frame) cancelAnimationFrame(frame)
      el.removeEventListener('scroll', schedule)
      ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
