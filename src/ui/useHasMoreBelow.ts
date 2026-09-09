import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Whether a scroll container still has content below the fold.
 *
 * Both reading panels end in a fade. A fade that is always on does not say "there is more"
 * — it just dims the last two lines of every section, which measured as low as 1.42:1
 * against the panel fill on a phone, i.e. the writing the site exists to deliver was
 * being deleted rather than hinted at. Gating the fade (and a visible cue) on this means
 * the boundary only appears when it is telling the truth.
 *
 * Watches scroll, container resize and child resize, because the content's height changes
 * when a tab switches, an image decodes, or the viewport rotates.
 *
 * The container is attached through a **callback ref**, not a RefObject, and that is the
 * whole point of the design. A RefObject is null on the first effect run whenever the
 * element sits behind a conditional — the project panel renders its body only once a
 * project is selected — and nothing about a RefObject changes when the element later
 * appears, so the effect never re-runs and no listener is ever attached. The project panel
 * shipped that way: 687 px of a case study hidden below the fold with the fade off and the
 * cue hidden, because `bodyRef.current` was null on mount. The mission computer escaped it
 * only by accident, because its dependency list happened to include a flag that changed.
 * A callback ref fires when the node arrives, so the subscription cannot be missed.
 */
export function useHasMoreBelow<T extends HTMLElement>(deps: unknown[] = []) {
  const [el, setEl] = useState<T | null>(null);
  const [more, setMore] = useState(false);
  // Mirrors `el` for imperative reads (resetting scrollTop) without re-rendering.
  const current = useRef<T | null>(null);

  const ref = useCallback((node: T | null) => {
    current.current = node;
    setEl(node);
  }, []);

  useEffect(() => {
    if (!el) {
      setMore(false);
      return;
    }
    const update = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 2);
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, ...deps]);

  return { more, ref, current };
}
