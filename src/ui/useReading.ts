import { useEffect, type RefObject } from 'react'
import { app, useApp } from '../state/store'
import { director } from '../state/director'
import { fx } from '../world/rig'
import { screenDiscs } from './labels'

const INTERACTIVE = 'a, button, input, select, textarea, summary, [role="tab"]'
const SCROLL_KEYS = ['ArrowDown', 'PageDown', ' ', 'End']

/**
 * Zooming an in-world screen. From the establishing shot a display is a preview and does not scroll: the first
 * scroll, tap or click only pushes the camera in until the display fills the view. The page starts to move
 * once it has arrived. Scrolling up while already at the top, Escape or a click outside pulls back out.
 *
 * @param screen the display element
 * @param scroller the element inside it that scrolls
 * @param leave called for a click on empty space while the display is not zoomed (the project view steps
 *              back to the system); the body named by `keep` does not count as empty space
 */
export function useReading(
  screen: RefObject<HTMLElement | null>,
  scroller: RefObject<HTMLElement | null>,
  active: boolean,
  deps: unknown[] = [],
  leave?: { go: () => void; keep: string | null },
) {
  useEffect(() => {
    const el = screen.current
    const sc = scroller.current
    if (!el || !sc || !active) return
    let atTopSince = performance.now()
    // While the display shrinks back, the browser re-clamps its scroll position and fires scroll events.
    // Those are not the visitor asking to read again.
    let quietUntil = 0
    const unsubscribe = useApp.subscribe((now, before) => {
      if (before.reading && !now.reading) quietUntil = performance.now() + 950
    })
    const arrived = () => app().reading && fx.read > 0.985
    const zoomIn = () => {
      if (!app().reading) director.setReading(true)
    }

    // The scroll that asks for the zoom must not also move the page: it is swallowed until the display has
    // arrived and that same gesture (a wheel spin, a trackpad fling with its tail) has ended.
    let held = false
    let lastWheel = 0
    let arrivedAt = 0
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return // browser zoom
      const now = performance.now()
      const gap = now - lastWheel
      lastWheel = now
      if (!arrived()) {
        e.preventDefault()
        held = true
        arrivedAt = 0
        if (e.deltaY > 0) zoomIn()
        return
      }
      if (held) {
        if (!arrivedAt) arrivedAt = now
        if (gap < 140 && now - arrivedAt < 380) return e.preventDefault()
        held = false
      }
      // scrolling up while already resting at the top pulls back out (not the tail of a fling up the page)
      if (e.deltaY < 0 && sc.scrollTop <= 0 && now - atTopSince > 320) director.setReading(false)
    }
    const onScroll = () => {
      if (sc.scrollTop > 2 && performance.now() > quietUntil) zoomIn()
      if (sc.scrollTop > 0) atTopSince = performance.now()
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || e.target.closest(INTERACTIVE)) return
      zoomIn()
    }
    const onKey = (e: KeyboardEvent) => {
      if (!SCROLL_KEYS.includes(e.key) || e.target !== sc || arrived()) return
      e.preventDefault()
      zoomIn()
    }

    // Touch: the swipe that zooms does not scroll (the preview has touch-action none); a finger that lands
    // while the camera is still moving waits for it. Pulling down at the top of the page pulls back out.
    let touchY = 0
    let touchTop = 0
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? 0
      touchTop = sc.scrollTop
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!arrived()) {
        if (e.cancelable) e.preventDefault()
        return
      }
      const pulled = (e.touches[0]?.clientY ?? 0) - touchY
      if (touchTop <= 0 && sc.scrollTop <= 0 && pulled > 64) director.setReading(false)
    }

    // A click outside the display: pull back if zoomed, otherwise leave (where the view has a way to leave).
    // A press that began on the display (selecting text and letting go outside) is not a click outside.
    let pressedOutside = false
    let pressX = 0
    let pressY = 0
    const outside = (t: EventTarget | null) => t instanceof Element && !el.contains(t) && !t.closest('button, a')
    const onPress = (e: PointerEvent) => {
      pressedOutside = outside(e.target)
      pressX = e.clientX
      pressY = e.clientY
    }
    const onClick = (e: MouseEvent) => {
      if (!pressedOutside || !outside(e.target) || app().busy) return
      if (Math.hypot(e.clientX - pressX, e.clientY - pressY) > 8) return
      if (app().reading) return director.setReading(false)
      if (!leave) return
      const body = leave.keep ? screenDiscs.get(leave.keep) : null
      if (body && Math.hypot(e.clientX - body.x, e.clientY - body.y) <= body.r) return
      leave.go()
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    sc.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('pointerdown', onPointerDown)
    sc.addEventListener('keydown', onKey)
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('pointerdown', onPress)
    document.addEventListener('click', onClick)
    return () => {
      el.removeEventListener('wheel', onWheel)
      sc.removeEventListener('scroll', onScroll)
      el.removeEventListener('pointerdown', onPointerDown)
      sc.removeEventListener('keydown', onKey)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('pointerdown', onPress)
      document.removeEventListener('click', onClick)
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...deps])
}
