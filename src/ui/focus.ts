import { useEffect, type RefObject } from 'react';

/**
 * Whether keyboard focus is stranded on something the visitor can no longer see.
 *
 * Every move in this site hides one surface and shows another without a page load, and the
 * control that started the move is usually on the surface that just went away. Its focus
 * stayed behind on an invisible, `aria-hidden` button: the next Tab went to whatever followed
 * it in the document, which was another hidden surface, and a screen reader announced nothing
 * about where it had arrived.
 *
 * `body` does not count. That is where focus sits on a fresh page load and after a click in
 * Safari, and pulling it onto a control there would paint a focus ring nobody asked for.
 */
export function focusIsStranded(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return false;
  if (!el.isConnected) return true;
  if (el.closest('[aria-hidden="true"]')) return true;
  if (el.getClientRects().length === 0) return true;
  return getComputedStyle(el).visibility === 'hidden';
}

/**
 * When `active` turns on, move stranded focus to `target`. Waits two frames so the surface's
 * own visibility rules have applied before anything is measured or focused.
 */
export function useRescueFocus(active: boolean, target: RefObject<HTMLElement | null> | (() => HTMLElement | null | undefined)): void {
  useEffect(() => {
    if (!active) return;
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        if (!focusIsStranded()) return;
        const el = typeof target === 'function' ? target() : target.current;
        el?.focus({ preventScroll: true });
      });
    });
    return () => cancelAnimationFrame(raf);
    // `target` is a ref or a lookup; only the transition into view matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
