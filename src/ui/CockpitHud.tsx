import { useEffect } from 'react';
import { useApp } from '../state/store';
import { exitCockpit } from '../sequences';

/**
 * The one control the cabin needs.
 *
 * With the reading moved to a flat surface, the cabin view is four displays and nothing else —
 * and the only chrome in it used to be the reader's own header, which is not mounted here. So
 * there was no way out of the cockpit at all unless you first opened a section: the owner found
 * that before any check did, because nothing here tests for the absence of a control.
 *
 * `docs/ART_DIRECTION.md` allows exactly this much: "No text outside the screens except the
 * exit control." One pill, bottom left, in the same form and at the same inset as every other
 * piece of persistent chrome in the product. Escape does the same thing from the keyboard.
 */
export function CockpitHud() {
  const scene = useApp((s) => s.scene);
  const view = useApp((s) => s.cockpitView);
  const busy = useApp((s) => s.busy);
  const visible = scene === 'cockpit' && view === 'room' && !busy;

  /*
   * Escape leaves the rocket from here.
   *
   * The reader's own Escape steps back to the cabin, so in the cabin Escape has to do the next
   * thing out or the key stops working halfway. It lived on the reader before the reader moved
   * off the console, and moving it left the cabin with no keyboard exit at all — the same
   * absence as the missing pill, one layer down.
   */
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      exitCockpit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  return (
    <div className="cockpit-hud" data-visible={visible} aria-hidden={!visible}>
      <button type="button" className="pill" onClick={exitCockpit} tabIndex={visible ? 0 : -1}>
        <span aria-hidden="true">←</span> Leave the rocket
      </button>
      <p className="cockpit-hud__hint t-mono">Select a display to read</p>
    </div>
  );
}
